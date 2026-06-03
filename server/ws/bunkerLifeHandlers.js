const { rooms, wsManager } = require('../state');
const { runLuaEventHandler } = require('../game/config/luaEvents');
const {
  parseDurationMonths,
  pickRandomEvent,
  materializeEventParticipants,
  materializeScheduledEvent,
} = require('./eventHelpers');

function updateFood(room, delta) {
  const before = room.food;
  room.food = Math.max(0, room.food + delta);
  if (room.food > room.foodMax) room.foodMax = room.food;
  if (room.food > 0) room.starvationPending = false;
  return room.food - before;
}

function hasScheduledEvent(room, scheduledEvent) {
  return room.scheduledEvents.some(existing =>
    existing.event_id === scheduledEvent.event_id
    && existing.trigger_month === scheduledEvent.trigger_month
    && JSON.stringify(existing.context ?? {}) === JSON.stringify(scheduledEvent.context ?? {})
  );
}

function clampStat(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ensureVitalStatus(player) {
  if (!player.vital_status) {
    player.vital_status = { health: 100, sanity: 100, statuses: [] };
  }
  if (!Array.isArray(player.vital_status.statuses)) player.vital_status.statuses = [];
  player.vital_status.health = clampStat(player.vital_status.health ?? 100);
  player.vital_status.sanity = clampStat(player.vital_status.sanity ?? 100);
  return player.vital_status;
}

// Lua player actions (SetHealth/SetSanity/SetStatus/...) always emit a concrete
// player id as the effect target.
function getEffectTargets(room, effect) {
  const target = room.getPlayer(effect.target);
  return target?.is_active ? [target] : [];
}

function changePlayerStat(player, stat, value) {
  const vital = ensureVitalStatus(player);
  const before = vital[stat];
  vital[stat] = clampStat(before + value);
  if (vital.health <= 0 || vital.sanity <= 0) {
    player.is_active = false;
  }
  return vital[stat] - before;
}

function normalizeStatus(effect) {
  const stat = effect.stat === 'sanity' ? 'sanity' : 'health';
  return {
    id: effect.status_id || `${stat}_${effect.value < 0 ? 'debuff' : 'buff'}`,
    label: effect.label || (effect.value < 0 ? 'Неблагоприятное состояние' : 'Поддержка'),
    type: effect.value < 0 ? 'debuff' : 'buff',
    stat,
    delta: Number(effect.value ?? 0),
    months: Math.max(1, Number(effect.months ?? 1)),
  };
}

function applyMonthlyVitals(room) {
  const result = { healthChanges: [], sanityChanges: [], statusChanges: [], playersKilled: [] };
  const active = room.getActivePlayers();
  const noFood = room.food <= 0;

  for (const player of active) {
    const vital = ensureVitalStatus(player);
    const statuses = [...vital.statuses];

    for (const status of statuses) {
      const stat = status.stat === 'sanity' ? 'sanity' : 'health';
      const delta = changePlayerStat(player, stat, Number(status.delta ?? 0));
      if (delta !== 0) {
        result[stat === 'health' ? 'healthChanges' : 'sanityChanges'].push({ id: player.id, name: player.name, delta });
      }
      status.months = Math.max(0, Number(status.months ?? 1) - 1);
    }

    vital.statuses = statuses.filter(status => status.months > 0);

    if (noFood && player.is_active) {
      const healthDelta = changePlayerStat(player, 'health', -18);
      const sanityDelta = changePlayerStat(player, 'sanity', -8);
      result.healthChanges.push({ id: player.id, name: player.name, delta: healthDelta });
      result.sanityChanges.push({ id: player.id, name: player.name, delta: sanityDelta });
      result.statusChanges.push({ id: player.id, name: player.name, status: { id: 'hunger', label: 'Голод', type: 'debuff', stat: 'health', delta: -6, months: 2 }, action: 'added' });
      vital.statuses = vital.statuses.filter(status => status.id !== 'hunger');
      vital.statuses.push({ id: 'hunger', label: 'Голод', type: 'debuff', stat: 'health', delta: -6, months: 2 });
    }

    if (!player.is_active) result.playersKilled.push({ id: player.id, name: player.name });
  }

  return result;
}

// Resolves a participant role name (e.g. "male") to a player for scheduled context.
function resolveScheduledParticipant(participants, participantRef, participantRoles) {
  const playerId = participantRoles?.[participantRef];
  return playerId ? participants.find(p => p.id === playerId) ?? null : null;
}

function getEventEffects(event, succeeded, room, context) {
  const handlerKey = event.event_type === 'passive' || event.event_type === 'narrative'
    ? 'run'
    : succeeded ? 'success' : 'failure';
  return runLuaEventHandler(event.__lua_file, event.id, handlerKey, { room, eventContext: event.__lua_context ?? {}, context });
}

function uniquePlayerRefs(players) {
  const seen = new Set();
  const result = [];
  for (const player of players ?? []) {
    if (!player?.id || seen.has(player.id)) continue;
    seen.add(player.id);
    result.push(player);
  }
  return result;
}

function applyBunkerEventEffect(room, effect, context) {
  const result = { healthChanges: [], sanityChanges: [], statusChanges: [], foodChange: undefined, playerKilled: null, playersKilled: [], roomChanged: false, scheduledEvent: null };
  if (!effect) return result;

  if (effect.type === 'health_change' || effect.type === 'sanity_change') {
    const stat = effect.type === 'health_change' ? 'health' : 'sanity';
    const targets = getEffectTargets(room, effect);
    for (const target of targets) {
      const delta = changePlayerStat(target, stat, Number(effect.value ?? 0));
      result[stat === 'health' ? 'healthChanges' : 'sanityChanges'].push({ id: target.id, name: target.name, delta });
      if (!target.is_active) result.playersKilled.push({ id: target.id, name: target.name });
    }
    return result;
  }

  if (effect.type === 'add_status') {
    const targets = getEffectTargets(room, effect);
    const status = normalizeStatus(effect);
    for (const target of targets) {
      const vital = ensureVitalStatus(target);
      vital.statuses = vital.statuses.filter(existing => existing.id !== status.id);
      vital.statuses.push({ ...status });
      result.statusChanges.push({ id: target.id, name: target.name, status: { ...status }, action: 'added' });
    }
    return result;
  }

  if (effect.type === 'clear_status') {
    const targets = getEffectTargets(room, effect);
    for (const target of targets) {
      const vital = ensureVitalStatus(target);
      const before = vital.statuses.length;
      vital.statuses = effect.status_id
        ? vital.statuses.filter(status => status.id !== effect.status_id)
        : vital.statuses.filter(status => status.type !== (effect.status_type ?? 'debuff'));
      if (vital.statuses.length !== before) {
        result.statusChanges.push({ id: target.id, name: target.name, status_id: effect.status_id, action: 'cleared' });
      }
    }
    return result;
  }

  if (effect.type === 'food_change') {
    const rawValue = effect.value ?? 0;
    if (rawValue < 0) {
      const percent = Math.abs(rawValue);
      const loss = room.food > 0 ? Math.ceil((room.food * percent) / 100) : 0;
      result.foodChange = updateFood(room, -Math.min(room.food, loss));
      return result;
    }
    result.foodChange = updateFood(room, rawValue);
    return result;
  }

  if (effect.type === 'set_flag') {
    if (!room.flags || typeof room.flags !== 'object') room.flags = {};
    if (typeof effect.key === 'string' && effect.key.trim() !== '') {
      room.flags[effect.key] = effect.value;
    }
    return result;
  }

  if (effect.type === 'kill_random_active') {
    const participantIds = new Set(context?.participantIds ?? []);
    const candidates = room.getActivePlayers().filter(p => !participantIds.has(p.id));
    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      target.is_active = false;
      result.playerKilled = { id: target.id, name: target.name };
    }
    return result;
  }

  if (effect.type === 'add_room') {
    result.roomChanged = room.bunker.addRoom([]);
    return result;
  }

  if (effect.type === 'schedule_event') {
    const scheduledContext = {};
    if (effect.context_from_participants) {
      const participantIds = context?.participantIds ?? [];
      const participantRoles = context?.participantRoles ?? {};
      const participants = participantIds.map(id => room.getPlayer(id)).filter(Boolean);
      for (const [contextKey, participantRef] of Object.entries(effect.context_from_participants)) {
        const p = resolveScheduledParticipant(participants, participantRef, participantRoles);
        if (!p) continue;
        scheduledContext[`${contextKey}_name`] = p.name;
        scheduledContext[`${contextKey}_id`] = p.id;
      }
    }
    result.scheduledEvent = {
      event_id: effect.event_id,
      trigger_month: room.currentMonth + (effect.delay_months ?? 1),
      context: scheduledContext,
    };
    return result;
  }

  return result;
}

