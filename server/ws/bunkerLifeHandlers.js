// WebSocket orchestration for the bunker_life phase: month ticks, event
// lifecycle (flavor / choice / food-replenish), outcome confirmation gates and
// broadcasting. The game rules themselves (applying effects, vitals, items) live
// in `server/game/bunkerLife/bunkerEffects.js`; this module only wires them to
// the transport and the shared `rooms` registry.

const { rooms, wsManager } = require('../state');
const { getSelectKinds } = require('../game/config/yamlEvents');
const {
  parseDurationMonths,
  pickRandomEvent,
  materializeScheduledEvent,
} = require('./eventHelpers');
const {
  startingVitalHealth,
  updateFood,
  applyMonthlyVitals,
  buildFlavorEffects,
  buildOptionEffects,
  applyEffectsArray,
  emptyEffectOutput,
  consumeSelectedItem,
  normalizeEventSelection,
  optionRequiredKinds,
  selectionHasKind,
  injectItemPlaceholders,
  applyHungerDebuff,
  clearHungerDebuff,
  uniquePlayerRefs,
  professionSelectionStrength,
  tallyWinningOption,
} = require('../game/bunkerLife/bunkerEffects');

// --- Guards ---------------------------------------------------------------
// Most handlers gate on the same preconditions. These helpers centralize the
// "is this room/player a legitimate actor right now" checks so the handlers
// read as intent rather than boilerplate.

/** The room iff it exists and is in the given status (default: bunker_life). */
function getRoomInStatus(roomCode, status = 'bunker_life') {
  const room = rooms.get(roomCode);
  return room && room.status === status ? room : null;
}

/** True iff `playerId` is an active (alive) player of `room`. */
function isActivePlayer(room, playerId) {
  const player = room.getPlayer(playerId);
  return Boolean(player && player.is_active);
}

// --- Respondent tracking --------------------------------------------------

// Players whose response we actually wait for: alive AND (a bot or currently
// connected). A disconnected-but-alive survivor must not block a vote/confirm
// step — otherwise the event modal soft-locks for everyone until (if ever) they
// return. Bots always count since they auto-respond.
function activeRespondents(roomCode, room) {
  const connected = wsManager.getConnected(roomCode);
  return room.getActivePlayers().filter(p => p.is_bot || connected.has(p.id));
}

function allResponded(roomCode, room, set) {
  const respondents = activeRespondents(roomCode, room);
  return respondents.length > 0 && respondents.every(p => set.has(p.id));
}

function resetEventSelection(room) {
  room.activeEventSelection = { selected_player_id: null, selected_professions: [], selected_items: [] };
  room.choiceVotes = {};
  room.choicePendingSelection = null;
  room.resolveConfirmations = new Set();
  room.pendingOutcomeReport = null;
}

function broadcastEventResolved(roomCode, room, eventId, outcome, effectResult, message = null) {
  // The outcome modal is gated on per-player confirmation, so its payload must
  // survive a reconnect: mirror it in room state (serialized as `pending_outcome`)
  // in addition to the one-shot broadcast. Without this, a player who is offline
  // when this fires reconnects with no modal to confirm and soft-locks the gate.
  const report = {
    event_id: eventId,
    outcome,
    message,
    health_changes: effectResult.healthChanges ?? [],
    sanity_changes: effectResult.sanityChanges ?? [],
    status_changes: effectResult.statusChanges ?? [],
    food_change: effectResult.foodChange,
    players_killed: uniquePlayerRefs(effectResult.playersKilled),
    room_changed: effectResult.roomChanged ?? false,
    players_added: uniquePlayerRefs(effectResult.playersAdded),
    item_changes: effectResult.itemChanges ?? [],
  };
  room.pendingOutcomeReport = report;
  wsManager.broadcast(roomCode, { type: 'event_resolved', ...report });
}

// True when a resolution produced nothing the outcome modal would render: no
// narration text and no visible stat/roster/inventory/status changes. The modal
// (EventOutcomeModal) and its buff snackbar key off exactly these fields, so an
// empty result would show as a bare "Готов" button with no content.
function isEmptyOutcome(effectResult, message) {
  if (message != null && String(message).trim() !== '') return false;
  const r = effectResult ?? {};
  const hasVital = arr => Array.isArray(arr) && arr.some(c => c.delta !== 0);
  return !(
    (r.foodChange !== undefined && r.foodChange !== 0) ||
    hasVital(r.healthChanges) ||
    hasVital(r.sanityChanges) ||
    (r.statusChanges?.length > 0) ||
    (r.playersKilled?.length > 0) ||
    (r.playersAdded?.length > 0) ||
    (r.itemChanges?.length > 0) ||
    r.roomChanged
  );
}

