const BOOLEAN_KEYS = new Set(['all', 'any', 'not', 'scripted']);

const GENDER_ALIASES = new Map([
  ['male', ['мужчина', 'мужской']],
  ['female', ['женщина', 'женский']],
  ['м', ['мужчина']],
  ['ж', ['женщина']],
]);

function norm(v) {
  return String(v ?? '').toLowerCase().trim();
}

function matchValue(actual, expected) {
  const a = norm(actual);
  const e = norm(expected);
  if (a === e) return true;
  const aliases = GENDER_ALIASES.get(e);
  return aliases ? aliases.includes(a) : false;
}

function matchExpected(actual, expected) {
  if (actual === null || actual === undefined) return false;
  if (Array.isArray(expected)) return expected.some(v => matchValue(actual, v));
  return matchValue(actual, expected);
}

function getPlayerAttr(player, attribute) {
  const config = player?.config;
  if (!config) return { id: null, label: null, groups: [] };

  switch (attribute) {
    case 'profession': {
      const id = player.profession?.id;
      const def = id ? config.PROFESSION_ABILITIES?.[id] : null;
      return { id, label: def?.label ?? id, groups: def?.groups ?? [] };
    }
    case 'health': {
      const stateId = player.health?.stateId;
      const entry = config.HEALTH_STATES?.find(e => e.value.id === stateId)?.value;
      return { id: stateId, label: entry?.label ?? stateId, groups: entry?.groups ?? [] };
    }
    case 'gender': {
      const genderId = player.gender?.genderId;
      const entry = config.GENDERS?.find(e => e.value.id === genderId)?.value;
      return { id: genderId, label: entry?.label ?? genderId, groups: [] };
    }
    case 'hobby': {
      const id = player.hobby?.id;
      const entry = config.HOBBIES?.find(e => e.id === id);
      return { id, label: entry?.label ?? id, groups: entry?.groups ?? [] };
    }
    case 'phobia': {
      const id = player.phobia?.id;
      const entry = config.PHOBIAS?.find(e => e.id === id);
      return { id, label: entry?.label ?? id, groups: [] };
    }
    case 'trait': {
      const id = player.trait?.id;
      const entry = config.TRAITS?.find(e => e.id === id);
      return { id, label: entry?.label ?? id, groups: [] };
    }
    case 'race': {
      const id = player.race?.id;
      const entry = config.RACES?.find(e => e.value.id === id)?.value;
      return { id, label: entry?.label ?? id, groups: [] };
    }
    case 'body': {
      const id = player.body?.bodyTypeId;
      const entry = config.BODY_TYPES?.find(e => e.value.id === id)?.value;
      return { id, label: entry?.label ?? id, groups: [] };
    }
    default:
      return { id: null, label: null, groups: [] };
  }
}

function getPlayerAttributeLabel(player, attribute) {
  const config = player?.config;
  if (!config) return null;
  switch (attribute) {
    case 'profession': return getPlayerAttr(player, 'profession').label;
    case 'profession_level': {
      const levelId = player.profession?.levelId;
      return config.SKILL_LEVELS?.find(e => e.value.id === levelId)?.value?.label ?? null;
    }
    case 'health': return getPlayerAttr(player, 'health').label;
    case 'gender': return getPlayerAttr(player, 'gender').label;
    case 'hobby': return getPlayerAttr(player, 'hobby').label;
    case 'hobby_level': {
      const levelId = player.hobby?.levelId;
      return config.SKILL_LEVELS?.find(e => e.value.id === levelId)?.value?.label ?? null;
    }
    case 'phobia': return getPlayerAttr(player, 'phobia').label;
    case 'trait': return getPlayerAttr(player, 'trait').label;
    case 'race': return getPlayerAttr(player, 'race').label;
    case 'body': return getPlayerAttr(player, 'body').label;
    case 'age': return player.gender?.age != null ? String(player.gender.age) : null;
    case 'name': return player.name ?? null;
    default: return null;
  }
}

function evaluateFilter(filter, player, scriptedFilters) {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return true;

  if ('scripted' in filter) {
    const scripted = scriptedFilters?.[filter.scripted];
    if (!scripted) return false;
    return evaluateFilter(scripted, player, scriptedFilters);
  }

  if ('all' in filter) {
    if (!Array.isArray(filter.all)) return false;
    return filter.all.every(f => evaluateFilter(f, player, scriptedFilters));
  }
  if ('any' in filter) {
    if (!Array.isArray(filter.any)) return false;
    return filter.any.some(f => evaluateFilter(f, player, scriptedFilters));
  }
  if ('not' in filter) {
    return !evaluateFilter(filter.not, player, scriptedFilters);
  }

  // Multiple leaf keys = implicit AND
  const keys = Object.keys(filter).filter(k => !BOOLEAN_KEYS.has(k));
  if (keys.length === 0) return true;
  if (keys.length > 1) {
    return keys.every(key => evaluateFilter({ [key]: filter[key] }, player, scriptedFilters));
  }

  const [key] = keys;
  const expected = filter[key];

  // _group suffix: check group membership
  if (key.endsWith('_group')) {
    const attr = key.slice(0, -6);
    const { groups } = getPlayerAttr(player, attr);
    const expectedGroups = Array.isArray(expected) ? expected : [expected];
    return expectedGroups.some(g => groups.some(grp => norm(grp) === norm(g)));
  }

  const { id, label } = getPlayerAttr(player, key);
  if (id !== null || label !== null) {
    return matchExpected(id, expected) || matchExpected(label, expected);
  }

  return false;
}

module.exports = { evaluateFilter, getPlayerAttributeLabel, getPlayerAttr };
