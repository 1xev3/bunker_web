const { randomUUID } = require('crypto');
const { rooms, sessions, wsManager, pendingAdminTransfers } = require('../state');
const { Player, publicAttribute, ATTRIBUTE_KEYS } = require('../game/entities/player');
const { applyProfessionAbility } = require('../game/abilities/professionAbilities');
const { getDefaultPackName } = require('../game/gameConfig');
const GameRoom = require('../game/entities/gameRoom');
const { confirmBotsForBunkerLife, tryStartBunkerLife } = require('./bunkerLifeHandlers');
const { isAiAvailable } = require('../ai');

// Сообщение о раскрытии атрибута. Когда раскрывается пол, прикладываем ФИО,
// иначе у других игроков оно не появится (точечный патч не несёт full_name).
function attributeRevealedMsg(player, attr, config) {
  return {
    type: 'attribute_revealed',
    player_id: player.id,
    attribute: attr,
    value: publicAttribute(attr, player[attr], config),
    ...(attr === 'gender' ? { full_name: player.full_name } : {}),
  };
}

const DEV_MIN_PLAYERS = Number.parseInt(process.env.DEV_MIN_PLAYERS ?? '4', 10);
const DEV_BOT_NAMES = ['Котакбас', 'Ванючка', 'Бабаджон', 'Пельмень', 'Станис', 'Казел', 'upinexo'];

function handleJoin(ws, msg) {
  const { nickname, room_code } = msg;
  if (!nickname || typeof nickname !== 'string') return null;
  const trimmed = nickname.trim().slice(0, 20);
  if (trimmed.length < 2) return null;

  let room;
  if (room_code) {
    room = rooms.get(room_code.toUpperCase());
    if (!room || room.status !== 'waiting') return null;
    if (room.players.some(player => player.name.localeCompare(trimmed, undefined, { sensitivity: 'base' }) === 0)) {
      throw new Error('Этот никнейм уже занят');
    }
  } else {
    const player = new Player(trimmed);
    const packName = typeof msg.pack === 'string' && msg.pack.trim()
      ? msg.pack.trim()
      : getDefaultPackName();
    room = new GameRoom(player.id, packName);
    rooms.set(room.roomCode, room);
    room.addPlayer(player);
    const token = sessions.create(player.id, room.roomCode);
    wsManager.connect(room.roomCode, player.id, ws);
    ws.send(JSON.stringify({ type: 'joined', token, player_id: player.id, room_code: room.roomCode }));
    wsManager.broadcastState(room.roomCode, room);
    return { roomCode: room.roomCode, playerId: player.id };
  }

  const player = new Player(trimmed);
  room.addPlayer(player);
  const token = sessions.create(player.id, room.roomCode);
  wsManager.connect(room.roomCode, player.id, ws);
  ws.send(JSON.stringify({ type: 'joined', token, player_id: player.id, room_code: room.roomCode }));
  wsManager.broadcastState(room.roomCode, room);
  return { roomCode: room.roomCode, playerId: player.id };
}

function handleRejoin(ws, msg) {
  const session = sessions.get(msg.token);
  if (!session) return null;
  const room = rooms.get(session.roomCode);
  if (!room) return null;
  const player = room.getPlayer(session.playerId);
  if (!player || player.participation_status === 'left') return null;

  const key = `${session.roomCode}:${session.playerId}`;
  if (pendingAdminTransfers.has(key)) {
    clearTimeout(pendingAdminTransfers.get(key));
    pendingAdminTransfers.delete(key);
  }

  wsManager.connect(session.roomCode, session.playerId, ws);
  ws.send(JSON.stringify({ type: 'room_state', data: room.toDict(session.playerId) }));
  wsManager.broadcast(session.roomCode, { type: 'player_reconnected', player_id: session.playerId });
  return { roomCode: session.roomCode, playerId: session.playerId };
}

