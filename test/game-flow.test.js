const test = require('node:test');
const assert = require('node:assert/strict');

const { rooms, sessions, wsManager } = require('../server/state');
const GameRoom = require('../server/game/entities/gameRoom');
const { Player } = require('../server/game/entities/player');
const {
  handleJoin,
  handleRejoin,
  handleLeave,
  handleToggleVotingProposal,
  handleVote,
  handleKick,
  handleUpdateRoomSettings,
} = require('../server/ws/gameHandlers');
const { botFoodSelection } = require('../server/ws/bunkerLifeHandlers');

function socket() {
  return { readyState: 1, messages: [], send(raw) { this.messages.push(JSON.parse(raw)); }, close() {} };
}

function cleanRoom(room) {
  rooms.delete(room.roomCode);
  wsManager.dropRoom(room.roomCode);
}

test('bots select professions for food replenishment without a living human', () => {
  const bot = new Player('Bot');
  bot.is_bot = true;
  bot.profession = { id: 'scout', levelId: 'novice' };
  const deadHuman = new Player('Dead');
  deadHuman.is_active = false;
  const room = new GameRoom(bot.id);
  room.players = [bot, deadHuman];

  assert.deepEqual(botFoodSelection(room), { selected_professions: [bot.id], selected_items: [] });
});

test('join rejects duplicate nicknames case-insensitively and rejoin keeps identity', () => {
  const firstWs = socket();
  const joined = handleJoin(firstWs, { nickname: 'Alice' });
  const room = rooms.get(joined.roomCode);
  const token = firstWs.messages.find(message => message.type === 'joined').token;
  assert.throws(() => handleJoin(socket(), { nickname: 'aLiCe', room_code: room.roomCode }), /занят/);

  const secondWs = socket();
  assert.deepEqual(handleRejoin(secondWs, { token }), joined);
  assert.equal(room.players.length, 1);
  cleanRoom(room);
});

test('explicit leave removes lobby player, preserves started player as left, and invalidates session', () => {
  const waitingWs = socket();
  const waitingJoin = handleJoin(waitingWs, { nickname: 'LobbyUser' });
  const waitingRoom = rooms.get(waitingJoin.roomCode);
  const waitingToken = waitingWs.messages.find(message => message.type === 'joined').token;
  handleLeave(waitingRoom.roomCode, waitingJoin.playerId);
  assert.equal(sessions.get(waitingToken), null);

  const startedWs = socket();
  const startedJoin = handleJoin(startedWs, { nickname: 'StartedUser' });
  const startedRoom = rooms.get(startedJoin.roomCode);
  const observer = new Player('Observer');
  startedRoom.addPlayer(observer);
  wsManager.connect(startedRoom.roomCode, observer.id, socket());
  startedRoom.status = 'running';
  handleLeave(startedRoom.roomCode, startedJoin.playerId);
  assert.equal(startedRoom.getPlayer(startedJoin.playerId).participation_status, 'left');
  assert.ok(Object.values(startedRoom.getPlayer(startedJoin.playerId).revealed_attributes).every(Boolean));
  cleanRoom(startedRoom);
});

test('kick retains a revealed spectator and invalidates gameplay participation', () => {
  const room = new GameRoom('placeholder');
  const admin = new Player('Admin');
  const target = new Player('Target');
  room.adminId = admin.id;
  room.addPlayer(admin);
  room.addPlayer(target);
  room.status = 'running';
  rooms.set(room.roomCode, room);
  handleKick(room.roomCode, admin.id, { player_id: target.id });
  assert.equal(target.participation_status, 'kicked');
  assert.equal(room.players.length, 2);
  assert.ok(Object.values(target.revealed_attributes).every(Boolean));
  cleanRoom(room);
});

test('kick removes a player from the lobby', () => {
  const room = new GameRoom('placeholder');
  const admin = new Player('Admin');
  const target = new Player('Target');
  room.adminId = admin.id;
  room.addPlayer(admin);
  room.addPlayer(target);
  rooms.set(room.roomCode, room);
  handleKick(room.roomCode, admin.id, { player_id: target.id });
  assert.equal(room.getPlayer(target.id), null);
  cleanRoom(room);
});

test('only the lobby admin can update validated room settings', () => {
  const admin = new Player('Admin');
  const guest = new Player('Guest');
  const room = new GameRoom(admin.id);
  room.addPlayer(admin);
  room.addPlayer(guest);
  rooms.set(room.roomCode, room);
  // Preserve the pack's month duration to verify that unrelated setting
  // changes work even when the pack uses a value below the old 10-second floor.
  const settings = { ...room.settings, fill_with_bots: false, ai_enabled: false, event_frequency: 0.35, capacity_mode: 'manual', manual_capacity: 3 };
  handleUpdateRoomSettings(room.roomCode, guest.id, { settings });
  assert.notEqual(room.settings.event_frequency, 0.35);
  handleUpdateRoomSettings(room.roomCode, admin.id, { settings });
  assert.deepEqual(room.settings, settings);
  handleUpdateRoomSettings(room.roomCode, admin.id, { settings: { ...settings, event_frequency: 2 } });
  assert.deepEqual(room.settings, settings);
  cleanRoom(room);
});

test('unanimous proposal starts a secret ballot, votes can change, and first tie starts runoff', () => {
  const players = ['A', 'B', 'C', 'D'].map(name => new Player(name));
  const room = new GameRoom(players[0].id);
  room.players = players;
  room.status = 'running';
  rooms.set(room.roomCode, room);
  for (const player of players) wsManager.connect(room.roomCode, player.id, socket());

  for (const player of players) handleToggleVotingProposal(room.roomCode, player.id);
  assert.equal(room.voting.phase, 'ballot');

  handleVote(room.roomCode, players[0].id, { target_id: players[1].id });
  handleVote(room.roomCode, players[0].id, { target_id: players[2].id });
  assert.equal(room.votes[players[0].id], players[2].id);
  const snapshot = room.toDict(players[1].id);
  assert.deepEqual(snapshot.votes, {});
  assert.equal(snapshot.voting.my_vote, null);

  handleVote(room.roomCode, players[1].id, { target_id: players[2].id });
  handleVote(room.roomCode, players[2].id, { target_id: players[0].id });
  handleVote(room.roomCode, players[3].id, { target_id: players[0].id });
  assert.equal(room.voting.phase, 'ballot');
  assert.equal(room.voting.roundKind, 'runoff');
  assert.deepEqual(new Set(room.voting.candidateIds), new Set([players[0].id, players[2].id]));
  cleanRoom(room);
});