// Surfaces an event's result. An empty result has nothing to confirm, so it
// skips the modal and advances straight to the pending action; otherwise it
// broadcasts the result and waits for everyone to acknowledge it.
function settleOutcome(roomCode, room, eventId, outcome, effectResult, action, message = null) {
  if (isEmptyOutcome(effectResult, message)) {
    wsManager.broadcastState(roomCode, room);
    if (checkGameOver(roomCode, room)) return;
    if (action === 'next_month') scheduleNextMonth(roomCode, room);
    return;
  }
  broadcastEventResolved(roomCode, room, eventId, outcome, effectResult, message);
  if (checkGameOver(roomCode, room)) return;
  waitForOutcomeConfirmations(roomCode, action);
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

function waitForOutcomeConfirmations(roomCode, action) {
  const room = rooms.get(roomCode);
  if (!room) return;
  room.outcomeConfirmations = new Set();
  room.pendingOutcomeAction = action;
  for (const p of room.getActivePlayers()) {
    if (p.is_bot) room.outcomeConfirmations.add(p.id);
  }
  wsManager.broadcastState(roomCode, room);
  if (allResponded(roomCode, room, room.outcomeConfirmations)) {
    executeOutcomeAction(roomCode);
  }
}

function executeOutcomeAction(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const action = room.pendingOutcomeAction;
  room.outcomeConfirmations = null;
  room.pendingOutcomeAction = null;
  room.pendingOutcomeReport = null;
  wsManager.broadcastState(roomCode, room);
  if (action === 'next_month') {
    scheduleNextMonth(roomCode, room);
  }
}

function eventContextOf(event, extra = {}) {
  return { participantIds: event.participant_ids ?? [], ...extra };
}

function startNextMonth(roomCode) {
  const room = getRoomInStatus(roomCode);
  if (!room) return;

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
      const materialized = materializeScheduledEvent(eventDef, scheduled.context, room);
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

  const hasChanges =
    monthlyVitals.healthChanges.length > 0 ||
    monthlyVitals.sanityChanges.length > 0 ||
    monthlyVitals.statusChanges.length > 0 ||
    monthlyVitals.playersKilled.length > 0;

  // Monthly buff/debuff ticks are passive: surface them as a transient bottom
  // notification rather than the blocking outcome modal (reserved for events).
  if (hasChanges) {
    wsManager.broadcast(roomCode, {
      type: 'monthly_report',
      health_changes: monthlyVitals.healthChanges,
      sanity_changes: monthlyVitals.sanityChanges,
      status_changes: monthlyVitals.statusChanges,
      players_killed: uniquePlayerRefs(monthlyVitals.playersKilled),
    });
  }

  // A status that ran out this tick may open a follow-up event (e.g. birth).
  // Present the first; any others are queued to fire next month.
  const pending = monthlyVitals.expiredEvents.filter(e => room.config.EVENTS.some(def => def.id === e.event_id));
  if (pending.length > 0) {
    for (const extra of pending.slice(1)) {
      room.scheduledEvents.push({ event_id: extra.event_id, trigger_month: room.currentMonth + 1, context: { roles: extra.roles } });
    }
    const eventDef = room.config.EVENTS.find(e => e.id === pending[0].event_id);
    room.activeEvent = materializeScheduledEvent(eventDef, { roles: pending[0].roles }, room);
    wsManager.broadcastState(roomCode, room);
    return;
  }

  continueAfterMonthTick(roomCode);
}

function continueAfterMonthTick(roomCode) {
  const room = getRoomInStatus(roomCode);
  if (!room) return;

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
    const hungerActive = room.getActivePlayers().some(p =>
      p.vital_status?.statuses?.some(s => s.id === 'hunger')
    );
    if (!hungerActive) {
      room.activeEvent = {
        id: 'food_replenish',
        event_type: 'food_replenish',
        title: 'Запасы еды иссякли',
        description: 'Еда в бункере закончилась. Если есть профессии или предметы, которые помогут восполнить запасы — выберите их. Без еды жители бункера получат дебаф «Голод» и будут терять здоровье и рассудок каждый месяц.',
      };
      wsManager.broadcastState(roomCode, room);
      return;
    }
  }

  const picked = Math.random() < room.config.packSettings.events.bunker_event_chance
    ? pickRandomEvent(room.config, room)
    : null;

  if (picked) {
    room.activeEvent = picked;
    wsManager.broadcastState(roomCode, room);
  } else {
    room.activeEvent = null;
    wsManager.broadcastState(roomCode, room);
    scheduleNextMonth(roomCode, room);
  }
}

