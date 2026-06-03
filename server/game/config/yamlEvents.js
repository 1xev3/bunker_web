const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getPlayerAttributeLabel } = require('./playerAttributes');

const EVENT_TYPES = new Set(['flavor', 'choice']);
const TARGET_KEYWORDS = new Set(['all', 'others', 'random']);
const STATUS_STATS = new Set(['health', 'sanity']);
const SELECT_KINDS = new Set(['player', 'item', 'profession']);
const SELECTION_BUCKETS = new Set(['all', 'some', 'none']);

// A `select` block may declare a single `kind` or a `kinds` array. Resource
// pickers (item/profession) gate selection-based outcomes; `player` is a target.
function getSelectKinds(select) {
  if (!select) return [];
  const raw = Array.isArray(select.kinds) ? select.kinds : (select.kind ? [select.kind] : []);
  return raw.filter(k => SELECT_KINDS.has(k));
}

// ---------------------------------------------------------------------------
// Loading & normalization
// ---------------------------------------------------------------------------

function normalizeEvent(raw, filePath) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${path.basename(filePath)}: ожидается объект события`);
  }
  return {
    id: raw.id,
    type: raw.type === 'choice' ? 'choice' : 'flavor',
    weight: typeof raw.weight === 'number' && raw.weight > 0 ? raw.weight : 1,
    scheduled_only: raw.scheduled_only === true,
    when: raw.when ?? null,
    participants: raw.participants ?? null,
    vars: isPlainObject(raw.vars) ? raw.vars : null,
    title: raw.title,
    text: raw.text,
    effects: Array.isArray(raw.effects) ? raw.effects : [],
    options: Array.isArray(raw.options) ? raw.options : null,
    schedule: Array.isArray(raw.schedule) ? raw.schedule : [],
    select: raw.select ?? null,
    __file: filePath,
  };
}

// A single YAML file may declare one event (top-level object), or several:
// either a top-level list of events, or an object with an `events:` list.
// Bundling related events (e.g. an event and its scheduled follow-ups) in one
// file keeps chains together.
function normalizeEventFileContents(raw, filePath) {
  let list;
  if (Array.isArray(raw)) list = raw;
  else if (raw && Array.isArray(raw.events)) list = raw.events;
  else list = [raw];
  if (list.length === 0) {
    throw new Error(`${path.basename(filePath)}: файл не содержит событий`);
  }
  return list.map(entry => normalizeEvent(entry, filePath));
}

function loadYamlEventFile(filePath) {
  const raw = yaml.load(fs.readFileSync(filePath, 'utf8'));
  return normalizeEventFileContents(raw, filePath);
}

// Reads every *.yaml in the Events dir except files prefixed with "_" (settings).
// Each file may yield one or more events, so results are flattened.
function readYamlEventsDirectory(eventsDir) {
  return fs.readdirSync(eventsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.yaml') && !entry.name.startsWith('_'))
    .map(entry => path.join(eventsDir, entry.name))
    .sort((a, b) => a.localeCompare(b))
    .flatMap(loadYamlEventFile);
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
      if (s.on_expire !== undefined) {
        const e = s.on_expire;
        if (!isPlainObject(e)) errors.push(`${scope}.status.on_expire: ожидается объект { event, carry_as? }`);
        else {
          if (typeof e.event !== 'string' || e.event.trim() === '') errors.push(`${scope}.status.on_expire.event: ожидается id события`);
          if (e.carry_as !== undefined && (typeof e.carry_as !== 'string' || e.carry_as.trim() === '')) {
            errors.push(`${scope}.status.on_expire.carry_as: ожидается непустая строка-имя роли`);
          }
        }
      }
    }
  }
  if (effect.food !== undefined && typeof effect.food !== 'number' && typeof effect.food !== 'string') {
    errors.push(`${scope}.food: ожидается число (добавить) или строка "N%" (потерять процент)`);
  }
  if (effect.flag !== undefined && !isPlainObject(effect.flag)) errors.push(`${scope}.flag: ожидается объект { имя_флага: значение }`);
  if (effect.spawn_survivor !== undefined) {
    const s = effect.spawn_survivor;
    if (typeof s !== 'boolean' && !isPlainObject(s)) {
      errors.push(`${scope}.spawn_survivor: ожидается true или объект { name }`);
    } else if (isPlainObject(s) && s.name !== undefined && typeof s.name !== 'string') {
      errors.push(`${scope}.spawn_survivor.name: ожидается строка`);
    }
  }
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

// `vars` declares named alternatives referenced in text as {event.<name>}.
// A value may be a string (used as-is) or a non-empty list of strings (one is
// picked at random each time the event fires).
function validateVars(vars, scope, errors) {
  if (!isPlainObject(vars)) { errors.push(`${scope}: ожидается объект { имя: строка | список строк }`); return; }
  for (const [name, value] of Object.entries(vars)) {
    if (Array.isArray(value)) {
      if (value.length === 0) errors.push(`${scope}.${name}: список вариантов не должен быть пустым`);
      else if (!value.every(v => typeof v === 'string')) errors.push(`${scope}.${name}: ожидается список строк`);
    } else if (typeof value !== 'string') {
      errors.push(`${scope}.${name}: ожидается строка или список строк`);
    }
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
  const hasSelectionOutcomes = isPlainObject(option.outcomes_by_selection);
  if (!hasOutcomes && !hasEffects && !hasSelectionOutcomes) {
    errors.push(`${scope}: ожидается либо effects, либо непустой массив outcomes, либо outcomes_by_selection`);
  }
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
  if (option.outcomes_by_selection !== undefined) {
    if (!hasSelectionOutcomes) {
      errors.push(`${scope}.outcomes_by_selection: ожидается объект с ключами all/some/none`);
    } else {
      for (const [bucket, list] of Object.entries(option.outcomes_by_selection)) {
        const bucketScope = `${scope}.outcomes_by_selection.${bucket}`;
        if (!SELECTION_BUCKETS.has(bucket)) { errors.push(`${bucketScope}: ожидается one of all/some/none`); continue; }
        if (!Array.isArray(list) || list.length === 0) { errors.push(`${bucketScope}: ожидается непустой массив исходов`); continue; }
        list.forEach((o, i) => {
          if (!isPlainObject(o)) { errors.push(`${bucketScope}[${i}]: ожидается объект`); return; }
          if (o.chance !== undefined && (typeof o.chance !== 'number' || o.chance < 0 || o.chance > 100)) {
            errors.push(`${bucketScope}[${i}].chance: ожидается число от 0 до 100`);
          }
          validateEffectsArray(o.effects ?? [], `${bucketScope}[${i}].effects`, errors);
        });
      }
    }
  }
  if (option.schedule !== undefined) {
    if (!Array.isArray(option.schedule)) errors.push(`${scope}.schedule: ожидается массив`);
    else validateSchedule(option.schedule, `${scope}.schedule`, errors);
  }
  if (option.requires !== undefined) {
    if (!Array.isArray(option.requires)) {
      errors.push(`${scope}.requires: ожидается массив видов выбора (player/item/profession)`);
    } else {
      for (const k of option.requires) {
        if (!SELECT_KINDS.has(k)) errors.push(`${scope}.requires: неизвестный вид выбора "${k}" (ожидается player/item/profession)`);
      }
    }
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
  if (event.vars) validateVars(event.vars, `${scope}.vars`, errors);
  validateEffectsArray(event.effects, `${scope}.effects`, errors);
  validateSchedule(event.schedule, `${scope}.schedule`, errors);
  if (event.select) {
    const kinds = getSelectKinds(event.select);
    if (kinds.length === 0) {
      errors.push(`${scope}.select: ожидается kind или kinds из "player", "item", "profession"`);
    }
    const rawKinds = Array.isArray(event.select.kinds) ? event.select.kinds : (event.select.kind ? [event.select.kind] : []);
    for (const k of rawKinds) {
      if (!SELECT_KINDS.has(k)) errors.push(`${scope}.select: неизвестный вид выбора "${k}" (ожидается player/item/profession)`);
    }
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

// ---------------------------------------------------------------------------
// Inline text resolution: alternatives and event self-references
// ---------------------------------------------------------------------------

// Reserved event fields exposed to {event.<field>} references.
const EVENT_REF_FIELDS = new Set(['id', 'type', 'title', 'weight']);

// Inline alternatives: "{крыс|мышей|тараканов}" -> one random choice. Matches a
// brace group that contains a pipe and no nested braces.
const INLINE_ALTERNATIVE_RE = /\{([^{}]*\|[^{}]*)\}/g;
// Self-references: "{event.animals}", "{event.id}", etc.
const EVENT_REF_RE = /\{event\.([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

function resolveAlternatives(str) {
  return str.replace(INLINE_ALTERNATIVE_RE, (_match, body) => randomOf(body.split('|')));
}

// Picks concrete values for an event's declared `vars` once. Array values are
// resolved to a single random element; both forms then have their own inline
// alternatives resolved, so a var may itself contain "{a|b}".
function buildEventVars(def) {
  const out = {};
  for (const [name, value] of Object.entries(def?.vars ?? {})) {
    const chosen = Array.isArray(value) ? randomOf(value) : value;
    out[name] = resolveAlternatives(typeof chosen === 'string' ? chosen : String(chosen ?? ''));
  }
  return out;
}

// Resolves inline alternatives and {event.<name>} references. `vars` is the
// pre-picked map from buildEventVars so the same name renders identically
// across title and text. Unknown references are left untouched.
function resolveInlineText(template, def, vars) {
  if (typeof template !== 'string') return template;
  let out = resolveAlternatives(template);
  out = out.replace(EVENT_REF_RE, (match, name) => {
    if (vars && Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    if (EVENT_REF_FIELDS.has(name) && def && def[name] != null) return String(def[name]);
    return match;
  });
  return out;
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
        on_expire: eff.status.on_expire,
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
    if (eff.spawn_survivor) {
      // `on` (if given) names the parent — the newborn inherits their race.
      const opts = isPlainObject(eff.spawn_survivor) ? eff.spawn_survivor : {};
      out.push({ type: 'spawn_survivor', name: opts.name, parent_id: ids[0] ?? null });
    }
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

// Rough good/bad classification of an outcome from the net sign of its effects.
function outcomeTone(outcome) {
  let score = 0;
  for (const eff of outcome?.effects ?? []) {
    if (!eff || typeof eff !== 'object') continue;
    if (typeof eff.health === 'number') score += eff.health;
    if (typeof eff.sanity === 'number') score += eff.sanity;
    if (eff.status && typeof eff.status.value === 'number') score += eff.status.value;
    if (typeof eff.food === 'number') score += eff.food > 0 ? 1 : -1;
    else if (typeof eff.food === 'string') score -= 1; // "N%" is always a loss
    if (eff.kill || eff.kill_random) score -= 100;
  }
  return score > 0 ? 'good' : score < 0 ? 'bad' : 'neutral';
}

// Success chance for a selection-scaled option. `strength` is the weighted sum
// of chosen resources — each item counts as 1, each profession as its skill
// level's `multiplier` (configured in the pack's SKILL_LEVELS) — so picking
// better specialists raises the odds. A single kind is capped at
// SELECTION_MAX_PARTIAL; the full mix (≥1 of every declared kind, `diverse`)
// lifts the cap to 100%. Mirrored on the client (ChoiceEventCard) so the
// indicator matches the resolution exactly.
const SELECTION_PER_RESOURCE = 40;
const SELECTION_MAX_PARTIAL = 90;
function selectionSuccessChance(strength, diverse) {
  if (strength <= 0) return 0;
  const cap = diverse ? 100 : SELECTION_MAX_PARTIAL;
  return Math.min(cap, Math.round(strength * SELECTION_PER_RESOURCE));
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
  outcomeTone,
  selectionSuccessChance,
  getSelectKinds,
  buildEventVars,
  resolveInlineText,
  TARGET_KEYWORDS,
};
