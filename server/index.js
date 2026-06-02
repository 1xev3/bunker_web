const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const GameRoom = require('./game/gameRoom');
const { Player, publicAttribute } = require('./game/player');
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
const BUNKER_EVENT_CHANCE = 0.10;
const FOOD_REPLENISH_RATIO = 0.25;
const MAX_SURVIVAL_CHANCE = 150;
const EVENT_TEMPLATE_RE = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
const EVENT_PARTICIPANT_TEMPLATE_RE = /^participant(\d+)$/;
const EVENT_HIGHLIGHT_START = '<<event-highlight>>';
const EVENT_HIGHLIGHT_END = '<</event-highlight>>';

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

app.get('/api/packs/:id/meta', (req, res) => {
  const { listPacks } = require('./game/gameConfig');
  const pack = listPacks().find((p) => p.id === req.params.id);
  if (!pack) return res.status(404).json({ error: 'Pack not found' });
  res.json(pack.meta);
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

function parseDurationMonths(label) {
  if (!label) return 24;
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*(год|года|лет|месяц|месяца|месяцев)/i);
  if (!m) return 24;
  const n = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  if (unit.startsWith('месяц')) return Math.round(n);
  return Math.round(n * 12);
}

function parseFoodMonths(label) {
  if (!label) return 12;
  // handle "пол года" → 6
  if (/пол\s*года/i.test(label)) return 6;
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*(год|года|лет|месяц|месяца|месяцев)/i);
  if (!m) return 12;
  const n = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  if (unit.startsWith('месяц')) return Math.round(n);
  return Math.round(n * 12);
}

function pickRandomEvent(config) {
  const events = config.EVENTS;
  return materializeEvent(events[Math.floor(Math.random() * events.length)]);
}

function pickRandomValue(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function pickEventTextValue(value) {
  return Array.isArray(value) ? pickRandomValue(value) : value;
}

function resolveEventTemplateValue(context, key, cache) {
  if (cache.has(key)) return cache.get(key);
  const isAltKey = key.startsWith('alt.');
  const sourceKey = isAltKey ? key.slice(4) : key;
  const source = isAltKey ? context.alt : context.event;
  if (!source || !(sourceKey in source)) {
    return undefined;
  }
  const rawValue = source[sourceKey];
  const resolvedValue = Array.isArray(rawValue) ? pickRandomValue(rawValue) : rawValue;
  cache.set(key, resolvedValue);
  return resolvedValue;
}

function renderEventText(template, context, cache) {
  if (typeof template !== 'string') return template;
  return template.replace(EVENT_TEMPLATE_RE, (_, key) => {
    const value = resolveEventTemplateValue(context, key, cache);
    if (typeof value !== 'string') {
      return `{${key}}`;
    }
    return `${EVENT_HIGHLIGHT_START}${value}${EVENT_HIGHLIGHT_END}`;
  });
}

function resolveEventText(sourceValue, context, cache) {
  return renderEventText(pickEventTextValue(sourceValue), context, cache);
}

function inferEventType(event) {
  return event.base_chance == null ? 'passive' : 'interactive';
}

function materializeEvent(event) {
  const altText = Array.isArray(event.alt) && event.alt.length > 0
    ? pickRandomValue(event.alt)
    : null;
  const context = { event, alt: altText };
  const cache = new Map();
  return {
    ...event,
    event_type: inferEventType(event),
    title: resolveEventText(event.title, context, cache),
    description: resolveEventText(event.description, context, cache),
  };
}

function formatParticipantList(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

function renderParticipantText(template, participants) {
  if (typeof template !== 'string') return template;
  const names = participants.map(player => player.name);
  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (key === 'participants') {
      return `${EVENT_HIGHLIGHT_START}${formatParticipantList(names)}${EVENT_HIGHLIGHT_END}`;
    }
    const participantMatch = key.match(EVENT_PARTICIPANT_TEMPLATE_RE);
    if (!participantMatch) {
      return match;
    }
    const index = Number.parseInt(participantMatch[1], 10) - 1;
    return names[index] ? `${EVENT_HIGHLIGHT_START}${names[index]}${EVENT_HIGHLIGHT_END}` : match;
  });
}