function resolveFlavorEvent(roomCode) {
  const room = getRoomInStatus(roomCode);
  if (!room || !room.activeEvent) return;
  const event = room.activeEvent;
  if (event.event_type !== 'flavor') return;

  const context = eventContextOf(event);
  const effectResult = applyEffectsArray(room, buildFlavorEffects(event, room), context);

  room.activeEvent = null;
  resetEventSelection(room);

  settleOutcome(roomCode, room, event.id, 'resolved', effectResult, 'next_month');
}

function resolveFoodReplenishEvent(roomCode, msg) {
  const room = getRoomInStatus(roomCode);
  if (!room) return;

  const { selectedProfessions, selectedItems } = normalizeEventSelection(msg);
  const resourceCount = selectedProfessions.length + selectedItems.length;

  room.activeEvent = null;
  resetEventSelection(room);

  if (resourceCount === 0) {
    const effectResult = { ...emptyEffectOutput(), statusChanges: applyHungerDebuff(room), foodChange: 0 };
    broadcastEventResolved(roomCode, room, 'food_replenish', 'failure', effectResult);
    waitForOutcomeConfirmations(roomCode, 'next_month');
    return;
  }

  for (const entry of selectedItems) consumeSelectedItem(room, entry);

  const replenishPerResource = room.config.packSettings.events.food_replenish.food_per_resource;
  const replenish = replenishPerResource * room.getActivePlayers().length * resourceCount;
  const foodDisplay = updateFood(room, replenish);
  const effectResult = { ...emptyEffectOutput(), statusChanges: clearHungerDebuff(room), foodChange: foodDisplay };

  broadcastEventResolved(roomCode, room, 'food_replenish', 'success', effectResult);
  waitForOutcomeConfirmations(roomCode, 'next_month');
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
  // Survival phase begins — force-reveal every characteristic of every player.
  room.revealAllPlayers();
  room.currentMonth = 0;
  room.totalMonths = room.bunker.duration?.months ?? parseDurationMonths(room.bunker.duration?.label);
  room.food = (room.bunker.food?.amount ?? 0) * active.length;
  room.foodMax = room.food;
  room.scheduledEvents = [];
  room.activeEvent = null;
  for (const player of active) {
    // Starting health reflects the survivor's health attribute — the sick
    // characters the council argued about enter the bunker already weakened.
    player.vital_status = { health: startingVitalHealth(player, room.config), sanity: 100, statuses: [] };
  }
  resetEventSelection(room);
  room.monthStartTime = Date.now();
  wsManager.broadcastState(roomCode, room);
  scheduleNextMonth(roomCode, room);
  return true;
}

function handleUpdateEventSelection(roomCode, playerId, msg) {
  const room = getRoomInStatus(roomCode);
  if (!room || !room.activeEvent || !isActivePlayer(room, playerId)) return;
  if (room.activeEvent.event_type === 'flavor') return;

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
  const room = getRoomInStatus(roomCode, 'running');
  if (!room || !isActivePlayer(room, playerId)) return;

  room.confirmedBunkerLife.add(playerId);
  confirmBotsForBunkerLife(room);
  wsManager.broadcastState(roomCode, room);
  tryStartBunkerLife(roomCode, room);
}

function handleForceStartBunkerLife(roomCode, playerId) {
  const room = getRoomInStatus(roomCode, 'running');
  if (!room || room.adminId !== playerId || room.isVoting) return;
  const active = room.getActivePlayers();

  room.confirmedBunkerLife = new Set(active.map(player => player.id));
  wsManager.broadcastState(roomCode, room);
  tryStartBunkerLife(roomCode, room);
}