function handleLeave(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return false;

  sessions.deleteForPlayer(playerId, roomCode);
  wsManager.disconnect(roomCode, playerId);
  if (room.status === 'waiting') room.deletePlayer(playerId);
  else room.setParticipationStatus(playerId, 'left');

  if (room.adminId === playerId) transferAdmin(roomCode);
  if (room.players.length === 0 || wsManager.getConnected(roomCode).size === 0) {
    rooms.delete(roomCode);
    wsManager.dropRoom(roomCode);
  } else {
    reconcileVoting(roomCode);
    wsManager.broadcastState(roomCode, room);
  }
  return true;
}

// Join a room as a read-only spectator. Spectators have a synthetic id that
// matches no player, so every "is this me / am I admin" check on the client
// naturally resolves to a watch-only view. They hold no session/rejoin token.
function handleSpectate(ws, msg) {
  const code = typeof msg.room_code === 'string' ? msg.room_code.toUpperCase() : '';
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;

  const spectatorId = `spectator-${randomUUID()}`;
  wsManager.connectSpectator(room.roomCode, spectatorId, ws);
  ws.send(JSON.stringify({ type: 'spectating', spectator_id: spectatorId, room_code: room.roomCode }));
  ws.send(JSON.stringify({ type: 'room_state', data: room.toDict(null) }));
  // Let everyone (including other spectators) see the updated spectator count.
  wsManager.broadcastState(room.roomCode, room);
  return { roomCode: room.roomCode, spectatorId };
}

function fillRoomWithDevBots(room) {
  const targetPlayerCount = Math.max(2, Math.min(15, DEV_MIN_PLAYERS));
  const missingPlayers = targetPlayerCount - room.players.length;
  if (missingPlayers <= 0) return;

  const takenNames = new Set(room.players.map(player => player.name));
  let botIndex = 1;

  for (let i = 0; i < missingPlayers; i += 1) {
    let botName;
    do {
      const baseName = DEV_BOT_NAMES[(botIndex - 1) % DEV_BOT_NAMES.length];
      botName = `${baseName}-${botIndex}`;
      botIndex += 1;
    } while (takenNames.has(botName));
    takenNames.add(botName);
    room.addPlayer(new Player(botName, { isBot: true }));
  }
}

function handleStartGame(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || room.status !== 'waiting') return;
  if (room.settings.fill_with_bots) fillRoomWithDevBots(room);
  if (room.players.length < 4) return;

  room.status = 'running';
  room.bunker.generate(null, room.config);
  room.bunkerCapacity = room.settings.capacity_mode === 'manual'
    ? Math.min(room.players.length - 1, room.settings.manual_capacity)
    : Math.floor(room.players.length / 2);
  room.monthDuration = room.settings.month_duration_ms;

  for (const player of room.players) {
    player.generateCharacter(room.config);
  }
  room.assignSecretGoals();

  wsManager.broadcastState(roomCode, room);
}

function handleRevealAttr(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'running') return;
  const player = room.getPlayer(playerId);
  if (!player) return;
  const attr = msg.attribute;
  if (player.revealAttribute(attr)) {
    wsManager.broadcast(roomCode, attributeRevealedMsg(player, attr, room.config));
  }
}

function handleRevealAll(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'running') return;
  const player = room.getPlayer(playerId);
  if (!player) return;
  const revealed = player.revealAll();
  for (const attr of revealed) {
    wsManager.broadcast(roomCode, attributeRevealedMsg(player, attr, room.config));
  }
}

function connectedElectorate(room) {
  const connected = wsManager.getConnected(room.roomCode);
  return room.getActivePlayers().filter(player => player.is_bot || connected.has(player.id));
}

