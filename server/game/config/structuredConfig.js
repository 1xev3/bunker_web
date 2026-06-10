const { expandVariantString, expandBackpackItemVariants } = require('./itemVariants');

function slugify(input, fallback) {
  const ascii = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ascii || fallback;
}

function withUniqueId(base, used) {
  let id = base;
  let i = 2;
  while (used.has(id)) {
    id = `${base}_${i}`;
    i++;
  }
  used.add(id);
  return id;
}

function entity(value, prefix, index, extra = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value) && value.id && value.label) {
    return { ...value, ...extra };
  }
  return { id: `${prefix}_${index + 1}`, label: String(value), ...extra };
}

function weightedEntity(entry, prefix, index, extraFactory = () => ({})) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry && 'weight' in entry) {
    return entry;
  }
  // Object syntax: { label, weight, groups? }
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'label' in entry) {
    const groups = Array.isArray(entry.groups) ? entry.groups : [];
    const weight = typeof entry.weight === 'number' ? entry.weight : 1;
    return { value: entity(entry.label, prefix, index, { ...extraFactory(entry.label, index), groups }), weight };
  }
  const [value, weight] = entry;
  return { value: entity(value, prefix, index, extraFactory(value, index)), weight };
}

function plainEntities(values, prefix) {
  return values.map((value, index) => {
    // Object syntax: { label, groups? }
    if (value && typeof value === 'object' && !Array.isArray(value) && 'label' in value) {
      const groups = Array.isArray(value.groups) ? value.groups : [];
      return entity(value.label, prefix, index, { groups });
    }
    return entity(value, prefix, index);
  });
}

function weightedEntities(values, prefix, extraFactory) {
  return values.map((entry, index) => weightedEntity(entry, prefix, index, extraFactory));
}

const DEFAULT_ATTRACTIONS = ['opposite', 'same', 'any', 'none', 'any'];

function normalizeRange(entry, prefix, index) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry && 'weight' in entry) return entry;
  const [range, weight] = entry;
  const [min, max] = range;
  return { value: { id: `${prefix}_${index + 1}`, label: `${min}-${max}`, min, max }, weight };
}

function normalizeBackpackItem(item, index, prefix = 'backpack_item') {
  if (item && typeof item === 'object' && !Array.isArray(item) && item.id && item.label) {
    return {
      min: item.min ?? item.quantity ?? 1,
      max: item.max ?? item.quantity ?? item.min ?? 1,
      ...item,
    };
  }
  if (Array.isArray(item)) {
    const [label, min, max] = item;
    return { id: `${prefix}_${index + 1}`, label, min, max };
  }
  return { id: `${prefix}_${index + 1}`, label: String(item), min: 1, max: 1 };
}

function normalizeNamedObjects(values, prefix) {
  return values.map((value, index) => {
    if (value.id && value.label) return value;
    const label = value.label ?? value.name;
    return { ...value, id: `${prefix}_${index + 1}`, label };
  });
}

function normalizeDuration(value, index) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.id && value.label && Number.isInteger(value.months) && value.months > 0) return value;
    return {
      ...value,
      id: value.id ?? `bunker_duration_${index + 1}`,
      label: value.label ?? value.name,
    };
  }
  if (Array.isArray(value)) {
    const [label, months] = value;
    return { id: `bunker_duration_${index + 1}`, label, months };
  }
  return entity(value, 'bunker_duration', index);
}

function normalizeFoodSupply(value, index) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      ...value,
      id: value.id ?? `food_supply_${index + 1}`,
      label: value.label ?? value.name,
      amount: value.amount,
    };
  }
  return entity(value, 'food_supply', index);
}

// ФИО-пулы: { last, male: { first, middle }, female: { ... } }. Фамилии (last)
// общие для обоих полов и хранятся в мужской форме — женский вариант
// склоняется в коде. last допустим и внутри male/female (legacy-формат).
// Любое поле приводится к массиву строк; пустой пул → null (ФИО не генерируется).
function namesToStrings(arr) {
  return Array.isArray(arr) ? arr.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) : [];
}

function normalizeNamePool(pool) {
  if (!pool || typeof pool !== 'object' || Array.isArray(pool)) return null;
  return {
    first: namesToStrings(pool.first),
    middle: namesToStrings(pool.middle),
    last: namesToStrings(pool.last),
  };
}