function applyEffectsArray(room, effects, context) {
  const accumulated = {
    healthChanges: [],
    sanityChanges: [],
    statusChanges: [],
    foodChange: undefined,
    playersKilled: [],
    roomChanged: false,
  };

  for (const effect of effects) {
    const r = applyBunkerEventEffect(room, effect, context);
    accumulated.healthChanges.push(...r.healthChanges);
    accumulated.sanityChanges.push(...r.sanityChanges);
    accumulated.statusChanges.push(...r.statusChanges);
    if (r.foodChange !== undefined) accumulated.foodChange = (accumulated.foodChange ?? 0) + r.foodChange;
    if (r.playerKilled) accumulated.playersKilled.push(r.playerKilled);
    accumulated.playersKilled.push(...r.playersKilled);
    if (r.roomChanged) accumulated.roomChanged = true;
    if (r.scheduledEvent && !hasScheduledEvent(room, r.scheduledEvent)) room.scheduledEvents.push(r.scheduledEvent);
  }

  return accumulated;
}

function consumeSelectedItem(room, entry) {
  if (!entry || typeof entry.item_id !== 'string' || typeof entry.source !== 'string') return;

  if (entry.source === 'bunker') {
    const itemIdx = room.bunker.items.findIndex(item => item.id === entry.item_id);
    if (itemIdx !== -1) room.bunker.items.splice(itemIdx, 1);
    for (const row of room.bunker.grid) {
      for (const cell of row) {
        if (!cell || !Array.isArray(cell.items)) continue;
        const gridItemIdx = cell.items.findIndex(item => item.id === entry.item_id);
        if (gridItemIdx !== -1) { cell.items.splice(gridItemIdx, 1); return; }
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

function normalizeEventSelection(msg) {
  const selectedPlayerId = typeof msg?.selected_player_id === 'string' && msg.selected_player_id.trim() !== ''
    ? msg.selected_player_id
    : null;
  const selectedProfessions = Array.isArray(msg?.selected_professions)
    ? [...new Set(msg.selected_professions.filter(id => typeof id === 'string'))]
    : [];
  const selectedItems = Array.isArray(msg?.selected_items)
    ? msg.selected_items
      .filter(entry => entry && typeof entry.item_id === 'string' && typeof entry.source === 'string')
      .map(entry => entry.source === 'bunker'
        ? { item_id: entry.item_id, source: 'bunker' }
        : {
            player_id: typeof entry.player_id === 'string' ? entry.player_id : '',
            item_id: entry.item_id,
            source: entry.source,
          })
      .filter(entry =>
        entry.source === 'bunker' ||
        (entry.player_id && (entry.source === 'inventory' || entry.source === 'backpack'))
      )
    : [];

  return { selectedPlayerId, selectedProfessions, selectedItems };
}

function resetEventSelection(room) {
  room.activeEventSelection = { selected_player_id: null, selected_professions: [], selected_items: [] };
  room.choiceVotes = {};
}

function broadcastEventResolved(roomCode, room, eventId, outcome, effectResult) {
  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
    event_id: eventId,
    outcome,
    health_changes: effectResult.healthChanges ?? [],
    sanity_changes: effectResult.sanityChanges ?? [],
    status_changes: effectResult.statusChanges ?? [],
    food_change: effectResult.foodChange,
    players_killed: uniquePlayerRefs(effectResult.playersKilled),
    room_changed: effectResult.roomChanged ?? false,
    players_added: [],
  });
}

function checkGameOver(roomCode, room) {
  if (room.getActivePlayers().length === 0) {
    room.status = 'finished';
    room.revealAllPlayers();
    wsManager.broadcast(roomCode, { type: 'game_ended', winner: null, from_bunker_life: true });
    wsManager.broadcastState(roomCode, room);
    return true;
  }
  return false;
}

function scheduleNextMonth(roomCode, room) {
  setTimeout(() => startNextMonth(roomCode), room.monthDuration);
}

function eventContextOf(event, extra = {}) {
  return {
    participantIds: event.participant_ids ?? [],
    participantRoles: event.participant_roles ?? {},
    scheduledContext: event.scheduled_context,
    ...extra,
  };
}

function resolveNarrativeEvent(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const event = room.activeEvent;
  if (event.event_type !== 'narrative') return;

  const context = eventContextOf(event);
  const effectResult = applyEffectsArray(room, getEventEffects(event, true, room, context), context);

  room.activeEvent = null;
  resetEventSelection(room);

  broadcastEventResolved(roomCode, room, event.id, 'success', effectResult);

  if (checkGameOver(roomCode, room)) return;

  wsManager.broadcastState(roomCode, room);
  scheduleNextMonth(roomCode, room);
}

function startNextMonth(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  room.currentMonth++;
  room.monthStartTime = Date.now();
  resetEventSelection(room);

  if (checkGameOver(roomCode, room)) return;

  // Check scheduled events due this month
  const due = room.scheduledEvents.filter(se => se.trigger_month <= room.currentMonth);
  room.scheduledEvents = room.scheduledEvents.filter(se => se.trigger_month > room.currentMonth);

  if (due.length > 0) {
    const scheduled = due[0];
    const eventDef = room.config.EVENTS.find(e => e.id === scheduled.event_id);
    if (eventDef) {
      const materialized = materializeScheduledEvent(eventDef, scheduled.context);
      room.activeEvent = materialized;
      wsManager.broadcastState(roomCode, room);
      // Remaining due events are dropped this month (next month check will handle if still pending)
      return;
    }
  }

  const activePlayers = room.getActivePlayers();
  const consumptionPerPlayer = room.config.packSettings.bunker_life.food_consumption_per_player;
  updateFood(room, -(activePlayers.length * consumptionPerPlayer));
  const monthlyVitals = applyMonthlyVitals(room);

  if (
    monthlyVitals.healthChanges.length > 0 ||
    monthlyVitals.sanityChanges.length > 0 ||
    monthlyVitals.statusChanges.length > 0 ||
    monthlyVitals.playersKilled.length > 0
  ) {
    wsManager.broadcast(roomCode, {
      type: 'event_resolved',
      event_id: 'month_tick',
      outcome: 'success',
      health_changes: monthlyVitals.healthChanges,
      sanity_changes: monthlyVitals.sanityChanges,
      status_changes: monthlyVitals.statusChanges,
      food_change: undefined,
      players_killed: uniquePlayerRefs(monthlyVitals.playersKilled),
      room_changed: false,
      players_added: [],
    });
  }

  if (checkGameOver(roomCode, room)) return;

  if (room.totalMonths > 0 && room.currentMonth >= room.totalMonths) {
    room.status = 'finished';
    room.revealAllPlayers();
    wsManager.broadcast(roomCode, {
      type: 'game_ended',
      winner: null,
      from_bunker_life: true,
      survived: room.getActivePlayers().length > 0,
    });
    wsManager.broadcastState(roomCode, room);
    return;
  }

  if (room.food <= 0) {
    if (room.starvationPending) {
      room.status = 'finished';
      room.revealAllPlayers();
      wsManager.broadcast(roomCode, { type: 'game_ended', winner: null, from_bunker_life: true });
      wsManager.broadcastState(roomCode, room);
      return;
    }
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

  room.starvationPending = false;

  const picked = Math.random() < room.config.packSettings.events.bunker_event_chance
    ? pickRandomEvent(room.config, room)
    : null;

  if (picked) {
    room.activeEvent = materializeEventParticipants(picked.event, picked.participants);
    wsManager.broadcastState(roomCode, room);
  } else {
    room.activeEvent = null;
    wsManager.broadcastState(roomCode, room);
    scheduleNextMonth(roomCode, room);
  }
}

function resolvePassiveEvent(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const event = room.activeEvent;
  if (event.event_type !== 'passive') return;

  const context = eventContextOf(event);
  const effectResult = applyEffectsArray(room, getEventEffects(event, true, room, context), context);

  room.activeEvent = null;
  resetEventSelection(room);

  broadcastEventResolved(roomCode, room, event.id, 'success', effectResult);

  if (checkGameOver(roomCode, room)) return;

  wsManager.broadcastState(roomCode, room);
  scheduleNextMonth(roomCode, room);
}

function resolveFoodReplenishEvent(roomCode, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  const { selectedProfessions, selectedItems } = normalizeEventSelection(msg);
  const resourceCount = selectedProfessions.length + selectedItems.length;

  room.activeEvent = null;
  resetEventSelection(room);

  if (resourceCount === 0) {
    wsManager.broadcast(roomCode, {
      type: 'event_resolved',
      event_id: 'food_replenish',
      outcome: 'failure',
      health_changes: [],
      sanity_changes: [],
      status_changes: [],
      food_change: 0,
      players_killed: [],
      room_changed: false,
      players_added: [],
    });
    wsManager.broadcastState(roomCode, room);
    scheduleNextMonth(roomCode, room);
    return;
  }

  for (const entry of selectedItems) consumeSelectedItem(room, entry);

  const replenishPerResource = room.config.packSettings.events.food_replenish.food_per_resource;
  const replenish = replenishPerResource * room.getActivePlayers().length * resourceCount;
  const foodDisplay = updateFood(room, replenish);

  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
    event_id: 'food_replenish',
    outcome: 'success',
    health_changes: [],
    sanity_changes: [],
    status_changes: [],
    food_change: foodDisplay,
    players_killed: [],
    room_changed: false,
    players_added: [],
  });

  wsManager.broadcastState(roomCode, room);
  scheduleNextMonth(roomCode, room);
}

function confirmBotsForBunkerLife(room) {
  for (const player of room.getActivePlayers()) {
    if (player.is_bot) room.confirmedBunkerLife.add(player.id);
  }
}

function tryStartBunkerLife(roomCode, room) {
  const active = room.getActivePlayers();
  if (room.confirmedBunkerLife.size < active.length) return false;

  room.status = 'bunker_life';
  room.currentMonth = 0;
  room.totalMonths = room.bunker.duration?.months ?? parseDurationMonths(room.bunker.duration?.label);
  room.food = (room.bunker.food?.amount ?? 0) * active.length;
  room.foodMax = room.food;
  room.starvationPending = false;
  room.scheduledEvents = [];
  room.activeEvent = null;
  for (const player of active) {
    player.vital_status = { health: 100, sanity: 100, statuses: [] };
  }
  resetEventSelection(room);
  room.monthStartTime = Date.now();
  wsManager.broadcastState(roomCode, room);
  scheduleNextMonth(roomCode, room);
  return true;
}

function handleUpdateEventSelection(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;
  if (room.activeEvent.event_type === 'passive') return;

  const { selectedPlayerId, selectedProfessions, selectedItems } = normalizeEventSelection(msg);
  const selectedPlayer = selectedPlayerId ? room.getPlayer(selectedPlayerId) : null;
  room.activeEventSelection = {
    selected_player_id: selectedPlayer?.is_active ? selectedPlayer.id : null,
    selected_professions: selectedProfessions,
    selected_items: selectedItems,
  };
  wsManager.broadcastState(roomCode, room);
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

function handleForceStartBunkerLife(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'running' || room.adminId !== playerId || room.isVoting) return;
  const active = room.getActivePlayers();

  room.confirmedBunkerLife = new Set(active.map(player => player.id));
  wsManager.broadcastState(roomCode, room);
  tryStartBunkerLife(roomCode, room);
}

function resolveChoiceEvent(roomCode, outcome) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const event = room.activeEvent;

  const succeeded = outcome === 'success';
  const context = eventContextOf(event);
  const effectResult = applyEffectsArray(room, getEventEffects(event, succeeded, room, context), context);

  room.activeEvent = null;
  resetEventSelection(room);

  broadcastEventResolved(roomCode, room, event.id, outcome, effectResult);
  if (checkGameOver(roomCode, room)) return;
  wsManager.broadcastState(roomCode, room);
  scheduleNextMonth(roomCode, room);
}