function handleUpdateRoomSettings(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || room.status !== 'waiting') return;
  const next = msg.settings;
  if (!next || typeof next !== 'object') return;
  const valid = typeof next.fill_with_bots === 'boolean'
    && typeof next.ai_enabled === 'boolean'
    && Number.isInteger(next.month_duration_ms) && next.month_duration_ms >= 10_000 && next.month_duration_ms <= 900_000
    && typeof next.event_frequency === 'number' && next.event_frequency >= 0 && next.event_frequency <= 1
    && ['auto', 'manual'].includes(next.capacity_mode)
    && Number.isInteger(next.manual_capacity) && next.manual_capacity >= 1 && next.manual_capacity <= 12;
  if (!valid) {
    wsManager.send(roomCode, playerId, { type: 'error', message: 'Недопустимые настройки комнаты' });
    return;
  }
  if (next.ai_enabled && !isAiAvailable()) {
    wsManager.send(roomCode, playerId, { type: 'error', message: 'AI-режим недоступен на сервере' });
    return;
  }
  room.settings = { ...next };
  room.monthDuration = next.month_duration_ms;
  wsManager.broadcastState(roomCode, room);
}

function beginBallot(roomCode, room, candidateIds = null, roundKind = 'first') {
  const electorate = connectedElectorate(room);
  if (electorate.length < 2) return false;
  room.resetVotes();
  room.voting.phase = 'ballot';
  room.voting.startApprovals.clear();
  room.voting.cancelApprovals.clear();
  room.voting.electorateIds = electorate.map(player => player.id);
  room.voting.candidateIds = candidateIds ?? room.getActivePlayers().map(player => player.id);
  room.voting.roundKind = roundKind;
  for (const player of electorate) {
    if (!player.is_bot) continue;
    const targetId = room.voting.candidateIds.includes(player.id)
      ? player.id
      : room.voting.candidateIds[0];
    if (targetId) room.addVote(player.id, targetId);
  }
  wsManager.broadcastState(roomCode, room);
  return true;
}

function approvalsComplete(room, approvals) {
  const electorate = connectedElectorate(room);
  return electorate.length >= 2 && electorate.every(player => player.is_bot || approvals.has(player.id));
}

function handleToggleVotingProposal(roomCode, playerId) {
  const room = rooms.get(roomCode);
  const player = room?.getPlayer(playerId);
  if (!room || room.status !== 'running' || room.voting.phase === 'ballot' || room.voting.phase === 'cancelling') return;
  if (!player || player.participation_status !== 'active') return;
  room.voting.phase = 'proposing';
  for (const bot of room.getActivePlayers().filter(candidate => candidate.is_bot)) {
    room.voting.startApprovals.add(bot.id);
  }
  if (room.voting.startApprovals.has(playerId)) room.voting.startApprovals.delete(playerId);
  else room.voting.startApprovals.add(playerId);
  if (approvalsComplete(room, room.voting.startApprovals)) beginBallot(roomCode, room);
  else {
    if (room.voting.startApprovals.size === 0) room.voting.phase = 'idle';
    wsManager.broadcastState(roomCode, room);
  }
}

function handleForceStartVoting(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || room.status !== 'running') return;
  beginBallot(roomCode, room);
}

function handleToggleVotingCancellation(roomCode, playerId) {
  const room = rooms.get(roomCode);
  const player = room?.getPlayer(playerId);
  if (!room || !['ballot', 'cancelling'].includes(room.voting.phase)) return;
  if (!player || player.participation_status !== 'active') return;
  for (const bot of room.getActivePlayers().filter(candidate => candidate.is_bot)) {
    room.voting.cancelApprovals.add(bot.id);
  }
  if (room.voting.cancelApprovals.has(playerId)) room.voting.cancelApprovals.delete(playerId);
  else room.voting.cancelApprovals.add(playerId);
  room.voting.phase = room.voting.cancelApprovals.size ? 'cancelling' : 'ballot';
  if (approvalsComplete(room, room.voting.cancelApprovals)) room.resetVoting();
  wsManager.broadcastState(roomCode, room);
}

function handleForceCancelVoting(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || !['ballot', 'cancelling'].includes(room.voting.phase)) return;
  room.resetVoting();
  wsManager.broadcastState(roomCode, room);
}

// Legacy admin commands remain as aliases while clients migrate.
const handleStartVoting = handleForceStartVoting;
const handleCancelVoting = handleForceCancelVoting;