function materializeEventParticipants(event, participants) {
  return {
    ...event,
    title: renderParticipantText(event.title, participants),
    description: renderParticipantText(event.description, participants),
    participants: participants.map(player => player.name),
  };
}

function canBeCouple(p1, p2) {
  const config = p1.config ?? p2.config;
  const affix1 = config?.GENDER_AFFIXES.find(entry => entry.value.id === p1.gender?.affixId)?.value;
  const affix2 = config?.GENDER_AFFIXES.find(entry => entry.value.id === p2.gender?.affixId)?.value;
  if (!affix1 || !affix2) return true;
  if (affix1.attraction === 'none' || affix2.attraction === 'none') return false;
  if (affix1.attraction === 'any' || affix2.attraction === 'any') return true;

  const sameGender = p1.gender?.genderId === p2.gender?.genderId;
  const compatible = (affix) => {
    if (affix.attraction === 'same') return sameGender;
    if (affix.attraction === 'opposite') return !sameGender;
    return true;
  };
  return compatible(affix1) && compatible(affix2);
}

function resolveEventParticipants(event, activePlayers) {
  const template = event.participants_template;
  if (!template || activePlayers.length === 0) return [];
  const hasConfiguredMin = Number.isInteger(event.participants_min);
  const defaultMin = template === 'random_group' ? Math.min(2, activePlayers.length) : 1;
  const minParticipants = Math.max(1, hasConfiguredMin ? event.participants_min : defaultMin);
  const maxParticipants = Math.max(minParticipants, Number.isInteger(event.participants_max) ? event.participants_max : activePlayers.length);

  if (hasConfiguredMin && activePlayers.length < minParticipants) {
    return [];
  }

  if (template === 'couple') {
    const pairs = [];
    for (let i = 0; i < activePlayers.length; i++) {
      for (let j = i + 1; j < activePlayers.length; j++) {
        if (canBeCouple(activePlayers[i], activePlayers[j])) {
          pairs.push([activePlayers[i], activePlayers[j]]);
        }
      }
    }
    if (pairs.length === 0) {
      return [];
    }
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    return pair;
  }

  if (template === 'random_one') {
    if (minParticipants > 1) return [];
    const idx = Math.floor(Math.random() * activePlayers.length);
    return [activePlayers[idx]];
  }

  if (template === 'random_group') {
    const maxCount = Math.min(activePlayers.length, maxParticipants);
    const count = minParticipants + Math.floor(Math.random() * (maxCount - minParticipants + 1));
    const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  return [];
}

function startNextMonth(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  room.currentMonth++;
  room.monthStartTime = Date.now();

  // Food consumption: each player eats 1 unit per month
  const activePlayers = room.getActivePlayers();
  room.foodMonths = Math.max(0, room.foodMonths - activePlayers.length);

  // Duration check: roll against survival_chance to determine final outcome.
  if (room.totalMonths > 0 && room.currentMonth >= room.totalMonths) {
    room.status = 'finished';
    room.revealAllPlayers();
    const survived = Math.random() * 100 < room.survivalChance;
    wsManager.broadcast(roomCode, {
      type: 'game_ended',
      winner: null,
      from_bunker_life: true,
      survived,
    });
    wsManager.broadcastState(roomCode, room);
    return;
  }

  // Starvation check
  if (room.foodMonths <= 0) {
    if (room.starvationPending) {
      // Last chance was ignored — bunker dies
      room.status = 'finished';
      room.revealAllPlayers();
      wsManager.broadcast(roomCode, { type: 'game_ended', winner: null, from_bunker_life: true });
      wsManager.broadcastState(roomCode, room);
      return;
    }
    // Show food replenishment event — players must choose resources to restock
    room.starvationPending = true;
    room.activeEvent = {
      id: 'food_replenish',
      event_type: 'food_replenish',
      title: 'Запасы еды иссякли',
      description: 'Еда в бункере закончилась. Если есть профессии или предметы, которые помогут восполнить запасы — выберите их. Иначе через месяц бункер погибнет от голода.',
    };
    wsManager.broadcastState(roomCode, room);
    return;
  }

  // Reset starvation flag once food is back
  room.starvationPending = false;

  if (Math.random() < BUNKER_EVENT_CHANCE) {
    const event = pickRandomEvent(room.config);
    const isPassive = event.event_type === 'passive';

    if (isPassive) {
      const participants = resolveEventParticipants(event, room.getActivePlayers());
      if (event.participants_template && participants.length === 0) {
        room.activeEvent = null;
        wsManager.broadcastState(roomCode, room);
        setTimeout(() => startNextMonth(roomCode), room.monthDuration);
        return;
      }
      room.activeEvent = materializeEventParticipants(event, participants);
    } else {
      const participants = resolveEventParticipants(event, room.getActivePlayers());
      if (event.participants_template && participants.length === 0) {
        room.activeEvent = null;
        wsManager.broadcastState(roomCode, room);
        setTimeout(() => startNextMonth(roomCode), room.monthDuration);
        return;
      }
      room.activeEvent = materializeEventParticipants(event, participants);
    }

    wsManager.broadcastState(roomCode, room);

  } else {
    room.activeEvent = null;
    wsManager.broadcastState(roomCode, room);
    setTimeout(() => startNextMonth(roomCode), room.monthDuration);
  }
}

function resolvePassiveEvent(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const event = room.activeEvent;
  if (event.event_type !== 'passive') return;

  const result = applyBunkerEventEffect(room, event.success_effect);

  room.activeEvent = null;

  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
    event_id: event.id,
    outcome: 'success',
    survival_change: result.survivalChange,
    survival_chance: room.survivalChance,
    food_change: result.foodChange,
  });

  if (room.survivalChance <= 0) {
    room.status = 'finished';
    room.revealAllPlayers();
    wsManager.broadcast(roomCode, { type: 'game_ended', winner: null, from_bunker_life: true });
    wsManager.broadcastState(roomCode, room);
    return;
  }

  wsManager.broadcastState(roomCode, room);
  setTimeout(() => startNextMonth(roomCode), room.monthDuration);
}