function resolveChoiceEvent(roomCode, optionId) {
  const room = getRoomInStatus(roomCode);
  if (!room || !room.activeEvent) return;
  const event = room.activeEvent;
  const options = Array.isArray(event.__source?.options) ? event.__source.options : [];
  if (options.length === 0) return;
  const option = options.find(o => o.id === optionId) ?? options[0];

  // A player target is needed when the event declares a player picker; fall back
  // to a random active survivor so bot-only rooms never soft-lock.
  let selectedPlayerId = room.activeEventSelection.selected_player_id;
  if (getSelectKinds(event.select).includes('player') && !room.getPlayer(selectedPlayerId)?.is_active) {
    const active = room.getActivePlayers();
    selectedPlayerId = active.length ? active[Math.floor(Math.random() * active.length)].id : null;
  }

  // The picked resources (item/profession) scale the success chance: items
  // count as 1 each, professions by their skill tier (a better specialist
  // helps more). The total is capped at 90% unless the full mix (one of each
  // declared kind) is present, which lifts the cap to 100%.
  const resourceKinds = getSelectKinds(event.select).filter(k => k === 'item' || k === 'profession');
  const itemCount = room.activeEventSelection.selected_items.length;
  const profCount = room.activeEventSelection.selected_professions.length;
  const strength =
    (resourceKinds.includes('item') ? itemCount : 0) +
    (resourceKinds.includes('profession') ? professionSelectionStrength(room, room.activeEventSelection.selected_professions) : 0);
  const diverse = resourceKinds.every(k => (k === 'item' ? itemCount > 0 : profCount > 0));
  const selection = { count: strength, diverse };

  if (option.consume_items) {
    for (const entry of room.activeEventSelection.selected_items) consumeSelectedItem(room, entry);
  }

  const { effects, message } = buildOptionEffects(event, option, room, selectedPlayerId, selection);
  const context = eventContextOf(event);
  const effectResult = applyEffectsArray(room, effects, context);
  const finalMessage = injectItemPlaceholders(message, effectResult.itemChanges);

  room.activeEvent = null;
  resetEventSelection(room);

  settleOutcome(roomCode, room, event.id, option.id, effectResult, 'next_month', finalMessage);
}

function handleCastChoiceVote(roomCode, playerId, msg) {
  const room = getRoomInStatus(roomCode);
  if (!room || !room.activeEvent || !isActivePlayer(room, playerId)) return;
  const event = room.activeEvent;
  if (event.event_type !== 'choice' || !Array.isArray(event.options)) return;
  // Once the council's pick is locked in (pickers shown, awaiting confirm), a
  // late vote must not re-tally and swap the winning option out from under it.
  if (room.choicePendingSelection) return;

  const optionIds = event.options.map(o => o.id);
  const optionId = typeof msg?.option_id === 'string' && optionIds.includes(msg.option_id) ? msg.option_id : null;
  if (!optionId) return;

  room.choiceVotes[playerId] = optionId;

  // Bots mirror the triggering human's vote so they never override the
  // human's choice in a dev/test game with multiple bot players.
  for (const p of room.getActivePlayers()) {
    if (p.is_bot && !room.choiceVotes[p.id]) {
      room.choiceVotes[p.id] = optionId;
    }
  }

  wsManager.broadcastState(roomCode, room);

  // Once everyone has voted, either resolve or wait for the council's pick.
  const responded = new Set(Object.keys(room.choiceVotes));
  if (allResponded(roomCode, room, responded)) {
    finalizeChoiceVote(roomCode, tallyWinningOption(room.choiceVotes, optionIds));
  }
}

// Decides whether the winning option can resolve now, or must wait for the
// council to make a required picker choice. Picks are made by humans only and
// just synced; bots never choose. With no humans present, resolve immediately
// (the picker stays empty — player targets fall back to a random survivor).
function finalizeChoiceVote(roomCode, winningOptionId) {
  const room = rooms.get(roomCode);
  if (!room || !room.activeEvent) return;
  const options = Array.isArray(room.activeEvent.__source?.options) ? room.activeEvent.__source.options : [];
  const option = options.find(o => o.id === winningOptionId) ?? options[0];
  const missing = optionRequiredKinds(option).filter(k => !selectionHasKind(room, k));

  const humans = activeRespondents(roomCode, room).filter(p => !p.is_bot);
  if (missing.length === 0 || humans.length === 0) {
    resolveChoiceEvent(roomCode, winningOptionId);
    return;
  }

  // Wait: surface the winning option's pickers and a confirm step to the humans.
  room.choicePendingSelection = winningOptionId;
  wsManager.broadcastState(roomCode, room);
}

function handleConfirmChoiceSelection(roomCode, playerId) {
  const room = getRoomInStatus(roomCode);
  if (!room || !room.activeEvent || !room.choicePendingSelection || !isActivePlayer(room, playerId)) return;

  const winningOptionId = room.choicePendingSelection;
  room.choicePendingSelection = null;
  resolveChoiceEvent(roomCode, winningOptionId);
}

