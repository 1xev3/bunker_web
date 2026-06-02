const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const GameRoom = require('./game/gameRoom');
const { Player } = require('./game/player');
const { applyProfessionAbility } = require('./game/professionAbilities');
const SessionManager = require('./sessionManager');
const WsManager = require('./wsManager');

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const IS_DEV = process.env.NODE_ENV !== 'production';
const DEV_MIN_PLAYERS = Number.parseInt(process.env.DEV_MIN_PLAYERS ?? '4', 10);
const DEV_BOT_NAMES = [
  'Сокол',
  'Механик',
  'Радар',
  'Титан',
  'Искра',
  'Шторм',
  'Кедр',
  'Вектор',
];

const rooms = new Map();   // roomCode -> GameRoom
const sessions = new SessionManager();
const wsManager = new WsManager();
const pendingAdminTransfers = new Map(); // `${roomCode}:${playerId}` -> timeoutId

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// ── REST ──────────────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
  const { loadPack, getDefaultPackName } = require('./game/gameConfig');
  try {
    res.json(loadPack(req.query.pack || getDefaultPackName()));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/packs', (req, res) => {
  const { listPacks } = require('./game/gameConfig');
  res.json(listPacks());
});

app.get('/api/rooms', (req, res) => {
  const list = [];
  for (const [code, room] of rooms) {
    if (room.status !== 'finished') {
      list.push({
        room_code: code,
        player_count: room.players.length,
        status: room.status,
      });
    }
  }
  res.json(list);
});

app.get('/api/rooms/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ room_code: room.roomCode, player_count: room.players.length, status: room.status });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────

wss.on('connection', (ws) => {
  let roomCode = null;
  let playerId = null;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (!playerId) {
      // Auth phase
      if (msg.type === 'join') {
        let result = null;
        try {
          result = handleJoin(ws, msg);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', message: error.message || 'Failed to join room' }));
          return;
        }
        if (!result) return ws.send(JSON.stringify({ type: 'error', message: 'Room not found or game already started' }));
        ({ roomCode, playerId } = result);
      } else if (msg.type === 'rejoin') {
        const result = handleRejoin(ws, msg);
        if (!result) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
          ws.close();
          return;
        }
        ({ roomCode, playerId } = result);
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Send join or rejoin first' }));
      }
      return;
    }

    // Dispatched actions
    const room = rooms.get(roomCode);
    if (!room) return;
    room.touch();

    switch (msg.type) {
      case 'start_game':    handleStartGame(roomCode, playerId); break;
      case 'reveal_attribute': handleRevealAttr(roomCode, playerId, msg); break;
      case 'reveal_all':    handleRevealAll(roomCode, playerId); break;
      case 'start_voting':  handleStartVoting(roomCode, playerId); break;
      case 'submit_vote':   handleVote(roomCode, playerId, msg); break;
      case 'end_game':      handleEndGame(roomCode, playerId); break;
      case 'kick_player':   handleKick(roomCode, playerId, msg); break;
      case 'use_profession_ability': handleUseProfessionAbility(roomCode, playerId, msg); break;
      case 'confirm_bunker_life': handleConfirmBunkerLife(roomCode, playerId); break;
      case 'resolve_event': handleResolveEvent(roomCode, playerId, msg); break;
    }
  });

  ws.on('close', () => {
    if (!roomCode || !playerId) return;
    wsManager.disconnect(roomCode, playerId);
    const room = rooms.get(roomCode);
    if (!room) return;

    // Delete room if no one is connected anymore
    if (wsManager.getConnected(roomCode).size === 0) {
      rooms.delete(roomCode);
      return;
    }

    wsManager.broadcast(roomCode, { type: 'player_disconnected', player_id: playerId });

    // Delay admin transfer — give the admin 8 seconds to reconnect before reassigning
    if (playerId === room.adminId) {
      const key = `${roomCode}:${playerId}`;
      const t = setTimeout(() => {
        pendingAdminTransfers.delete(key);
        transferAdmin(roomCode);
      }, 8000);
      pendingAdminTransfers.set(key, t);
    }
  });
});

