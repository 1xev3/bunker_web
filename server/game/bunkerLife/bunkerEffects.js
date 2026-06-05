// Pure domain logic for the bunker_life phase: applying declarative event
// effects, monthly vitals ticks, item/status manipulation and selection scoring.
//
// Nothing here touches the transport layer (wsManager) or the global `rooms`
// registry — every function operates on the `room` instance it is handed. This
// keeps the rules of the game independent of how they are delivered, so they can
// be exercised in isolation. The WebSocket orchestration lives in
// `server/ws/bunkerLifeHandlers.js`, which composes these primitives.

const {
  buildEffectPrimitives,
  buildSchedulePrimitives,
  pickOutcome,
  outcomeTone,
  selectionSuccessChance,
} = require('../config/yamlEvents');
const { renderEventText } = require('../../ws/eventHelpers');
const { Player } = require('../entities/player');

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

// Survivors never start the bunker phase below this, so even a terminal illness
// leaves a fighting chance rather than an instant death.
const MIN_START_HEALTH = 15;

// Starting bunker health derived from a survivor's health attribute. The
// condition's `severity` (points of health it costs at the worst stage) is
// scaled by the current stage's `multiplier`. Engine-universal: it reads only
// the generic severity/stage numbers the pack assigns, never a specific disease.
function startingVitalHealth(player, config) {
  const state = (config.HEALTH_STATES ?? []).find(e => e.value.id === player.health?.stateId);
  const severity = typeof state?.value?.severity === 'number' ? state.value.severity : 0;
  if (severity <= 0) return 100;
  const stage = (config.HEALTH_STAGES ?? []).find(e => e.value.id === player.health?.stageId);
  const stageMult = typeof stage?.value?.multiplier === 'number' ? stage.value.multiplier : 1;
  return Math.max(MIN_START_HEALTH, Math.round(100 - severity * stageMult));
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

/**
 * @typedef {Object} PlayerRef
 * @property {string} id
 * @property {string} name
 *
 * @typedef {Object} EffectOutput
 * @property {Array<{id:string,name:string,delta:number}>} healthChanges
 * @property {Array<{id:string,name:string,delta:number}>} sanityChanges
 * @property {Array<Object>} statusChanges
 * @property {number|undefined} foodChange
 * @property {PlayerRef|null} playerKilled
 * @property {PlayerRef[]} playersKilled
 * @property {PlayerRef[]} playersAdded
 * @property {Array<Object>} itemChanges
 * @property {boolean} roomChanged
 * @property {Object|null} scheduledEvent
 */

/** @returns {EffectOutput} A fresh, empty effect result accumulator. */
function emptyEffectOutput() {
  return {
    healthChanges: [], sanityChanges: [], statusChanges: [],
    foodChange: undefined, playerKilled: null, playersKilled: [],
    playersAdded: [], itemChanges: [], roomChanged: false, scheduledEvent: null,
  };
}

// Each handler mutates the shared `result` for a single effect kind. Keyed by
// `effect.type`; an unknown type is a no-op (returns the empty result).
const EFFECT_HANDLERS = {
  health_change: applyStatChangeEffect,
  sanity_change: applyStatChangeEffect,
  add_status: applyAddStatusEffect,
  clear_status: applyClearStatusEffect,
  food_change: applyFoodChangeEffect,
  set_flag: applySetFlagEffect,
  kill_random_active: applyKillRandomActiveEffect,
  add_room: (room, effect, context, result) => { result.roomChanged = room.bunker.addRoom([]); },
  remove_room: (room, effect, context, result) => { result.roomChanged = room.bunker.removeRandomRoom() !== null; },
  give_item: applyGiveItemEffect,
  steal_item: applyStealItemEffect,
  remove_item: applyRemoveItemEffect,
  add_bunker_item: applyAddBunkerItemEffect,
  remove_bunker_item: applyRemoveBunkerItemEffect,
  spawn_survivor: applySpawnSurvivorEffect,
  schedule_event: applyScheduleEventEffect,
};

/**
 * Applies a single declarative event effect to the room.
 * @returns {EffectOutput}
 */
function applyBunkerEventEffect(room, effect, context) {
  const result = emptyEffectOutput();
  if (!effect) return result;
  const handler = EFFECT_HANDLERS[effect.type];
  if (handler) handler(room, effect, context, result);
  return result;
}

function applyStatChangeEffect(room, effect, context, result) {
  const stat = effect.type === 'health_change' ? 'health' : 'sanity';
  const bucket = stat === 'health' ? result.healthChanges : result.sanityChanges;
  for (const target of getEffectTargets(room, effect)) {
    const delta = changePlayerStat(target, stat, Number(effect.value ?? 0));
    bucket.push({ id: target.id, name: target.name, delta });
    if (!target.is_active) result.playersKilled.push({ id: target.id, name: target.name });
  }
}

function applyAddStatusEffect(room, effect, context, result) {
  const status = normalizeStatus(effect);
  for (const target of getEffectTargets(room, effect)) {
    const vital = ensureVitalStatus(target);
    vital.statuses = vital.statuses.filter(existing => existing.id !== status.id);
    vital.statuses.push({ ...status });
    result.statusChanges.push({ id: target.id, name: target.name, status: { ...status }, action: 'added' });
  }
}

function applyClearStatusEffect(room, effect, context, result) {
  for (const target of getEffectTargets(room, effect)) {
    const vital = ensureVitalStatus(target);
    const before = vital.statuses.length;
    vital.statuses = effect.status_id
      ? vital.statuses.filter(status => status.id !== effect.status_id)
      : vital.statuses.filter(status => status.type !== (effect.status_type ?? 'debuff'));
    if (vital.statuses.length !== before) {
      result.statusChanges.push({ id: target.id, name: target.name, status_id: effect.status_id, action: 'cleared' });
    }
  }
}

function applyFoodChangeEffect(room, effect, context, result) {
  if (effect.mode === 'percent') {
    const percent = Math.abs(effect.value ?? 0);
    const loss = room.food > 0 ? Math.ceil((room.food * percent) / 100) : 0;
    result.foodChange = updateFood(room, -Math.min(room.food, loss));
    return;
  }
  result.foodChange = updateFood(room, effect.value ?? 0);
}

function applySetFlagEffect(room, effect) {
  if (!room.flags || typeof room.flags !== 'object') room.flags = {};
  if (typeof effect.key === 'string' && effect.key.trim() !== '') {
    room.flags[effect.key] = effect.value;
  }
}

function applyKillRandomActiveEffect(room, effect, context, result) {
  const participantIds = new Set(context?.participantIds ?? []);
  const candidates = room.getActivePlayers().filter(p => !participantIds.has(p.id));
  if (candidates.length > 0) {
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    target.is_active = false;
    result.playerKilled = { id: target.id, name: target.name };
  }
}

function applyGiveItemEffect(room, effect, context, result) {
  const item = resolveItemRef(room.config, effect.item_id, effect.random,
    [room.config?.BACKPACK_ITEMS ?? [], room.config?.BUNKER_ITEMS ?? []]);
  if (!item) return;
  const qty = effect.quantity > 0 ? effect.quantity : 1;
  for (const target of getEffectTargets(room, effect)) {
    giveItemToPlayer(target, item, qty);
    result.itemChanges.push({ id: target.id, name: target.name, item: item.label, quantity: qty, action: 'given' });
  }
}

function applyStealItemEffect(room, effect, context, result) {
  const thief = effect.to ? room.getPlayer(effect.to) : null;
  if (!thief) return;
  const donors = (effect.from_ids ?? [])
    .map(id => room.getPlayer(id))
    .filter(p => p && p.id !== thief.id && hasItems(p));
  if (donors.length === 0) return;
  const donor = donors[Math.floor(Math.random() * donors.length)];
  const stolen = removeItemFromPlayer(donor, effect.item_id, effect.random);
  if (stolen) {
    giveItemToPlayer(thief, stolen, 1);
    result.itemChanges.push({ id: donor.id, name: donor.name, item: stolen.label, action: 'removed' });
    result.itemChanges.push({ id: thief.id, name: thief.name, item: stolen.label, quantity: 1, action: 'given' });
  }
}

function applyRemoveItemEffect(room, effect, context, result) {
  for (const target of getEffectTargets(room, effect)) {
    const removed = removeItemFromPlayer(target, effect.item_id, effect.random);
    if (removed) result.itemChanges.push({ id: target.id, name: target.name, item: removed.label, action: 'removed' });
  }
}

function applyAddBunkerItemEffect(room, effect, context, result) {
  const item = resolveItemRef(room.config, effect.item_id, effect.random, [room.config?.BUNKER_ITEMS ?? []]);
  if (item && room.bunker.addItem({ id: item.id, label: item.label })) {
    result.roomChanged = true;
    result.itemChanges.push({ item: item.label, action: 'bunker_added' });
  }
}

function applyRemoveBunkerItemEffect(room, effect, context, result) {
  const removed = room.bunker.removeItem(effect.random ? null : effect.item_id);
  if (removed) {
    result.roomChanged = true;
    result.itemChanges.push({ item: removed.label ?? removed.id, action: 'bunker_removed' });
  }
}

function applySpawnSurvivorEffect(room, effect, context, result) {
  const parent = effect.parent_id ? room.getPlayer(effect.parent_id) : null;
  const child = spawnNewborn(room, parent, effect.name);
  result.playersAdded.push({ id: child.id, name: child.name });
}

function applyScheduleEventEffect(room, effect, context, result) {
  result.scheduledEvent = {
    event_id: effect.event_id,
    trigger_month: room.currentMonth + (effect.delay_months ?? 1),
    context: { roles: effect.roles ?? {} },
  };
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

module.exports = {
  startingVitalHealth,
  updateFood,
  applyMonthlyVitals,
  buildFlavorEffects,
  buildOptionEffects,
  applyEffectsArray,
  applyBunkerEventEffect,
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
  EFFECT_HANDLERS,
};