// Rolls back a pending decision so the council can vote again (e.g. they realize
// no suitable item/profession exists). Clears votes and the synced picks.
function handleCancelChoiceSelection(roomCode, playerId) {
  const room = getRoomInStatus(roomCode);
  if (!room || !room.activeEvent || !room.choicePendingSelection || !isActivePlayer(room, playerId)) return;

  room.choicePendingSelection = null;
  room.choiceVotes = {};
  room.activeEventSelection = { selected_player_id: null, selected_professions: [], selected_items: [] };
  wsManager.broadcastState(roomCode, room);
}

function handleResolveEvent(roomCode, playerId) {
  const room = getRoomInStatus(roomCode);
  if (!room || !room.activeEvent || !isActivePlayer(room, playerId)) return;

  const event = room.activeEvent;
  if (event.event_type !== 'flavor' && event.event_type !== 'food_replenish') return;

  if (!room.resolveConfirmations) room.resolveConfirmations = new Set();
  room.resolveConfirmations.add(playerId);
  for (const p of room.getActivePlayers()) {
    if (p.is_bot) room.resolveConfirmations.add(p.id);
  }
  wsManager.broadcastState(roomCode, room);

  if (allResponded(roomCode, room, room.resolveConfirmations)) {
    if (event.event_type === 'flavor') resolveFlavorEvent(roomCode);
    else resolveFoodReplenishEvent(roomCode, room.activeEventSelection);
  }
}

function handleConfirmOutcome(roomCode, playerId) {
  const room = getRoomInStatus(roomCode);
  if (!room || !room.outcomeConfirmations || !isActivePlayer(room, playerId)) return;

  room.outcomeConfirmations.add(playerId);
  wsManager.broadcastState(roomCode, room);

  if (allResponded(roomCode, room, room.outcomeConfirmations)) {
    executeOutcomeAction(roomCode);
  }
}

// A player just disconnected (already removed from wsManager). Any gate that was
// only waiting on them should now be re-evaluated against the remaining
// respondents so the event doesn't soft-lock for everyone still in the bunker.
function handlePlayerMaybeUnblock(roomCode, playerId) {
  const room = getRoomInStatus(roomCode);
  if (!room) return;

  // Flavor / food-replenish "ready" gate.
  if (room.activeEvent && room.resolveConfirmations && allResponded(roomCode, room, room.resolveConfirmations)) {
    const event = room.activeEvent;
    if (event.event_type === 'flavor') { resolveFlavorEvent(roomCode); return; }
    if (event.event_type === 'food_replenish') { resolveFoodReplenishEvent(roomCode, room.activeEventSelection); return; }
  }

  // Choice event still gathering votes.
  if (room.activeEvent?.event_type === 'choice' && !room.choicePendingSelection && Array.isArray(room.activeEvent.options)) {
    const optionIds = room.activeEvent.options.map(o => o.id);
    if (allResponded(roomCode, room, new Set(Object.keys(room.choiceVotes ?? {})))) {
      finalizeChoiceVote(roomCode, tallyWinningOption(room.choiceVotes, optionIds));
      return;
    }
  }

  // Choice event waiting on the council to confirm a picker, but every remaining
  // human is gone — resolve with whatever (possibly empty) selection stands.
  if (room.activeEvent?.event_type === 'choice' && room.choicePendingSelection) {
    const humans = activeRespondents(roomCode, room).filter(p => !p.is_bot);
    if (humans.length === 0) {
      const winningOptionId = room.choicePendingSelection;
      room.choicePendingSelection = null;
      resolveChoiceEvent(roomCode, winningOptionId);
      return;
    }
  }

  // Outcome modal gate.
  if (room.outcomeConfirmations && allResponded(roomCode, room, room.outcomeConfirmations)) {
    executeOutcomeAction(roomCode); return;
  }

  wsManager.broadcastState(roomCode, room);
}

module.exports = {
  startNextMonth,
  handleConfirmBunkerLife,
  handleForceStartBunkerLife,
  handleUpdateEventSelection,
  handleResolveEvent,
  handleConfirmOutcome,
  handleCastChoiceVote,
  handleConfirmChoiceSelection,
  handleCancelChoiceSelection,
  handlePlayerMaybeUnblock,
  confirmBotsForBunkerLife,
  tryStartBunkerLife,
};
