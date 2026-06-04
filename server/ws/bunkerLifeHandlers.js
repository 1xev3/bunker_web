const { rooms, wsManager } = require('../state');
const {
  buildEffectPrimitives,
  buildSchedulePrimitives,
  pickOutcome,
  outcomeTone,
  selectionSuccessChance,
  getSelectKinds,
} = require('../game/config/yamlEvents');
const {
  parseDurationMonths,
  pickRandomEvent,
  materializeScheduledEvent,
  renderEventText,
} = require('./eventHelpers');
const { Player } = require('../game/entities/player');

const NEWBORN_NAMES = ['Малыш', 'Кроха', 'Найдёныш', 'Новорождённый', 'Пострел', 'Карапуз'];

// A child born in the bunker: a fresh survivor without the adult attributes,
// inheriting the parent's race when one is known.
function spawnNewborn(room, parent, name) {
  const used = new Set(room.players.map(p => p.name));
  const baseName = (typeof name === 'string' && name.trim()) ? name.trim() : NEWBORN_NAMES[Math.floor(Math.random() * NEWBORN_NAMES.length)];
  let finalName = baseName;
  let n = 2;
  while (used.has(finalName)) finalName = `${baseName} ${n++}`;
  const child = new Player(finalName);
  child.generateMinimalCharacter(room.config, { raceId: parent?.race?.id });
  room.addPlayer(child);
  return child;
}

function updateFood(room, delta) {
  const before = room.food;
  room.food = Math.max(0, room.food + delta);
  if (room.food > room.foodMax) room.foodMax = room.food;
  if (before <= 0 && room.food > 0) clearHungerDebuff(room);
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
  const status = {
    id: effect.status_id || `${stat}_${effect.value < 0 ? 'debuff' : 'buff'}`,
    label: effect.label || (effect.value < 0 ? 'Неблагоприятное состояние' : 'Поддержка'),
    type: effect.value < 0 ? 'debuff' : 'buff',
    stat,
    delta: Number(effect.value ?? 0),
    months: Math.max(1, Number(effect.months ?? 1)),
  };
  // Optional follow-up event fired when the status runs out (e.g. pregnancy → birth).
  if (effect.on_expire && typeof effect.on_expire.event === 'string') {
    status.on_expire = {
      event: effect.on_expire.event,
      carry_as: typeof effect.on_expire.carry_as === 'string' ? effect.on_expire.carry_as : 'self',
    };
  }
  return status;
}

function applyMonthlyVitals(room) {
  const result = { healthChanges: [], sanityChanges: [], statusChanges: [], playersKilled: [], expiredEvents: [] };
  const active = room.getActivePlayers();

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

    const expired = statuses.filter(status => status.months <= 0);
    vital.statuses = statuses.filter(status => status.months > 0);

    // A status that just ran out may trigger a follow-up event for its bearer
    // (only while they are still alive after this tick).
    if (player.is_active) {
      for (const status of expired) {
        if (status.on_expire?.event) {
          result.expiredEvents.push({
            event_id: status.on_expire.event,
            roles: { [status.on_expire.carry_as ?? 'self']: { id: player.id, name: player.name } },
          });
        }
      }
    }

    if (!player.is_active) result.playersKilled.push({ id: player.id, name: player.name });
  }

  return result;
}

function eventParticipantIds(event) {
  return event.participant_ids ?? [];
}

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

// Effects for a flavor event: declarative effects + scheduled follow-ups.
function buildFlavorEffects(event, room) {
  const def = event.__source ?? {};
  const roleMap = { ...(event.__roles ?? {}) };
  const participantIds = eventParticipantIds(event);
  return [
    ...buildEffectPrimitives(def.effects, roleMap, room, participantIds),
    ...buildSchedulePrimitives(def.schedule, roleMap, room),
  ];
}

// Picks the outcome for a chosen option. For outcomes_by_selection the success
// chance scales with how many resources were picked (selectionSuccessChance):
// `all` outcomes describe the win, `none`/`some` the loss. Falls back to
// outcomes/effects when no outcomes_by_selection is declared.
function resolveOptionOutcome(option, selection) {
  if (isPlainObject(option.outcomes_by_selection)) {
    return pickSelectionScaledOutcome(option.outcomes_by_selection, selection ?? {});
  }
  return Array.isArray(option.outcomes) && option.outcomes.length > 0
    ? pickOutcome(option.outcomes)
    : option;
}

