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
const DEV_MIN_PLAYERS = Number.parseInt(process.env.DEV_MIN_PLAYERS ?? '2', 10);
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
        const result = handleJoin(ws, msg);
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
    room = new GameRoom(player.id);
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
  room.bunker.generate();

  for (const player of room.players) {
    player.generateCharacter();
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
    room.addPlayer(new Player(botName));
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
  wsManager.broadcastState(roomCode, room);
}

function handleVote(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || !room.isVoting) return;
  const voter = room.getPlayer(playerId);
  if (!voter || !voter.is_active) return;
  if (msg.target_id === playerId) return;

  if (room.addVote(playerId, msg.target_id)) {
    wsManager.send(roomCode, playerId, { type: 'vote_confirmed' });

    const active = room.getActivePlayers();
    if (room.votedPlayers.size >= active.length) {
      finalizeVoting(roomCode);
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
  }
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
