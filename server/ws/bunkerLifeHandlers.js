const { rooms, wsManager } = require('../state');
const {
  parseDurationMonths,
  parseFoodMonths,
  pickRandomEvent,
  materializeEventParticipants,
  resolveEventParticipants,
} = require('./eventHelpers');

function applyBunkerEventEffect(room, effect) {
  const result = { survivalChange: 0, foodChange: undefined };
  if (!effect) return result;

  if (effect.type === 'survival_change') {
    result.survivalChange = effect.value;
    room.survivalChance = Math.max(
      0,
      Math.min(room.config.packSettings.bunker_life.max_survival_chance, room.survivalChance + effect.value),
    );
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

function startNextMonth(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  room.currentMonth++;
  room.monthStartTime = Date.now();

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

function resolveFoodReplenishEvent(roomCode, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  const selectedProfessions = Array.isArray(msg.selected_professions) ? msg.selected_professions : [];
  const selectedItems = Array.isArray(msg.selected_items) ? msg.selected_items : [];
  const resourceCount = selectedProfessions.length + selectedItems.length;

  room.activeEvent = null;

  if (resourceCount === 0) {
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

function handleResolveEvent(roomCode, playerId, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;

  const event = room.activeEvent;
  if (event.event_type === 'passive') { resolvePassiveEvent(roomCode); return; }
  if (event.event_type === 'food_replenish') { resolveFoodReplenishEvent(roomCode, msg); return; }

  const selectedProfessions = Array.isArray(msg.selected_professions) ? msg.selected_professions : [];
  const selectedItems = Array.isArray(msg.selected_items) ? msg.selected_items : [];

  const successChances = room.config.packSettings.events.success_chances;
  const resourceCount = selectedProfessions.length + selectedItems.length;
  let successChance;
  if (resourceCount === 0) successChance = event.base_chance;
  else if (resourceCount === 1) successChance = successChances.one_resource;
  else if (resourceCount === 2) successChance = successChances.two_resources;
  else successChance = successChances.three_plus_resources;

  const succeeded = Math.random() < successChance;
  const effect = succeeded ? event.success_effect : event.failure_effect;

  for (const entry of selectedItems) consumeSelectedItem(room, entry);

  const effectResult = applyBunkerEventEffect(room, effect);
  room.activeEvent = null;

  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
    event_id: event.id,
    outcome: succeeded ? 'success' : 'failure',
    survival_change: effectResult.survivalChange,
    survival_chance: room.survivalChance,
    food_change: effectResult.foodChange,
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

module.exports = {
  startNextMonth,
  handleConfirmBunkerLife,
  handleResolveEvent,
  confirmBotsForBunkerLife,
  tryStartBunkerLife,
};
