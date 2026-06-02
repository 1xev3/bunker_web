const { rooms, wsManager } = require('../state');
const { Player } = require('../game/entities/player');
const {
  parseDurationMonths,
  parseFoodMonths,
  pickRandomEvent,
  materializeEvent,
  materializeEventParticipants,
  materializeScheduledEvent,
  resolveEventParticipants,
} = require('./eventHelpers');

function normalizeEffectsArray(event, succeeded) {
  const arrKey = succeeded ? 'success_effects' : 'failure_effects';
  const singKey = succeeded ? 'success_effect' : 'failure_effect';
  if (Array.isArray(event[arrKey])) return event[arrKey];
  if (event[singKey]) return [event[singKey]];
  return [];
}

function applyBunkerEventEffect(room, effect, context) {
  const result = { survivalChange: 0, foodChange: undefined, playerKilled: null, playersKilled: [], roomChanged: false, playerAdded: null, scheduledEvent: null };
  if (!effect) return result;

  if (typeof effect.chance === 'number' && Math.random() >= effect.chance) return result;

  if (effect.type === 'survival_change') {
    result.survivalChange = effect.value;
    room.survivalChance = Math.max(
      0,
      Math.min(room.config.packSettings.bunker_life.max_survival_chance, room.survivalChance + effect.value),
    );
    return result;
  }

  if (effect.type === 'food_change') {
    const before = room.foodMonths;
    if (before <= 0) { result.foodChange = 0; return result; }

    const rawDelta = before * (effect.value / 100);
    let delta = Math.round(rawDelta);
    if (delta === 0 && effect.value !== 0) delta = effect.value > 0 ? 1 : -1;

    room.foodMonths = Math.max(0, Math.min(room.foodMaxPersonMonths, room.foodMonths + delta));
    room.starvationPending = room.foodMonths <= 0 ? room.starvationPending : false;
    result.foodChange = Math.round(((room.foodMonths - before) / before) * 100);
    return result;
  }

  if (effect.type === 'kill_participant') {
    const participantIds = context?.participantIds ?? [];
    if (effect.target === 'each_participant') {
      const candidates = participantIds.map(id => room.getPlayer(id)).filter(p => p?.is_active);
      for (const target of candidates) {
        if (typeof effect.per_target_chance === 'number' && Math.random() >= effect.per_target_chance) continue;
        target.is_active = false;
        result.playersKilled.push({ id: target.id, name: target.name });
      }
      return result;
    }
    let target = null;
    if (effect.target === 'participant1' && participantIds[0]) {
      target = room.getPlayer(participantIds[0]);
    } else if (effect.target === 'participant2' && participantIds[1]) {
      target = room.getPlayer(participantIds[1]);
    } else {
      const candidates = participantIds.map(id => room.getPlayer(id)).filter(p => p?.is_active);
      if (candidates.length > 0) target = candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (target && target.is_active) {
      target.is_active = false;
      result.playerKilled = { id: target.id, name: target.name };
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

  if (effect.type === 'remove_room') {
    const removed = room.bunker.removeRandomRoom();
    result.roomChanged = removed !== null;
    return result;
  }

  if (effect.type === 'add_room') {
    const added = room.bunker.addRoom([]);
    result.roomChanged = added;
    return result;
  }

  if (effect.type === 'add_player') {
    const context_ = context?.scheduledContext ?? {};
    const isChild = effect.character_type === 'child';
    let name = 'Незнакомец';
    if (effect.name_template) {
      name = effect.name_template.replace(/\{context\.(\w+)\}/g, (_, k) => context_[k] ?? `{${k}}`);
    }
    const newPlayer = new Player(name);
    if (isChild) {
      newPlayer.generateMinimalCharacter(room.config, { raceId: context_[effect.race_from_context] });
    } else {
      newPlayer.generateCharacter(room.config);
      newPlayer.revealAll();
    }
    room.addPlayer(newPlayer);
    result.playerAdded = { id: newPlayer.id, name: newPlayer.name };
    return result;
  }

  if (effect.type === 'schedule_event') {
    const scheduledContext = {};
    if (effect.context_from_participants) {
      const participantIds = context?.participantIds ?? [];
      const participants = participantIds.map(id => room.getPlayer(id)).filter(Boolean);
      for (const [contextKey, participantRef] of Object.entries(effect.context_from_participants)) {
        const m = String(participantRef).match(/^participant(\d+)$/);
        if (!m) continue;
        const p = participants[Number(m[1]) - 1];
        if (!p) continue;
        scheduledContext[`${contextKey}_name`] = p.name;
        scheduledContext[`${contextKey}_id`] = p.id;
        scheduledContext[`${contextKey}_race_id`] = p.race?.id;
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
    survivalChange: 0,
    foodChange: undefined,
    playersKilled: [],
    roomChanged: false,
    playersAdded: [],
  };

  for (const effect of effects) {
    const r = applyBunkerEventEffect(room, effect, context);
    accumulated.survivalChange += r.survivalChange;
    if (r.foodChange !== undefined) accumulated.foodChange = (accumulated.foodChange ?? 0) + r.foodChange;
    if (r.playerKilled) accumulated.playersKilled.push(r.playerKilled);
    if (Array.isArray(r.playersKilled) && r.playersKilled.length > 0) accumulated.playersKilled.push(...r.playersKilled);
    if (r.roomChanged) accumulated.roomChanged = true;
    if (r.playerAdded) accumulated.playersAdded.push(r.playerAdded);
    if (r.scheduledEvent) room.scheduledEvents.push(r.scheduledEvent);
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

  return { selectedProfessions, selectedItems };
}

function resetEventSelection(room) {
  room.activeEventSelection = { selected_professions: [], selected_items: [] };
  room.choiceVotes = {};
}

function broadcastEventResolved(roomCode, room, eventId, outcome, effectResult) {
  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
    event_id: eventId,
    outcome,
    survival_change: effectResult.survivalChange,
    survival_chance: room.survivalChance,
    food_change: effectResult.foodChange,
    players_killed: effectResult.playersKilled ?? [],
    room_changed: effectResult.roomChanged ?? false,
    players_added: effectResult.playersAdded ?? [],
  });
}

function checkGameOver(roomCode, room) {
  if (room.getActivePlayers().length === 0 || room.survivalChance <= 0) {
    room.status = 'finished';
    room.revealAllPlayers();
    wsManager.broadcast(roomCode, { type: 'game_ended', winner: null, from_bunker_life: true });
    wsManager.broadcastState(roomCode, room);
    return true;
  }
  return false;
}

function maybeChainOrNextMonth(roomCode, chainEventId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  if (!chainEventId) {
    setTimeout(() => startNextMonth(roomCode), room.monthDuration);
    return;
  }

  const chainDef = room.config.EVENTS.find(e => e.id === chainEventId);
  if (!chainDef) {
    setTimeout(() => startNextMonth(roomCode), room.monthDuration);
    return;
  }

  const materialized = materializeEvent(chainDef);
  const participants = resolveEventParticipants(materialized, room.getActivePlayers());
  room.activeEvent = participants.length > 0
    ? materializeEventParticipants(materialized, participants)
    : materialized;
  resetEventSelection(room);
  wsManager.broadcastState(roomCode, room);

}

function resolveNarrativeEvent(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const event = room.activeEvent;
  if (event.event_type !== 'narrative') return;

  const context = { participantIds: event.participant_ids ?? [], scheduledContext: event.scheduled_context };
  const effects = normalizeEffectsArray(event, true);
  const effectResult = applyEffectsArray(room, effects, context);

  const pendingKills = room.pendingChainKills ?? [];
  room.pendingChainKills = [];
  if (pendingKills.length > 0) {
    effectResult.playersKilled = [...pendingKills, ...effectResult.playersKilled];
  }

  room.activeEvent = null;
  resetEventSelection(room);

  broadcastEventResolved(roomCode, room, event.id, 'success', effectResult);

  if (checkGameOver(roomCode, room)) return;

  wsManager.broadcastState(roomCode, room);
  maybeChainOrNextMonth(roomCode, event.chain_success);
}

function startNextMonth(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  room.currentMonth++;
  room.monthStartTime = Date.now();
  resetEventSelection(room);
  room.pendingChainKills = [];

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
  room.foodMonths = Math.max(0, room.foodMonths - activePlayers.length);

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

  if (room.foodMonths <= 0) {
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

  if (Math.random() < room.config.packSettings.events.bunker_event_chance) {
    const event = pickRandomEvent(room.config);
    const participants = resolveEventParticipants(event, room.getActivePlayers());
    if (event.participants_template && participants.length === 0) {
      room.activeEvent = null;
      wsManager.broadcastState(roomCode, room);
      setTimeout(() => startNextMonth(roomCode), room.monthDuration);
      return;
    }
    room.activeEvent = materializeEventParticipants(event, participants);
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

  const context = { participantIds: event.participant_ids ?? [], scheduledContext: event.scheduled_context };
  const effects = normalizeEffectsArray(event, true);
  const effectResult = applyEffectsArray(room, effects, context);

  room.activeEvent = null;
  resetEventSelection(room);

  const chainDef = event.chain_success ? room.config.EVENTS.find(e => e.id === event.chain_success) : null;
  if (chainDef?.event_type === 'narrative' && effectResult.playersKilled.length > 0) {
    room.pendingChainKills = effectResult.playersKilled;
    effectResult.playersKilled = [];
  }

  broadcastEventResolved(roomCode, room, event.id, 'success', effectResult);

  if (checkGameOver(roomCode, room)) return;

  wsManager.broadcastState(roomCode, room);
  maybeChainOrNextMonth(roomCode, event.chain_success);
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
      survival_change: 0,
      survival_chance: room.survivalChance,
      food_change: 0,
      players_killed: [],
      room_changed: false,
      players_added: [],
    });
    wsManager.broadcastState(roomCode, room);
    setTimeout(() => startNextMonth(roomCode), room.monthDuration);
    return;
  }

  for (const entry of selectedItems) consumeSelectedItem(room, entry);

  const foodBefore = room.foodMonths;
  const replenish = Math.round(room.config.packSettings.events.food_replenish.ratio_per_resource * room.foodMaxPersonMonths * resourceCount);
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
    players_killed: [],
    room_changed: false,
    players_added: [],
  });

  wsManager.broadcastState(roomCode, room);
  setTimeout(() => startNextMonth(roomCode), room.monthDuration);
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
  room.survivalChance = room.config.packSettings.bunker_life.initial_survival_chance;
  room.currentMonth = 0;
  room.totalMonths = room.bunker.duration?.months ?? parseDurationMonths(room.bunker.duration?.label);
  const foodDurationMonths = parseFoodMonths(room.bunker.food?.label);
  const activeCount = room.getActivePlayers().length;
  room.foodMonths = foodDurationMonths * activeCount;
  room.foodMaxPersonMonths = Math.max(foodDurationMonths, room.totalMonths) * activeCount;
  room.starvationPending = false;
  room.scheduledEvents = [];
  room.activeEvent = null;
  resetEventSelection(room);
  room.pendingChainKills = [];
  room.monthStartTime = Date.now();
  wsManager.broadcastState(roomCode, room);
  setTimeout(() => startNextMonth(roomCode), room.monthDuration);
  return true;
}

function handleUpdateEventSelection(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;
  if (room.activeEvent.event_type === 'passive') return;

  const { selectedProfessions, selectedItems } = normalizeEventSelection(msg);
  room.activeEventSelection = {
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
  const context = { participantIds: event.participant_ids ?? [], scheduledContext: event.scheduled_context };
  const effects = normalizeEffectsArray(event, succeeded);
  const effectResult = applyEffectsArray(room, effects, context);

  room.activeEvent = null;
  resetEventSelection(room);

  const chainId = succeeded ? event.chain_success : event.chain_failure;
  const chainDef = chainId ? room.config.EVENTS.find(e => e.id === chainId) : null;
  if (chainDef?.event_type === 'narrative' && effectResult.playersKilled.length > 0) {
    room.pendingChainKills = effectResult.playersKilled;
    effectResult.playersKilled = [];
  }

  broadcastEventResolved(roomCode, room, event.id, outcome, effectResult);
  if (checkGameOver(roomCode, room)) return;
  wsManager.broadcastState(roomCode, room);
  maybeChainOrNextMonth(roomCode, chainId);
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

  const selectedProfessions = room.activeEventSelection.selected_professions;
  const selectedItems = room.activeEventSelection.selected_items;

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
  const effects = normalizeEffectsArray(event, succeeded);
  const context = { participantIds: event.participant_ids ?? [], scheduledContext: event.scheduled_context };

  for (const entry of selectedItems) consumeSelectedItem(room, entry);

  const effectResult = applyEffectsArray(room, effects, context);
  room.activeEvent = null;
  resetEventSelection(room);

  const chainId = succeeded ? event.chain_success : event.chain_failure;
  const chainDef = chainId ? room.config.EVENTS.find(e => e.id === chainId) : null;
  if (chainDef?.event_type === 'narrative' && effectResult.playersKilled.length > 0) {
    room.pendingChainKills = effectResult.playersKilled;
    effectResult.playersKilled = [];
  }

  broadcastEventResolved(roomCode, room, event.id, succeeded ? 'success' : 'failure', effectResult);

  if (checkGameOver(roomCode, room)) return;

  wsManager.broadcastState(roomCode, room);
  maybeChainOrNextMonth(roomCode, chainId);
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