// Фамилия в общем словаре — либо строка (мужская форма, женская склоняется по
// правилам в player.js), либо пара [мужская, женская] с явно заданными формами
// для исключений. Приводим всё к { male, female|null }; null → склонять кодом.
function normalizeSurnames(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const entry of arr) {
    if (typeof entry === 'string' && entry.trim()) {
      out.push({ male: entry.trim(), female: null });
    } else if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[0].trim()) {
      const female = typeof entry[1] === 'string' && entry[1].trim() ? entry[1].trim() : null;
      out.push({ male: entry[0].trim(), female });
    }
  }
  return out;
}

function normalizeNames(names) {
  if (!names || typeof names !== 'object' || Array.isArray(names)) return null;
  const male = normalizeNamePool(names.male);
  const female = normalizeNamePool(names.female);
  if (!male && !female) return null;
  return { last: normalizeSurnames(names.last), male, female };
}

function normalizeConfig(config) {
  const next = { ...config };

  next.NAMES = normalizeNames(config.NAMES);
  next.GENDERS = weightedEntities(config.GENDERS ?? [], 'gender');
  next.RACES = weightedEntities(config.RACES ?? [], 'race');
  next.GENDER_AFFIXES = weightedEntities(config.GENDER_AFFIXES ?? [], 'affix', (label, index) => ({
    attraction: DEFAULT_ATTRACTIONS[index] ?? 'opposite',
  }));
  next.AGES = (config.AGES ?? []).map((entry, index) => normalizeRange(entry, 'age', index));
  next.BODY_TYPES = weightedEntities(config.BODY_TYPES ?? [], 'body');
  next.SKILL_LEVELS = (config.SKILL_LEVELS ?? []).map((entry, index) => {
    const normalized = weightedEntity(entry, 'skill_level', index);
    // Optional event success multiplier: array `[label, weight, multiplier]`
    // or object `{ label, weight, multiplier }`. Defaults to 1.
    const raw = Array.isArray(entry)
      ? entry[2]
      : (entry && typeof entry === 'object' ? entry.multiplier : undefined);
    normalized.value.multiplier = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1;
    return normalized;
  });
  next.TRAITS = plainEntities(config.TRAITS ?? [], 'trait');
  next.HEALTH_STATES = (config.HEALTH_STATES ?? []).map((entry, index) => {
    const normalized = weightedEntity(entry, 'health_state', index);
    // Optional survival severity: how many points of starting bunker health this
    // condition costs at the worst stage. Array `[label, weight, severity]` or
    // object `{ label, weight, severity }`. Healthy / unset → 0.
    const raw = Array.isArray(entry)
      ? entry[2]
      : (entry && typeof entry === 'object' ? entry.severity : undefined);
    normalized.value.severity = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 0;
    return normalized;
  });
  next.HEALTH_STAGES = (config.HEALTH_STAGES ?? []).map((entry, index) => {
    const normalized = weightedEntity(entry, 'health_stage', index);
    // Optional severity scale of a stage (Лёгкое → При смерти). Array
    // `[label, weight, multiplier]` or object `{ ..., multiplier }`. Defaults to 1.
    const raw = Array.isArray(entry)
      ? entry[2]
      : (entry && typeof entry === 'object' ? entry.multiplier : undefined);
    normalized.value.multiplier = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 1;
    return normalized;
  });
  next.HOBBIES = plainEntities(config.HOBBIES ?? [], 'hobby');
  next.PHOBIAS = plainEntities(config.PHOBIAS ?? [], 'phobia');
  next.ADDITIONAL_INFO = plainEntities(config.ADDITIONAL_INFO ?? [], 'additional');
  next.INVENTORY = plainEntities((config.INVENTORY ?? []).flatMap(item => expandVariantString(item)), 'inventory');
  next.BACKPACK_ITEMS = (config.BACKPACK_ITEMS ?? [])
    .flatMap(item => expandBackpackItemVariants(item))
    .map((item, index) => normalizeBackpackItem(item, index));

  next.BUNKER_THEMES = normalizeNamedObjects(config.BUNKER_THEMES ?? [], 'bunker_theme');
  next.BUNKER_SIZES = normalizeNamedObjects(config.BUNKER_SIZES ?? [], 'bunker_size');
  next.BUNKER_DURATIONS = (config.BUNKER_DURATIONS ?? []).map((value, index) => normalizeDuration(value, index));
  next.FOOD_SUPPLIES = (config.FOOD_SUPPLIES ?? [])
    .map((value, index) => normalizeFoodSupply(value, index))
    .map((item, order) => ({ ...item, order }));
  next.BUNKER_ITEMS = plainEntities(config.BUNKER_ITEMS ?? [], 'bunker_item');

  const inventoryByLabel = new Map(next.INVENTORY.map(item => [item.label, item]));
  const backpackByLabel = new Map(next.BACKPACK_ITEMS.map(item => [item.label, item]));
  const usedProfessionIds = new Set();
  next.PROFESSION_ABILITIES = Object.fromEntries(Object.entries(config.PROFESSION_ABILITIES ?? {}).map(([key, def], index) => {
    const oldStyle = !def.label;
    const idBase = oldStyle ? slugify(def.key ?? key, `profession_${index + 1}`) : def.id ?? key;
    const id = withUniqueId(idBase, usedProfessionIds);
    const normalizeEffect = (effect) => {
      if (!effect) return effect;
      const normalized = { ...effect };
      if (typeof normalized.item === 'string') {
        normalized.itemId = backpackByLabel.get(normalized.item)?.id
          ?? inventoryByLabel.get(normalized.item)?.id
          ?? slugify(normalized.item, 'custom_item');
        normalized.itemLabel = normalized.item;
        delete normalized.item;
      }
      return normalized;
    };
    return [id, {
      ...def,
      id,
      label: def.label ?? key,
      effect: normalizeEffect(def.effect),
      variants: def.variants?.map(variant => ({ ...variant, effect: normalizeEffect(variant.effect) })),
    }];
  }));

  return next;
}

