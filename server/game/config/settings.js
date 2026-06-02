const DEFAULT_PACK_SETTINGS = {
  bunker_life: {
    initial_survival_chance: 100,
    max_survival_chance: 150,
    month_duration_ms: 750,
    food_consumption_per_player: 90,
  },
  events: {
    bunker_event_chance: 0.10,
    success_chances: {
      one_resource: 0.75,
      two_resources: 0.90,
      three_plus_resources: 1.0,
    },
    food_replenish: {
      food_per_resource: 450,
    },
  },
  characters: {
    height: {
      min: 150,
      max: 210,
      female_height_offset: 10,
      age_curves: [
        { max_age: 17, mean: 160, std: 20 },
        { max_age: 29, mean: 180, std: 15 },
        { max_age: 49, mean: 175, std: 10 },
        { max_age: null, mean: 170, std: 8 },
      ],
    },
    health_randomize_worse_chance: 0.5,
  },
  bunker_generation: {
    max_empty_fraction: 0.33,
    max_extra_items: 2,
  },
};

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeObjects(base, override) {
  if (!isPlainObject(override)) {
    if (Array.isArray(base)) return base.map((entry) => (isPlainObject(entry) ? mergeObjects({}, entry) : entry));
    return Object.fromEntries(Object.entries(base).map(([key, value]) => [
      key,
      isPlainObject(value) ? mergeObjects({}, value) : Array.isArray(value)
        ? value.map((entry) => (isPlainObject(entry) ? mergeObjects({}, entry) : entry))
        : value,
    ]));
  }
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeObjects(result[key], value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((entry) => (isPlainObject(entry) ? mergeObjects({}, entry) : entry));
    } else {
      result[key] = value;
    }
  }
  return result;
}

function normalizePackSettings(rawConfig) {
  return mergeObjects(DEFAULT_PACK_SETTINGS, {
    bunker_life: rawConfig.BUNKER_LIFE_SETTINGS,
    events: rawConfig.EVENT_SETTINGS && {
      bunker_event_chance: rawConfig.EVENT_SETTINGS.bunker_event_chance,
      success_chances: Array.isArray(rawConfig.EVENT_SETTINGS.success_chances_by_resources)
        ? {
            one_resource: rawConfig.EVENT_SETTINGS.success_chances_by_resources[0],
            two_resources: rawConfig.EVENT_SETTINGS.success_chances_by_resources[1],
            three_plus_resources: rawConfig.EVENT_SETTINGS.success_chances_by_resources[2],
          }
        : undefined,
      food_replenish: rawConfig.EVENT_SETTINGS.food_replenish,
    },
    bunker_generation: rawConfig.BUNKER_GENERATION_SETTINGS,
  });
}

module.exports = { DEFAULT_PACK_SETTINGS, isPlainObject, mergeObjects, normalizePackSettings };