function filterTone(list, pred) {
  return Array.isArray(list) ? list.filter(o => pred(outcomeTone(o))) : [];
}

function pickSelectionScaledOutcome(buckets, { count = 0, diverse = false }) {
  if (count <= 0) {
    const none = buckets.none ?? buckets.some ?? buckets.all;
    return Array.isArray(none) && none.length ? pickOutcome(none) : { effects: [] };
  }
  const success = selectionSuccessChance(count, diverse);
  const goodSource = (diverse ? buckets.all : buckets.some) ?? buckets.all ?? buckets.some;
  const badSource = buckets.none ?? buckets.some ?? buckets.all;
  const won = Math.random() * 100 < success;
  const goods = filterTone(goodSource, t => t !== 'bad');
  const bads = filterTone(badSource, t => t === 'bad');
  const pool = won ? (goods.length ? goods : goodSource) : (bads.length ? bads : badSource);
  return Array.isArray(pool) && pool.length ? pickOutcome(pool) : { effects: [] };
}

// Weighted contribution of the chosen professions to a selection's success:
// each picked profession (referenced by its owner's player id) adds its skill
// level's configured `multiplier`, so a better specialist helps more.
function professionSelectionStrength(room, playerIds) {
  const levels = room.config?.SKILL_LEVELS ?? [];
  let strength = 0;
  for (const id of playerIds ?? []) {
    const player = room.getPlayer(id);
    const entry = levels.find(e => e.value.id === player?.profession?.levelId);
    strength += typeof entry?.value?.multiplier === 'number' ? entry.value.multiplier : 1;
  }
  return strength;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Effects for a chosen option of a choice event. Returns { effects, message }.
function buildOptionEffects(event, option, room, selectedPlayerId, selection) {
  const roleMap = { ...(event.__roles ?? {}) };
  if (selectedPlayerId) roleMap.chosen = selectedPlayerId;
  const participantIds = eventParticipantIds(event);
  const resolved = resolveOptionOutcome(option, selection ?? { count: 0, diverse: false });
  const effects = [
    ...buildEffectPrimitives(resolved.effects, roleMap, room, participantIds),
    ...buildSchedulePrimitives(option.schedule ?? [], roleMap, room),
  ];
  const def = event.__source ?? {};
  const message = resolved.text != null
    ? renderEventText(resolved.text, def, roleMap, room)
    : null;
  return { effects, message };
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

// Resolves an item reference to a concrete { id, label }. With `random` (or no
// id) it picks any item from the given pack pools; otherwise it looks the id up
// to recover its label, falling back to the id itself.
function resolveItemRef(config, itemId, random, pools) {
  const all = pools.flat().filter(Boolean);
  if (random || !itemId) {
    if (all.length === 0) return null;
    const pick = all[Math.floor(Math.random() * all.length)];
    return { id: pick.id, label: pick.label ?? pick.id };
  }
  const found = all.find(i => i.id === itemId);
  return { id: itemId, label: found?.label ?? itemId };
}

// Whether a player carries anything that can be taken (inventory or backpack).
function hasItems(player) {
  return Boolean(player?.inventory?.id) || (Array.isArray(player?.backpack) && player.backpack.length > 0);
}

// Adds an item to a player's backpack, stacking with an existing entry.
function giveItemToPlayer(player, item, quantity = 1) {
  if (!Array.isArray(player.backpack)) player.backpack = [];
  const existing = player.backpack.find(i => i.id === item.id);
  if (existing) existing.quantity += quantity;
  else player.backpack.push({ id: item.id, label: item.label, quantity });
}

// Removes one item from a player — a specific id, or (random) any item they
// carry across inventory + backpack. Returns the removed { id, label } or null.
function removeItemFromPlayer(player, itemId, random) {
  const pool = [];
  if (player.inventory?.id) pool.push({ source: 'inventory', item: player.inventory });
  if (Array.isArray(player.backpack)) player.backpack.forEach(item => pool.push({ source: 'backpack', item }));
  if (pool.length === 0) return null;

  const entry = (random || !itemId)
    ? pool[Math.floor(Math.random() * pool.length)]
    : pool.find(e => e.item.id === itemId);
  if (!entry) return null;

  const removed = { id: entry.item.id, label: entry.item.label ?? entry.item.id };
  if (entry.source === 'inventory') {
    player.inventory = null;
  } else {
    entry.item.quantity = (entry.item.quantity ?? 1) - 1;
    if (entry.item.quantity <= 0) {
      const idx = player.backpack.indexOf(entry.item);
      if (idx !== -1) player.backpack.splice(idx, 1);
    }
  }
  return removed;
}

function applyBunkerEventEffect(room, effect, context) {
  const result = { healthChanges: [], sanityChanges: [], statusChanges: [], foodChange: undefined, playerKilled: null, playersKilled: [], playersAdded: [], itemChanges: [], roomChanged: false, scheduledEvent: null };
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
    if (effect.mode === 'percent') {
      const percent = Math.abs(effect.value ?? 0);
      const loss = room.food > 0 ? Math.ceil((room.food * percent) / 100) : 0;
      result.foodChange = updateFood(room, -Math.min(room.food, loss));
      return result;
    }
    result.foodChange = updateFood(room, effect.value ?? 0);
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

  if (effect.type === 'remove_room') {
    result.roomChanged = room.bunker.removeRandomRoom() !== null;
    return result;
  }

  if (effect.type === 'give_item') {
    const targets = getEffectTargets(room, effect);
    const item = resolveItemRef(room.config, effect.item_id, effect.random,
      [room.config?.BACKPACK_ITEMS ?? [], room.config?.BUNKER_ITEMS ?? []]);
    const qty = effect.quantity > 0 ? effect.quantity : 1;
    if (item) {
      for (const target of targets) {
        giveItemToPlayer(target, item, qty);
        result.itemChanges.push({ id: target.id, name: target.name, item: item.label, quantity: qty, action: 'given' });
      }
    }
    return result;
  }

  if (effect.type === 'steal_item') {
    const thief = effect.to ? room.getPlayer(effect.to) : null;
    if (!thief) return result;
    const donors = (effect.from_ids ?? [])
      .map(id => room.getPlayer(id))
      .filter(p => p && p.id !== thief.id && hasItems(p));
    if (donors.length === 0) return result;
    const donor = donors[Math.floor(Math.random() * donors.length)];
    const stolen = removeItemFromPlayer(donor, effect.item_id, effect.random);
    if (stolen) {
      giveItemToPlayer(thief, stolen, 1);
      result.itemChanges.push({ id: donor.id, name: donor.name, item: stolen.label, action: 'removed' });
      result.itemChanges.push({ id: thief.id, name: thief.name, item: stolen.label, quantity: 1, action: 'given' });
    }
    return result;
  }

  if (effect.type === 'remove_item') {
    const targets = getEffectTargets(room, effect);
    for (const target of targets) {
      const removed = removeItemFromPlayer(target, effect.item_id, effect.random);
      if (removed) result.itemChanges.push({ id: target.id, name: target.name, item: removed.label, action: 'removed' });
    }
    return result;
  }

  if (effect.type === 'add_bunker_item') {
    const item = resolveItemRef(room.config, effect.item_id, effect.random, [room.config?.BUNKER_ITEMS ?? []]);
    if (item && room.bunker.addItem({ id: item.id, label: item.label })) {
      result.roomChanged = true;
      result.itemChanges.push({ item: item.label, action: 'bunker_added' });
    }
    return result;
  }

  if (effect.type === 'remove_bunker_item') {
    const removed = room.bunker.removeItem(effect.random ? null : effect.item_id);
    if (removed) {
      result.roomChanged = true;
      result.itemChanges.push({ item: removed.label ?? removed.id, action: 'bunker_removed' });
    }
    return result;
  }

  if (effect.type === 'spawn_survivor') {
    const parent = effect.parent_id ? room.getPlayer(effect.parent_id) : null;
    const child = spawnNewborn(room, parent, effect.name);
    result.playersAdded.push({ id: child.id, name: child.name });
    return result;
  }

  if (effect.type === 'schedule_event') {
    result.scheduledEvent = {
      event_id: effect.event_id,
      trigger_month: room.currentMonth + (effect.delay_months ?? 1),
      context: { roles: effect.roles ?? {} },
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
    playersAdded: [],
    itemChanges: [],
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
    accumulated.playersAdded.push(...(r.playersAdded ?? []));
    accumulated.itemChanges.push(...(r.itemChanges ?? []));
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
    for (const bunkerRoom of room.bunker.rooms) {
      if (!Array.isArray(bunkerRoom.items)) continue;
      const roomItemIdx = bunkerRoom.items.findIndex(item => item.id === entry.item_id);
      if (roomItemIdx !== -1) { bunkerRoom.items.splice(roomItemIdx, 1); return; }
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
  room.choicePendingSelection = null;
  room.resolveConfirmations = new Set();
}

// Picker kinds an option asks the council to choose (player/item/profession).
function optionRequiredKinds(option) {
  return Array.isArray(option?.requires)
    ? option.requires.filter(k => k === 'player' || k === 'item' || k === 'profession')
    : [];
}

function selectionHasKind(room, kind) {
  const sel = room.activeEventSelection;
  if (kind === 'player') return Boolean(room.getPlayer(sel.selected_player_id)?.is_active);
  if (kind === 'item') return sel.selected_items.length > 0;
  if (kind === 'profession') return sel.selected_professions.length > 0;
  return true;
}

// Substitutes {item}/{items} in an outcome message with the names of the items
// the effects actually produced (resolved after `random` picks). {item} is the
// first produced item; {items} is the full list ("a, b и c").
function injectItemPlaceholders(text, itemChanges) {
  if (typeof text !== 'string' || !text.includes('{item')) return text;
  const labels = [...new Set((itemChanges ?? []).map(c => c.item).filter(Boolean))];
  const joined = labels.length <= 1
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} и ${labels[labels.length - 1]}`;
  return text.replace(/\{items\}/g, joined).replace(/\{item\}/g, labels[0] ?? '');
}

function broadcastEventResolved(roomCode, room, eventId, outcome, effectResult, message = null) {
  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
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
  });
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
  wsManager.broadcastState(roomCode, room);
  if (action === 'next_month') {
    scheduleNextMonth(roomCode, room);
  }
}

function eventContextOf(event, extra = {}) {
  return { participantIds: event.participant_ids ?? [], ...extra };
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
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

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
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const event = room.activeEvent;
  if (event.event_type !== 'flavor') return;

  const context = eventContextOf(event);
  const effectResult = applyEffectsArray(room, buildFlavorEffects(event, room), context);

  room.activeEvent = null;
  resetEventSelection(room);

  settleOutcome(roomCode, room, event.id, 'resolved', effectResult, 'next_month');
}

const HUNGER_HEALTH_STATUS = { id: 'hunger', label: 'Голод', type: 'debuff', stat: 'health', delta: -35, months: 99 };
const HUNGER_SANITY_STATUS = { id: 'hunger_sanity', label: 'Голод', type: 'debuff', stat: 'sanity', delta: -20, months: 99 };

function applyHungerDebuff(room) {
  const statusChanges = [];
  for (const player of room.getActivePlayers()) {
    const vital = ensureVitalStatus(player);
    vital.statuses = vital.statuses.filter(s => s.id !== 'hunger' && s.id !== 'hunger_sanity');
    vital.statuses.push({ ...HUNGER_HEALTH_STATUS }, { ...HUNGER_SANITY_STATUS });
    statusChanges.push(
      { id: player.id, name: player.name, status: { ...HUNGER_HEALTH_STATUS }, action: 'added' },
      { id: player.id, name: player.name, status: { ...HUNGER_SANITY_STATUS }, action: 'added' },
    );
  }
  return statusChanges;
}

function clearHungerDebuff(room) {
  const statusChanges = [];
  for (const player of room.getActivePlayers()) {
    const vital = ensureVitalStatus(player);
    const before = vital.statuses.length;
    vital.statuses = vital.statuses.filter(s => s.id !== 'hunger' && s.id !== 'hunger_sanity');
    if (vital.statuses.length !== before) {
      statusChanges.push({ id: player.id, name: player.name, status_id: 'hunger', action: 'cleared' });
    }
  }
  return statusChanges;
}

function resolveFoodReplenishEvent(roomCode, msg) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

  const { selectedProfessions, selectedItems } = normalizeEventSelection(msg);
  const resourceCount = selectedProfessions.length + selectedItems.length;

  room.activeEvent = null;
  resetEventSelection(room);

  if (resourceCount === 0) {
    const statusChanges = applyHungerDebuff(room);
    wsManager.broadcast(roomCode, {
      type: 'event_resolved',
      event_id: 'food_replenish',
      outcome: 'failure',
      health_changes: [],
      sanity_changes: [],
      status_changes: statusChanges,
      food_change: 0,
      players_killed: [],
      room_changed: false,
      players_added: [],
    });
    waitForOutcomeConfirmations(roomCode, 'next_month');
    return;
  }

  for (const entry of selectedItems) consumeSelectedItem(room, entry);

  const replenishPerResource = room.config.packSettings.events.food_replenish.food_per_resource;
  const replenish = replenishPerResource * room.getActivePlayers().length * resourceCount;
  const foodDisplay = updateFood(room, replenish);
  const statusChanges = clearHungerDebuff(room);

  wsManager.broadcast(roomCode, {
    type: 'event_resolved',
    event_id: 'food_replenish',
    outcome: 'success',
    health_changes: [],
    sanity_changes: [],
    status_changes: statusChanges,
    food_change: foodDisplay,
    players_killed: [],
    room_changed: false,
    players_added: [],
  });

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
  room.currentMonth = 0;
  room.totalMonths = room.bunker.duration?.months ?? parseDurationMonths(room.bunker.duration?.label);
  room.food = (room.bunker.food?.amount ?? 0) * active.length;
  room.foodMax = room.food;
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

// Highest-voted option wins; ties break by declaration order.
function tallyWinningOption(votes, optionIds) {
  const counts = {};
  for (const optionId of Object.values(votes)) counts[optionId] = (counts[optionId] ?? 0) + 1;
  let best = optionIds[0];
  let bestCount = -1;
  for (const id of optionIds) {
    const count = counts[id] ?? 0;
    if (count > bestCount) { best = id; bestCount = count; }
  }
  return best;
}

function resolveChoiceEvent(roomCode, optionId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
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
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) {
    console.log(`[ws] cast_choice_vote ignored: room=${!!room} status=${room?.status} activeEvent=${!!room?.activeEvent}`);
    return;
  }
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) {
    console.log(`[ws] cast_choice_vote ignored: player=${!!player} is_active=${player?.is_active}`);
    return;
  }
  const event = room.activeEvent;
  if (event.event_type !== 'choice' || !Array.isArray(event.options)) {
    console.log(`[ws] cast_choice_vote ignored: event_type=${event.event_type} options=${Array.isArray(event.options) ? event.options.length : 'not-array'}`);
    return;
  }

  const optionIds = event.options.map(o => o.id);
  const optionId = typeof msg?.option_id === 'string' && optionIds.includes(msg.option_id) ? msg.option_id : null;
  if (!optionId) {
    console.log(`[ws] cast_choice_vote ignored: option_id='${msg?.option_id}' not in [${optionIds.join(', ')}]`);
    return;
  }
  console.log(`[ws] cast_choice_vote accepted: player=${playerId} option=${optionId}`);

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
  const all = allResponded(roomCode, room, responded);
  console.log(`[ws] cast_choice_vote tally: voted=${responded.size} allResponded=${all}`);
  if (all) {
    const winner = tallyWinningOption(room.choiceVotes, optionIds);
    console.log(`[ws] finalizeChoiceVote winner=${winner}`);
    finalizeChoiceVote(roomCode, winner);
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
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent || !room.choicePendingSelection) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;

  const winningOptionId = room.choicePendingSelection;
  room.choicePendingSelection = null;
  resolveChoiceEvent(roomCode, winningOptionId);
}

// Rolls back a pending decision so the council can vote again (e.g. they realize
// no suitable item/profession exists). Clears votes and the synced picks.
function handleCancelChoiceSelection(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent || !room.choicePendingSelection) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;

  room.choicePendingSelection = null;
  room.choiceVotes = {};
  room.activeEventSelection = { selected_player_id: null, selected_professions: [], selected_items: [] };
  wsManager.broadcastState(roomCode, room);
}

function handleResolveEvent(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.activeEvent) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;

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
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life' || !room.outcomeConfirmations) return;
  const player = room.getPlayer(playerId);
  if (!player || !player.is_active) return;

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
  const room = rooms.get(roomCode);
  if (!room || room.status !== 'bunker_life') return;

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