function validateUniqueIds(items, scope, errors) {
  const seen = new Set();
  for (const item of items) {
    if (!item?.id || typeof item.id !== 'string') {
      errors.push(`${scope}: missing string id`);
      continue;
    }
    if (seen.has(item.id)) errors.push(`${scope}: duplicate id "${item.id}"`);
    seen.add(item.id);
  }
}

function validateStructuredConfig(config) {
  const errors = [];
  validateUniqueIds(config.GENDERS.map(entry => entry.value), 'GENDERS', errors);
  validateUniqueIds(config.RACES.map(entry => entry.value), 'RACES', errors);
  validateUniqueIds(config.GENDER_AFFIXES.map(entry => entry.value), 'GENDER_AFFIXES', errors);
  validateUniqueIds(config.AGES.map(entry => entry.value), 'AGES', errors);
  validateUniqueIds(config.BODY_TYPES.map(entry => entry.value), 'BODY_TYPES', errors);
  validateUniqueIds(config.SKILL_LEVELS.map(entry => entry.value), 'SKILL_LEVELS', errors);
  validateUniqueIds(config.TRAITS, 'TRAITS', errors);
  validateUniqueIds(config.HEALTH_STATES.map(entry => entry.value), 'HEALTH_STATES', errors);
  validateUniqueIds(config.HEALTH_STAGES.map(entry => entry.value), 'HEALTH_STAGES', errors);
  validateUniqueIds(config.HOBBIES, 'HOBBIES', errors);
  validateUniqueIds(config.PHOBIAS, 'PHOBIAS', errors);
  validateUniqueIds(config.ADDITIONAL_INFO, 'ADDITIONAL_INFO', errors);
  validateUniqueIds(config.INVENTORY, 'INVENTORY', errors);
  validateUniqueIds(config.BACKPACK_ITEMS, 'BACKPACK_ITEMS', errors);
  validateUniqueIds(config.BUNKER_THEMES, 'BUNKER_THEMES', errors);
  validateUniqueIds(config.BUNKER_SIZES, 'BUNKER_SIZES', errors);
  validateUniqueIds(config.BUNKER_DURATIONS, 'BUNKER_DURATIONS', errors);
  validateUniqueIds(config.FOOD_SUPPLIES, 'FOOD_SUPPLIES', errors);
  validateUniqueIds(config.BUNKER_ITEMS, 'BUNKER_ITEMS', errors);

  const professionIds = new Set(Object.keys(config.PROFESSION_ABILITIES));
  for (const [id, def] of Object.entries(config.PROFESSION_ABILITIES)) {
    if (!def.id || def.id !== id) errors.push(`PROFESSION_ABILITIES.${id}: definition id must match key`);
    if (!professionIds.has(id)) errors.push(`PROFESSION_ABILITIES.${id}: missing profession id`);
    const effects = [def.effect, ...(def.variants ?? []).map(variant => variant.effect)].filter(Boolean);
    for (const effect of effects) {
      if (effect.type === 'add_to_backpack' && !effect.itemId) {
        errors.push(`PROFESSION_ABILITIES.${id}: add_to_backpack requires itemId`);
      }
    }
  }

  return errors;
}

module.exports = { normalizeConfig, validateStructuredConfig };