function finalizeVoting(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const counts = room.countVotes();
  const maxVotes = Math.max(...Object.values(counts), 0);
  const candidates = Object.keys(counts).filter(id => counts[id] === maxVotes);
  const isTie = candidates.length > 1;

  if (isTie && room.voting.roundKind === 'first') {
    wsManager.broadcast(roomCode, { type: 'voting_result', eliminated: null, votes: counts, is_tie: true, runoff: true });
    beginBallot(roomCode, room, candidates, 'runoff');
    return;
  }

  let eliminated = null;
  if (!isTie) {
    const id = candidates[0];
    room.setParticipationStatus(id, 'eliminated');
    eliminated = room.getPlayer(id).toDict();
    room.round++;
  }

  room.resetVoting();

  wsManager.broadcast(roomCode, { type: 'voting_result', eliminated, votes: counts, is_tie: isTie });

  const active = room.getActivePlayers();
  if (active.length <= 1) {
    room.status = 'finished';
    room.revealAllPlayers();
    wsManager.broadcast(roomCode, { type: 'game_ended', winner: active[0]?.toDict() || null });
    wsManager.broadcastState(roomCode, room);
    return;
  }

  if (room.bunkerCapacity !== null && active.length <= room.bunkerCapacity) {
    room.revealAllPlayers();
    confirmBotsForBunkerLife(room);
    if (tryStartBunkerLife(roomCode, room)) return;

    wsManager.broadcast(roomCode, {
      type: 'ready_for_bunker_life',
      capacity: room.bunkerCapacity,
      active_count: active.length,
    });
    wsManager.broadcastState(roomCode, room);
    return;
  }

  wsManager.broadcastState(roomCode, room);
}

function handleVote(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || !['ballot', 'cancelling'].includes(room.voting.phase)) return;
  const voter = room.getPlayer(playerId);
  if (!voter || voter.participation_status !== 'active' || !room.voting.electorateIds.includes(playerId)) return;
  const target = room.getPlayer(msg.target_id);
  if (!target || target.participation_status !== 'active' || !room.voting.candidateIds.includes(target.id)) return;
  if (msg.target_id === playerId && !voter.is_bot) return;

  if (room.addVote(playerId, msg.target_id)) {
    wsManager.send(roomCode, playerId, { type: 'vote_confirmed' });
    if (room.voting.electorateIds.every(id => room.votedPlayers.has(id))) {
      finalizeVoting(roomCode);
    } else {
      wsManager.broadcastState(roomCode, room);
    }
  }
}

function reconcileVoting(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const electorateIds = connectedElectorate(room).map(player => player.id);
  room.voting.startApprovals = new Set([...room.voting.startApprovals].filter(id => electorateIds.includes(id)));
  room.voting.cancelApprovals = new Set([...room.voting.cancelApprovals].filter(id => electorateIds.includes(id)));
  if (room.voting.phase === 'proposing' && approvalsComplete(room, room.voting.startApprovals)) {
    beginBallot(roomCode, room);
    return;
  }
  if (['ballot', 'cancelling'].includes(room.voting.phase)) {
    room.voting.electorateIds = room.voting.electorateIds.filter(id => electorateIds.includes(id));
    if (room.voting.phase === 'cancelling' && approvalsComplete(room, room.voting.cancelApprovals)) {
      room.resetVoting();
    } else if (room.voting.electorateIds.length > 0 && room.voting.electorateIds.every(id => room.votedPlayers.has(id))) {
      finalizeVoting(roomCode);
      return;
    }
  }
  wsManager.broadcastState(roomCode, room);
}

function handleEndGame(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId) return;
  room.status = 'finished';
  room.revealAllPlayers();
  const active = room.getActivePlayers();
  wsManager.broadcast(roomCode, { type: 'game_ended', winner: active.length === 1 ? active[0].toDict() : null });
  wsManager.broadcastState(roomCode, room);
}

function handleKick(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId) return;
  if (msg.player_id === room.adminId) return;
  room.setParticipationStatus(msg.player_id, 'kicked');
  sessions.deleteForPlayer(msg.player_id, roomCode);
  wsManager.broadcastState(roomCode, room);
  const active = room.getActivePlayers();
  if (room.status === 'running' && active.length <= 1) {
    room.status = 'finished';
    room.revealAllPlayers();
    wsManager.broadcast(roomCode, { type: 'game_ended', winner: active[0]?.toDict() || null });
    wsManager.broadcastState(roomCode, room);
  }
}

