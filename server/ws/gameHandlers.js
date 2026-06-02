const { rooms, sessions, wsManager, pendingAdminTransfers } = require('../state');
const { Player, publicAttribute, ATTRIBUTE_KEYS } = require('../game/entities/player');
const { applyProfessionAbility } = require('../game/abilities/professionAbilities');
const { getDefaultPackName } = require('../game/gameConfig');
const GameRoom = require('../game/entities/gameRoom');
const { confirmBotsForBunkerLife, tryStartBunkerLife } = require('./bunkerLifeHandlers');

const IS_DEV = process.env.NODE_ENV !== 'production';
const DEV_MIN_PLAYERS = Number.parseInt(process.env.DEV_MIN_PLAYERS ?? '4', 10);
const DEV_BOT_NAMES = ['Сокол', 'Механик', 'Радар', 'Титан', 'Искра', 'Шторм', 'Кедр', 'Вектор'];

function handleJoin(ws, msg) {
  const { nickname, room_code } = msg;
  if (!nickname || typeof nickname !== 'string') return null;
  const trimmed = nickname.trim().slice(0, 20);
  if (trimmed.length < 2) return null;

  let room;
  if (room_code) {
    room = rooms.get(room_code.toUpperCase());
    if (!room || room.status !== 'waiting') return null;
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
  if (IS_DEV) fillRoomWithDevBots(room);
  if (room.players.length < 2) return;

  room.status = 'running';
  room.bunker.generate(null, room.config);
  room.bunkerCapacity = Math.max(2, Math.floor(room.players.length / 2) - 1);

  for (const player of room.players) {
    player.generateCharacter(room.config);
  }

  wsManager.broadcastState(roomCode, room);
}

function handleRevealAttr(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'running') return;
  const player = room.getPlayer(playerId);
  if (!player) return;
  const attr = msg.attribute;
  if (player.revealAttribute(attr)) {
    wsManager.broadcast(roomCode, {
      type: 'attribute_revealed',
      player_id: playerId,
      attribute: attr,
      value: publicAttribute(attr, player[attr], room.config),
    });
  }
}

function handleRevealAll(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'running') return;
  const player = room.getPlayer(playerId);
  if (!player) return;
  const revealed = player.revealAll();
  for (const attr of revealed) {
    wsManager.broadcast(roomCode, {
      type: 'attribute_revealed',
      player_id: playerId,
      attribute: attr,
      value: publicAttribute(attr, player[attr], room.config),
    });
  }
}

function addBotSelfVotes(room) {
  for (const player of room.getActivePlayers()) {
    if (player.is_bot) room.addVote(player.id, player.id);
  }
}

function handleStartVoting(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || room.status !== 'running' || room.isVoting) return;
  if (room.getActivePlayers().length < 2) return;
  room.resetVotes();
  room.isVoting = true;
  addBotSelfVotes(room);
  if (room.votedPlayers.size >= room.getActivePlayers().length) {
    finalizeVoting(roomCode);
    return;
  }
  wsManager.broadcastState(roomCode, room);
}

function handleCancelVoting(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || !room.isVoting) return;
  room.isVoting = false;
  room.resetVotes();
  wsManager.broadcastState(roomCode, room);
}

function finalizeVoting(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const counts = room.countVotes();
  const maxVotes = Math.max(...Object.values(counts), 0);
  const candidates = Object.keys(counts).filter(id => counts[id] === maxVotes);
  const isTie = candidates.length > 1;

  let eliminated = null;
  if (!isTie) {
    const id = candidates[0];
    room.removePlayer(id);
    eliminated = room.getPlayer(id).toDict();
    room.round++;
  }

  room.isVoting = false;
  room.resetVotes();

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
  if (!room || !room.isVoting) return;
  const voter = room.getPlayer(playerId);
  if (!voter || !voter.is_active) return;
  const target = room.getPlayer(msg.target_id);
  if (!target || !target.is_active) return;
  if (msg.target_id === playerId && !voter.is_bot) return;

  if (room.addVote(playerId, msg.target_id)) {
    wsManager.send(roomCode, playerId, { type: 'vote_confirmed' });
    const active = room.getActivePlayers();
    if (room.votedPlayers.size >= active.length) {
      finalizeVoting(roomCode);
    } else {
      wsManager.broadcastState(roomCode, room);
    }
  }
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
  room.removePlayer(msg.player_id);
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
    wsManager.broadcast(roomCode, {
      type: 'attribute_revealed',
      player_id: target.id,
      attribute: msg.attribute,
      value: publicAttribute(msg.attribute, target[msg.attribute], room.config),
    });
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
    wsManager.broadcast(roomCode, {
      type: 'attribute_revealed',
      player_id: target.id,
      attribute,
      value: publicAttribute(attribute, target[attribute], room.config),
    });
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
    wsManager.broadcast(roomCode, {
      type: 'attribute_revealed',
      player_id: target.id,
      attribute: attr,
      value: publicAttribute(attr, target[attr], room.config),
    });
  }
}

function handleAdminRevealAllPlayers(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId || !canAdminReveal(room)) return;

  for (const target of room.players) {
    const revealed = target.revealAll();
    for (const attr of revealed) {
      wsManager.broadcast(roomCode, {
        type: 'attribute_revealed',
        player_id: target.id,
        attribute: attr,
        value: publicAttribute(attr, target[attr], room.config),
      });
    }
  }
}

function handleUseProfessionAbility(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'running' || room.isVoting) return;
  const actor = room.getPlayer(playerId);
  if (!actor || !actor.is_active) return;

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
  handleStartGame,
  handleRevealAttr,
  handleRevealAll,
  handleStartVoting,
  handleCancelVoting,
  handleVote,
  handleEndGame,
  handleKick,
  handleAdminRevealPlayerAttribute,
  handleAdminRevealPlayerAttributes,
  handleAdminRevealPlayerAll,
  handleAdminRevealAllPlayers,
  handleUseProfessionAbility,
  transferAdmin,
};