// ── Handlers ──────────────────────────────────────────────────────────────────

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
    // Create new room
    const player = new Player(trimmed);
    const { getDefaultPackName } = require('./game/gameConfig');
    const packName = typeof msg.pack === 'string' && msg.pack.trim()
      ? msg.pack.trim()
      : getDefaultPackName();
    room = new GameRoom(player.id, packName);
    rooms.set(room.roomCode, room);
    room.addPlayer(player);
    const token = sessions.create(player.id, room.roomCode);
    wsManager.connect(room.roomCode, player.id, ws);
    ws.send(JSON.stringify({
      type: 'joined',
      token,
      player_id: player.id,
      room_code: room.roomCode,
    }));
    wsManager.broadcastState(room.roomCode, room);
    return { roomCode: room.roomCode, playerId: player.id };
  }

  const player = new Player(trimmed);
  room.addPlayer(player);
  const token = sessions.create(player.id, room.roomCode);
  wsManager.connect(room.roomCode, player.id, ws);
  ws.send(JSON.stringify({
    type: 'joined',
    token,
    player_id: player.id,
    room_code: room.roomCode,
  }));
  wsManager.broadcastState(room.roomCode, room);
  return { roomCode: room.roomCode, playerId: player.id };
}

function handleRejoin(ws, msg) {
  const session = sessions.get(msg.token);
  if (!session) return null;
  const room = rooms.get(session.roomCode);
  if (!room) return null;

  // Cancel pending admin transfer if the admin is reconnecting in time
  const key = `${session.roomCode}:${session.playerId}`;
  if (pendingAdminTransfers.has(key)) {
    clearTimeout(pendingAdminTransfers.get(key));
    pendingAdminTransfers.delete(key);
  }

  wsManager.connect(session.roomCode, session.playerId, ws);
  ws.send(JSON.stringify({
    type: 'room_state',
    data: room.toDict(session.playerId),
  }));
  wsManager.broadcast(session.roomCode, { type: 'player_reconnected', player_id: session.playerId });
  return { roomCode: session.roomCode, playerId: session.playerId };
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
      value: player[attr],
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
      value: player[attr],
    });
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

function addBotSelfVotes(room) {
  for (const player of room.getActivePlayers()) {
    if (player.is_bot) {
      room.addVote(player.id, player.id);
    }
  }
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

  wsManager.broadcast(roomCode, {
    type: 'voting_result',
    eliminated,
    votes: counts,
    is_tie: isTie,
  });

  const active = room.getActivePlayers();
  if (active.length <= 1) {
    room.status = 'finished';
    room.revealAllPlayers();
    wsManager.broadcast(roomCode, {
      type: 'game_ended',
      winner: active[0]?.toDict() || null,
    });
    wsManager.broadcastState(roomCode, room);
    return;
  }

  if (room.bunkerCapacity !== null && active.length <= room.bunkerCapacity) {
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

function handleEndGame(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.adminId !== playerId) return;
  room.status = 'finished';
  room.revealAllPlayers();
  const active = room.getActivePlayers();
  wsManager.broadcast(roomCode, {
    type: 'game_ended',
    winner: active.length === 1 ? active[0].toDict() : null,
  });
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
    wsManager.broadcast(roomCode, {
      type: 'game_ended',
      winner: active[0]?.toDict() || null,
    });
    wsManager.broadcastState(roomCode, room);
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
    wsManager.broadcastExcept(roomCode, playerId, {
      type: 'profession_ability_used',
      message: result.publicMessage,
    });
  }

  wsManager.send(roomCode, playerId, {
    type: 'profession_ability_used',
    message: result.privateMessage || result.publicMessage,
  });
}

function pickRandomEvent(config) {
  const events = config.EVENTS;
  return events[Math.floor(Math.random() * events.length)];
}