function canAdminReveal(room) {
  return room.status === 'running' || room.status === 'bunker_life';
}

function handleAdminRevealPlayerAttribute(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || !canAdminReveal(room)) return;
  if (typeof msg.player_id !== 'string' || typeof msg.attribute !== 'string') return;
  if (!ATTRIBUTE_KEYS.includes(msg.attribute)) return;

  const target = room.getPlayer(msg.player_id);
  if (!target) return;

  if (target.revealAttribute(msg.attribute)) {
    wsManager.broadcast(roomCode, attributeRevealedMsg(target, msg.attribute, room.config));
  }
}

function handleAdminRevealPlayerAttributes(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || !canAdminReveal(room)) return;
  if (typeof msg.player_id !== 'string' || !Array.isArray(msg.attributes) || msg.attributes.length === 0) return;

  const target = room.getPlayer(msg.player_id);
  if (!target) return;

  const uniqueAttributes = [...new Set(msg.attributes)].filter(attribute => ATTRIBUTE_KEYS.includes(attribute));
  for (const attribute of uniqueAttributes) {
    if (!target.revealAttribute(attribute)) continue;
    wsManager.broadcast(roomCode, attributeRevealedMsg(target, attribute, room.config));
  }
}

function handleAdminRevealPlayerAll(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || !canAdminReveal(room)) return;
  if (typeof msg.player_id !== 'string') return;

  const target = room.getPlayer(msg.player_id);
  if (!target) return;

  const revealed = target.revealAll();
  for (const attr of revealed) {
    wsManager.broadcast(roomCode, attributeRevealedMsg(target, attr, room.config));
  }
}

function handleAdminRevealAllPlayers(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || !canAdminReveal(room)) return;

  for (const target of room.players) {
    const revealed = target.revealAll();
    for (const attr of revealed) {
      wsManager.broadcast(roomCode, attributeRevealedMsg(target, attr, room.config));
    }
  }
}

function handleUseProfessionAbility(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'running' || ['ballot', 'cancelling'].includes(room.voting.phase)) return;
  const actor = room.getPlayer(playerId);
  if (!actor || actor.participation_status !== 'active') return;

  const result = applyProfessionAbility(room, actor, msg.target_id, msg.second_target_id, msg.variant);
  if (!result.ok) {
    wsManager.send(roomCode, playerId, { type: 'error', message: result.error });
    return;
  }

  wsManager.broadcastState(roomCode, room);

  if (result.publicMessage) {
    wsManager.broadcastExcept(roomCode, playerId, { type: 'profession_ability_used', message: result.publicMessage });
  }

  wsManager.send(roomCode, playerId, {
    type: 'profession_ability_used',
    message: result.privateMessage || result.publicMessage,
  });
}

function transferAdmin(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const connected = wsManager.getConnected(roomCode);
  const next = room.getActivePlayers().find(p => connected.has(p.id));
  if (next) {
    room.adminId = next.id;
    wsManager.broadcast(roomCode, { type: 'admin_changed', new_admin_id: next.id });
  }
}

module.exports = {
  handleJoin,
  handleRejoin,
  handleLeave,
  handleSpectate,
  handleStartGame,
  handleUpdateRoomSettings,
  handleRevealAttr,
  handleRevealAll,
  handleStartVoting,
  handleCancelVoting,
  handleToggleVotingProposal,
  handleToggleVotingCancellation,
  handleForceStartVoting,
  handleForceCancelVoting,
  handleVote,
  handleEndGame,
  handleKick,
  handleAdminRevealPlayerAttribute,
  handleAdminRevealPlayerAttributes,
  handleAdminRevealPlayerAll,
  handleAdminRevealAllPlayers,
  handleUseProfessionAbility,
  transferAdmin,
  reconcileVoting,
};