function applyBunkerEventEffect(room, effect) {
  const result = { survivalChange: 0, foodChange: undefined };
  if (!effect) return result;

  if (effect.type === 'survival_change') {
    result.survivalChange = effect.value;
    room.survivalChance = Math.max(0, Math.min(MAX_SURVIVAL_CHANCE, room.survivalChance + effect.value));
    return result;
  }

  if (effect.type === 'food_change') {
    const activeCount = Math.max(1, room.getActivePlayers().length);
    const before = room.foodMonths;
    const delta = effect.value * activeCount;
    room.foodMonths = Math.max(0, Math.min(room.foodMaxPersonMonths, room.foodMonths + delta));
    room.starvationPending = room.foodMonths <= 0 ? room.starvationPending : false;
    result.foodChange = Math.round((room.foodMonths - before) / activeCount);
  }

  return result;
}

function consumeSelectedItem(room, entry) {
  if (!entry || typeof entry.item_id !== 'string' || typeof entry.source !== 'string') return;

  if (entry.source === 'bunker') {
    const itemIdx = room.bunker.items.findIndex(item => item.id === entry.item_id);
    if (itemIdx !== -1) {
      room.bunker.items.splice(itemIdx, 1);
    }

    for (const row of room.bunker.grid) {
      for (const cell of row) {
        if (!cell || !Array.isArray(cell.items)) continue;
        const gridItemIdx = cell.items.findIndex(item => item.id === entry.item_id);
        if (gridItemIdx !== -1) {
          cell.items.splice(gridItemIdx, 1);
          return;
        }
      }
    }
    return;
  }

  const owner = room.getPlayer(entry.player_id);
  if (!owner) return;
  if (entry.source === 'inventory' && owner.inventory?.id === entry.item_id) {
    owner.inventory = null;
  } else if (entry.source === 'backpack' && Array.isArray(owner.backpack)) {
    const idx = owner.backpack.findIndex(item => item.id === entry.item_id);
    if (idx !== -1) {
      owner.backpack[idx].quantity -= 1;
      if (owner.backpack[idx].quantity <= 0) owner.backpack.splice(idx, 1);
    }
  }
}

