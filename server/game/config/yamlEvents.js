const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getPlayerAttributeLabel } = require('./playerAttributes');

const EVENT_TYPES = new Set(['flavor', 'choice']);
const TARGET_KEYWORDS = new Set(['all', 'others', 'random']);
const STATUS_STATS = new Set(['health', 'sanity']);

// ---------------------------------------------------------------------------
// Loading & normalization
// ---------------------------------------------------------------------------

function normalizeEvent(raw, filePath) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${path.basename(filePath)}: ожидается один объект события`);
  }
  return {
    id: raw.id,
    type: raw.type === 'choice' ? 'choice' : 'flavor',
    weight: typeof raw.weight === 'number' && raw.weight > 0 ? raw.weight : 1,
    scheduled_only: raw.scheduled_only === true,
    when: raw.when ?? null,
    participants: raw.participants ?? null,
    title: raw.title,
    text: raw.text,
    effects: Array.isArray(raw.effects) ? raw.effects : [],
    options: Array.isArray(raw.options) ? raw.options : null,
    schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
    select: raw.select ?? null,
    __file: filePath,
  };
}

function loadYamlEventFile(filePath) {
  const raw = yaml.load(fs.readFileSync(filePath, 'utf8'));
  return normalizeEvent(raw, filePath);
}

// Reads every *.yaml in the Events dir except files prefixed with "_" (settings).
function readYamlEventsDirectory(eventsDir) {
  return fs.readdirSync(eventsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.yaml') && !entry.name.startsWith('_'))
    .map(entry => path.join(eventsDir, entry.name))
    .sort((a, b) => a.localeCompare(b))
    .map(loadYamlEventFile);
}

// ---------------------------------------------------------------------------
// Schema validation (used by validator.js)
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateEffect(effect, scope, errors) {
  if (!isPlainObject(effect)) { errors.push(`${scope}: ожидается объект эффекта`); return; }
  const hasTargetedOp = ['health', 'sanity', 'status', 'clear_status', 'kill'].some(k => effect[k] !== undefined);
  if (hasTargetedOp && effect.on === undefined) {
    errors.push(`${scope}.on: эффект действует на цель, укажите on (роль, all, others или random)`);
  }
  if (effect.health !== undefined && typeof effect.health !== 'number') errors.push(`${scope}.health: ожидается число`);
  if (effect.sanity !== undefined && typeof effect.sanity !== 'number') errors.push(`${scope}.sanity: ожидается число`);
  if (effect.status !== undefined) {
    const s = effect.status;
    if (!isPlainObject(s)) errors.push(`${scope}.status: ожидается объект {id,label,stat,value,months}`);
    else {
      if (typeof s.id !== 'string' || s.id.trim() === '') errors.push(`${scope}.status.id: ожидается непустая строка`);
      if (typeof s.label !== 'string' || s.label.trim() === '') errors.push(`${scope}.status.label: ожидается непустая строка`);
      if (!STATUS_STATS.has(s.stat)) errors.push(`${scope}.status.stat: ожидается "health" или "sanity"`);
      if (typeof s.value !== 'number') errors.push(`${scope}.status.value: ожидается число`);
      if (!Number.isInteger(s.months) || s.months < 1) errors.push(`${scope}.status.months: ожидается целое число месяцев >= 1`);
    }
  }
  if (effect.food !== undefined && typeof effect.food !== 'number' && typeof effect.food !== 'string') {
    errors.push(`${scope}.food: ожидается число (добавить) или строка "N%" (потерять процент)`);
  }
  if (effect.flag !== undefined && !isPlainObject(effect.flag)) errors.push(`${scope}.flag: ожидается объект { имя_флага: значение }`);
}

function validateEffectsArray(effects, scope, errors) {
  if (!Array.isArray(effects)) { errors.push(`${scope}: ожидается массив эффектов`); return; }
  effects.forEach((eff, i) => validateEffect(eff, `${scope}[${i}]`, errors));
}

function validateWhen(when, scope, errors) {
  if (!isPlainObject(when)) { errors.push(`${scope}: ожидается объект условий`); return; }
  for (const key of ['min_month', 'max_month', 'min_players', 'max_players']) {
    if (when[key] !== undefined && typeof when[key] !== 'number') errors.push(`${scope}.${key}: ожидается число`);
  }
  for (const key of ['flag_set', 'flag_unset']) {
    if (when[key] !== undefined && !(Array.isArray(when[key]) && when[key].every(f => typeof f === 'string'))) {
      errors.push(`${scope}.${key}: ожидается массив строк-флагов`);
    }
  }
}

function validateParticipants(participants, scope, errors) {
  if (!isPlainObject(participants)) { errors.push(`${scope}: ожидается объект ролей`); return; }
  for (const [role, crit] of Object.entries(participants)) {
    if (!isPlainObject(crit)) { errors.push(`${scope}.${role}: ожидается объект критериев`); continue; }
    if (crit.min_age !== undefined && typeof crit.min_age !== 'number') errors.push(`${scope}.${role}.min_age: ожидается число`);
    if (crit.max_age !== undefined && typeof crit.max_age !== 'number') errors.push(`${scope}.${role}.max_age: ожидается число`);
    if (crit.gender !== undefined && typeof crit.gender !== 'string') errors.push(`${scope}.${role}.gender: ожидается строка-метка пола`);
    if (crit.profession !== undefined && typeof crit.profession !== 'string') errors.push(`${scope}.${role}.profession: ожидается строка-метка профессии`);
  }
}

function validateSchedule(schedule, scope, errors) {
  schedule.forEach((s, i) => {
    if (!isPlainObject(s)) { errors.push(`${scope}[${i}]: ожидается объект`); return; }
    if (typeof s.event !== 'string' || s.event.trim() === '') errors.push(`${scope}[${i}].event: ожидается id события`);
    if (s.in !== undefined && (!Number.isInteger(s.in) || s.in < 1)) errors.push(`${scope}[${i}].in: ожидается целое число месяцев >= 1`);
    if (s.carry !== undefined && !(Array.isArray(s.carry) && s.carry.every(r => typeof r === 'string'))) {
      errors.push(`${scope}[${i}].carry: ожидается массив имён ролей`);
    }
    if (s.chance !== undefined && (typeof s.chance !== 'number' || s.chance < 0 || s.chance > 100)) {
      errors.push(`${scope}[${i}].chance: ожидается число от 0 до 100`);
    }
  });
}

function validateOption(option, scope, errors) {
  if (!isPlainObject(option)) { errors.push(`${scope}: ожидается объект варианта`); return; }
  if (typeof option.id !== 'string' || option.id.trim() === '') errors.push(`${scope}.id: ожидается непустая строка`);
  if (typeof option.label !== 'string' || option.label.trim() === '') errors.push(`${scope}.label: ожидается непустая строка`);
  const hasOutcomes = Array.isArray(option.outcomes) && option.outcomes.length > 0;
  const hasEffects = Array.isArray(option.effects);
  if (!hasOutcomes && !hasEffects) errors.push(`${scope}: ожидается либо effects, либо непустой массив outcomes`);
  if (hasEffects) validateEffectsArray(option.effects, `${scope}.effects`, errors);
  if (hasOutcomes) {
    option.outcomes.forEach((o, i) => {
      if (!isPlainObject(o)) { errors.push(`${scope}.outcomes[${i}]: ожидается объект`); return; }
      if (o.chance !== undefined && (typeof o.chance !== 'number' || o.chance < 0 || o.chance > 100)) {
        errors.push(`${scope}.outcomes[${i}].chance: ожидается число от 0 до 100 (или отсутствует — остаток)`);
      }
      validateEffectsArray(o.effects ?? [], `${scope}.outcomes[${i}].effects`, errors);
    });
  }
  if (option.schedule !== undefined) {
    if (!Array.isArray(option.schedule)) errors.push(`${scope}.schedule: ожидается массив`);
    else validateSchedule(option.schedule, `${scope}.schedule`, errors);
  }
}

// Validates one normalized event. Returns an array of error strings.
function validateEvent(event, scope) {
  const errors = [];
  if (typeof event.id !== 'string' || event.id.trim() === '') errors.push(`${scope}.id: ожидается непустая строка`);
  if (!EVENT_TYPES.has(event.type)) errors.push(`${scope}.type: ожидается "flavor" или "choice"`);
  if (typeof event.title !== 'string' || event.title.trim() === '') errors.push(`${scope}.title: ожидается непустая строка`);
  if (typeof event.text !== 'string' || event.text.trim() === '') errors.push(`${scope}.text: ожидается непустая строка`);
  if (event.when) validateWhen(event.when, `${scope}.when`, errors);
  if (event.participants) validateParticipants(event.participants, `${scope}.participants`, errors);
  validateEffectsArray(event.effects, `${scope}.effects`, errors);
  validateSchedule(event.schedule, `${scope}.schedule`, errors);
  if (event.select) {
    if (!['player', 'item'].includes(event.select.kind)) errors.push(`${scope}.select.kind: ожидается "player" или "item"`);
  }
  if (event.type === 'choice') {
    if (!Array.isArray(event.options) || event.options.length === 0) {
      errors.push(`${scope}.options: для choice-события ожидается непустой массив вариантов`);
    } else {
      const seen = new Set();
      event.options.forEach((opt, i) => {
        validateOption(opt, `${scope}.options[${i}]`, errors);
        if (opt && typeof opt.id === 'string') {
          if (seen.has(opt.id)) errors.push(`${scope}.options[${i}].id: дублирующийся id варианта "${opt.id}"`);
          seen.add(opt.id);
        }
      });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Runtime: eligibility, participant selection, effect building
// ---------------------------------------------------------------------------

function matchesWhen(when, room) {
  if (!when) return true;
  const month = room.currentMonth ?? 0;
  const playerCount = room.getActivePlayers().length;
  if (when.min_month != null && month < when.min_month) return false;
  if (when.max_month != null && month > when.max_month) return false;
  if (when.min_players != null && playerCount < when.min_players) return false;
  if (when.max_players != null && playerCount > when.max_players) return false;
  if (Array.isArray(when.flag_set) && !when.flag_set.every(f => Boolean(room.flags?.[f]))) return false;
  if (Array.isArray(when.flag_unset) && !when.flag_unset.every(f => !room.flags?.[f])) return false;
  return true;
}

function matchesCriteria(player, crit) {
  if (!crit) return true;
  const age = player.gender?.age ?? 0;
  if (crit.min_age != null && age < crit.min_age) return false;
  if (crit.max_age != null && age > crit.max_age) return false;
  if (crit.gender && getPlayerAttributeLabel(player, 'gender') !== crit.gender) return false;
  if (crit.profession && getPlayerAttributeLabel(player, 'profession') !== crit.profession) return false;
  return true;
}

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Returns a role->player map, or null if any required role can't be filled.
// Roles are always assigned distinct players.
function selectParticipants(spec, room) {
  if (!spec || Object.keys(spec).length === 0) return {};
  const active = room.getActivePlayers();
  const usedIds = new Set();
  const roleMap = {};
  for (const [role, crit] of Object.entries(spec)) {
    const candidates = active.filter(p => !usedIds.has(p.id) && matchesCriteria(p, crit));
    if (candidates.length === 0) return null;
    const picked = randomOf(candidates);
    roleMap[role] = picked;
    usedIds.add(picked.id);
  }
  return roleMap;
}

// roleMap here maps role -> playerId (string).
function targetIdsFor(on, roleMap, room, participantIds) {
  const active = room.getActivePlayers();
  if (on === 'all') return active.map(p => p.id);
  if (on === 'others') {
    const excluded = new Set(participantIds ?? []);
    return active.filter(p => !excluded.has(p.id)).map(p => p.id);
  }
  if (on === 'random') return active.length ? [randomOf(active).id] : [];
  const id = roleMap?.[on];
  return id && room.getPlayer(id)?.is_active ? [id] : [];
}

function parseFoodEffect(food) {
  if (typeof food === 'string') {
    const percent = parseFloat(food);
    if (Number.isFinite(percent)) return { type: 'food_change', value: -Math.abs(percent), mode: 'percent' };
    return null;
  }
  if (typeof food === 'number') return { type: 'food_change', value: food, mode: 'absolute' };
  return null;
}

// Translates declarative effect objects into the flat primitives consumed by
// applyBunkerEventEffect. roleMap maps role -> playerId.
function buildEffectPrimitives(effects, roleMap, room, participantIds) {
  const out = [];
  for (const eff of effects ?? []) {
    if (!eff || typeof eff !== 'object') continue;
    const ids = targetIdsFor(eff.on, roleMap, room, participantIds);
    if (typeof eff.health === 'number') for (const id of ids) out.push({ type: 'health_change', target: id, value: eff.health });
    if (typeof eff.sanity === 'number') for (const id of ids) out.push({ type: 'sanity_change', target: id, value: eff.sanity });
    if (eff.status) {
      for (const id of ids) out.push({
        type: 'add_status', target: id,
        status_id: eff.status.id, label: eff.status.label,
        stat: eff.status.stat, value: eff.status.value, months: eff.status.months,
      });
    }
    if (eff.clear_status) {
      for (const id of ids) {
        out.push(eff.clear_status === 'debuffs'
          ? { type: 'clear_status', target: id, status_type: 'debuff' }
          : { type: 'clear_status', target: id, status_id: eff.clear_status });
      }
    }
    if (eff.kill) for (const id of ids) out.push({ type: 'health_change', target: id, value: -1000 });
    if (eff.food !== undefined) {
      const foodEffect = parseFoodEffect(eff.food);
      if (foodEffect) out.push(foodEffect);
    }
    if (isPlainObject(eff.flag)) {
      for (const [key, value] of Object.entries(eff.flag)) out.push({ type: 'set_flag', key, value });
    }
    if (eff.kill_random) out.push({ type: 'kill_random_active' });
    if (eff.add_room) out.push({ type: 'add_room' });
  }
  return out;
}

function buildSchedulePrimitives(schedule, roleMap, room) {
  const out = [];
  for (const s of schedule ?? []) {
    if (s.chance != null && Math.random() * 100 >= s.chance) continue;
    const roles = {};
    for (const role of s.carry ?? []) {
      const id = roleMap?.[role];
      const player = id ? room.getPlayer(id) : null;
      if (player) roles[role] = { id: player.id, name: player.name };
    }
    out.push({ type: 'schedule_event', event_id: s.event, delay_months: s.in ?? 1, roles });
  }
  return out;
}

// Picks one outcome by cumulative chance. An outcome without `chance` is the
// remainder catch-all (should be last).
function pickOutcome(outcomes) {
  const roll = Math.random() * 100;
  let acc = 0;
  for (const outcome of outcomes) {
    if (outcome.chance == null) return outcome;
    acc += outcome.chance;
    if (roll < acc) return outcome;
  }
  return outcomes[outcomes.length - 1];
}

module.exports = {
  readYamlEventsDirectory,
  loadYamlEventFile,
  validateEvent,
  matchesWhen,
  selectParticipants,
  buildEffectPrimitives,
  buildSchedulePrimitives,
  pickOutcome,
  TARGET_KEYWORDS,
};