function handleCastChoiceVote(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;
  if (!room.activeEvent.choice_labels) return;

  const vote = msg?.vote === 'success' || msg?.vote === 'failure' ? msg.vote : null;
  if (!vote) return;

  room.choiceVotes[playerId] = vote;

  // Auto-vote for bots that haven't voted yet
  for (const p of room.getActivePlayers()) {
    if (p.is_bot && !room.choiceVotes[p.id]) {
      room.choiceVotes[p.id] = Math.random() < 0.5 ? 'success' : 'failure';
    }
  }

  wsManager.broadcastState(roomCode, room);

  // Auto-resolve when all active players have voted
  const activePlayers = room.getActivePlayers();
  if (activePlayers.every(p => room.choiceVotes[p.id])) {
    const successCount = Object.values(room.choiceVotes).filter(v => v === 'success').length;
    const failureCount = Object.values(room.choiceVotes).filter(v => v === 'failure').length;
    resolveChoiceEvent(roomCode, failureCount > successCount ? 'failure' : 'success');
  }
}

function handleResolveEvent(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;

  const event = room.activeEvent;
  if (event.event_type === 'passive') { resolvePassiveEvent(roomCode); return; }
  if (event.event_type === 'narrative') { resolveNarrativeEvent(roomCode); return; }
  if (event.event_type === 'food_replenish') {
    resolveFoodReplenishEvent(roomCode, room.activeEventSelection);
    return;
  }

  // Choice events: only forced_outcome is valid (player already voted via cast_choice_vote)
  if (event.choice_labels) {
    const forcedOutcome = typeof msg?.forced_outcome === 'string' ? msg.forced_outcome : null;
    if (forcedOutcome !== 'success' && forcedOutcome !== 'failure') return;
    resolveChoiceEvent(roomCode, forcedOutcome);
    return;
  }

  const submittedSelection = normalizeEventSelection(msg);
  const selectedProfessions = submittedSelection.selectedProfessions.length > 0
    ? submittedSelection.selectedProfessions
    : room.activeEventSelection.selected_professions;
  const selectedItems = submittedSelection.selectedItems.length > 0
    ? submittedSelection.selectedItems
    : room.activeEventSelection.selected_items;
  const selectedPlayerId = submittedSelection.selectedPlayerId ?? room.activeEventSelection.selected_player_id;
  const selectedPlayer = selectedPlayerId ? room.getPlayer(selectedPlayerId) : null;
  if (event.requires_player_selection === true && !selectedPlayer?.is_active) return;

  const forcedOutcome = typeof msg?.forced_outcome === 'string' ? msg.forced_outcome : null;
  let succeeded;
  if (forcedOutcome === 'success') {
    succeeded = true;
  } else if (forcedOutcome === 'failure') {
    succeeded = false;
  } else {
    const successChances = room.config.packSettings.events.success_chances;
    const resourceCount = selectedProfessions.length + selectedItems.length;
    let successChance;
    if (resourceCount === 0) successChance = event.base_chance;
    else if (resourceCount === 1) successChance = successChances.one_resource;
    else if (resourceCount === 2) successChance = successChances.two_resources;
    else successChance = successChances.three_plus_resources;
    succeeded = Math.random() < successChance;
  }
  const context = eventContextOf(event, { selectedPlayerId: selectedPlayer?.id ?? null });
  const effects = getEventEffects(event, succeeded, room, context);

  for (const entry of selectedItems) consumeSelectedItem(room, entry);

  const effectResult = applyEffectsArray(room, effects, context);
  room.activeEvent = null;
  resetEventSelection(room);

  broadcastEventResolved(roomCode, room, event.id, succeeded ? 'success' : 'failure', effectResult);

  if (checkGameOver(roomCode, room)) return;

  wsManager.broadcastState(roomCode, room);
  scheduleNextMonth(roomCode, room);
}

module.exports = {
  startNextMonth,
  handleConfirmBunkerLife,
  handleForceStartBunkerLife,
  handleUpdateEventSelection,
  handleResolveEvent,
  handleCastChoiceVote,
  confirmBotsForBunkerLife,
  tryStartBunkerLife,
};