function startNextMonth(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  room.currentMonth++;

  if (Math.random() < 0.2) {
    room.activeEvent = pickRandomEvent(room.config);
    wsManager.broadcastState(roomCode, room);
  } else {
    room.activeEvent = null;
    wsManager.broadcastState(roomCode, room);
    setTimeout(() => startNextMonth(roomCode), 4000);
  }
}

function handleConfirmBunkerLife(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'running') return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;

  room.confirmedBunkerLife.add(playerId);
  confirmBotsForBunkerLife(room);
  wsManager.broadcastState(roomCode, room);

  tryStartBunkerLife(roomCode, room);
}

function confirmBotsForBunkerLife(room) {
  for (const player of room.getActivePlayers()) {
    if (player.is_bot) {
      room.confirmedBunkerLife.add(player.id);
    }
  }
}

function tryStartBunkerLife(roomCode, room) {
  const active = room.getActivePlayers();
  if (room.confirmedBunkerLife.size < active.length) return false;

  room.status = 'bunker_life';
  room.survivalChance = 100;
  room.currentMonth = 0;
  room.activeEvent = null;
  wsManager.broadcastState(roomCode, room);
  setTimeout(() => startNextMonth(roomCode), 2000);
  return true;
}

function handleResolveEvent(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;

  const event = room.activeEvent;
  const selectedProfessions = Array.isArray(msg.selected_professions) ? msg.selected_professions : [];
  const selectedItems = Array.isArray(msg.selected_items) ? msg.selected_items : [];

  // 0 resources → base_chance, 1 → 75%, 2 → 90%, 3+ → 100%
  const resourceCount = selectedProfessions.length + selectedItems.length;
  let successChance;
  if (resourceCount === 0) {
    successChance = event.base_chance;
  } else if (resourceCount === 1) {
    successChance = 0.75;
  } else if (resourceCount === 2) {
    successChance = 0.90;
  } else {
    successChance = 1.0;
  }

  const succeeded = Math.random() < successChance;
  const effect = succeeded ? event.success_effect : event.failure_effect;

  // Remove consumed items from players' inventories
  for (const entry of selectedItems) {
    const owner = room.getPlayer(entry.player_id);
    if (!owner) continue;
    if (entry.source === 'inventory' && owner.inventory === entry.item) {
      owner.inventory = '';
    } else if (entry.source === 'backpack' && owner.backpack) {
      // backpack is comma-separated: "Топор, Нож (2 шт), Аптечка"
      const parts = owner.backpack.split(', ');
      const idx = parts.findIndex(p => {
        const name = p.replace(/\s*\(\d+ шт\)$/, '');
        return name === entry.item;
      });
      if (idx !== -1) {
        const match = parts[idx].match(/^(.+)\s+\((\d+) шт\)$/);
        if (match) {
          const qty = parseInt(match[2], 10) - 1;
          if (qty <= 0) parts.splice(idx, 1);
          else parts[idx] = `${match[1]} (${qty} шт)`;
        } else {
          parts.splice(idx, 1);
        }
        owner.backpack = parts.join(', ');
      }
    }
  }

  if (effect.type === 'survival_change') {
    room.survivalChance = Math.max(0, Math.min(100, room.survivalChance + effect.value));
  }

  const outcomeType = succeeded ? 'success' : 'failure';

  room.activeEvent = null;

  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
    event_id: event.id,
    outcome: outcomeType,
    survival_change: effect.value,
    survival_chance: room.survivalChance,
  });

  if (room.survivalChance <= 0) {
    room.status = 'finished';
    room.revealAllPlayers();
    wsManager.broadcast(roomCode, {
      type: 'game_ended',
      winner: null,
    });
    wsManager.broadcastState(roomCode, room);
    return;
  }

  wsManager.broadcastState(roomCode, room);
  setTimeout(() => startNextMonth(roomCode), 4000);
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

// Cleanup finished/inactive rooms every 30 min
setInterval(() => {
  sessions.cleanup();
  const hour = 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.status === 'finished' || Date.now() - room.lastActivity > 3 * hour) {
      rooms.delete(code);
    }
  }
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