function resolveFoodReplenishEvent(roomCode, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  const selectedProfessions = Array.isArray(msg.selected_professions) ? msg.selected_professions : [];
  const selectedItems = Array.isArray(msg.selected_items) ? msg.selected_items : [];
  const resourceCount = selectedProfessions.length + selectedItems.length;

  room.activeEvent = null;

  if (resourceCount === 0) {
    // No resources — starvation remains pending, next month will kill the bunker
    wsManager.broadcast(roomCode, {
      type: 'event_resolved',
      event_id: 'food_replenish',
      outcome: 'failure',
      survival_change: 0,
      survival_chance: room.survivalChance,
      food_change: 0,
    });
    wsManager.broadcastState(roomCode, room);
    setTimeout(() => startNextMonth(roomCode), room.monthDuration);
    return;
  }

  // Resources provided — consume them and replenish part of the required stay per resource.
  for (const entry of selectedItems) {
    consumeSelectedItem(room, entry);
  }

  const foodBefore = room.foodMonths;
  const replenish = Math.round(FOOD_REPLENISH_RATIO * room.foodMaxPersonMonths * resourceCount);
  room.foodMonths = Math.min(room.foodMaxPersonMonths, room.foodMonths + replenish);
  room.starvationPending = false;

  const foodDisplay = Math.round((room.foodMonths - foodBefore) / Math.max(1, room.getActivePlayers().length));

  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
    event_id: 'food_replenish',
    outcome: 'success',
    survival_change: 0,
    survival_chance: room.survivalChance,
    food_change: foodDisplay,
  });

  wsManager.broadcastState(roomCode, room);
  setTimeout(() => startNextMonth(roomCode), room.monthDuration);
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
  room.totalMonths = parseDurationMonths(room.bunker.duration?.label);
  const foodDurationMonths = parseFoodMonths(room.bunker.food?.label);
  const activeCount = room.getActivePlayers().length;
  room.foodMonths = foodDurationMonths * activeCount;
  room.foodMaxPersonMonths = Math.max(foodDurationMonths, room.totalMonths) * activeCount;
  room.starvationPending = false;
  room.activeEvent = null;
  room.monthStartTime = Date.now();
  wsManager.broadcastState(roomCode, room);
  setTimeout(() => startNextMonth(roomCode), room.monthDuration);
  return true;
}

function handleResolveEvent(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;

  const event = room.activeEvent;
  if (event.event_type === 'passive') {
    resolvePassiveEvent(roomCode);
    return;
  }

  if (event.event_type === 'food_replenish') {
    resolveFoodReplenishEvent(roomCode, msg);
    return;
  }

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

  // Remove consumed items from players or bunker storage.
  for (const entry of selectedItems) {
    consumeSelectedItem(room, entry);
  }

  const effectResult = applyBunkerEventEffect(room, effect);

  const outcomeType = succeeded ? 'success' : 'failure';

  room.activeEvent = null;

  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
    event_id: event.id,
    outcome: outcomeType,
    survival_change: effectResult.survivalChange,
    survival_chance: room.survivalChance,
    food_change: effectResult.foodChange,
  });

  if (room.survivalChance <= 0) {
    room.status = 'finished';
    room.revealAllPlayers();
    wsManager.broadcast(roomCode, {
      type: 'game_ended',
      winner: null,
      from_bunker_life: true,
    });
    wsManager.broadcastState(roomCode, room);
    return;
  }

  wsManager.broadcastState(roomCode, room);
  setTimeout(() => startNextMonth(roomCode), room.monthDuration);
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
