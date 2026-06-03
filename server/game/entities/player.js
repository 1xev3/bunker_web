const { randomUUID } = require('crypto');
const { getProfessionAbilityInfo } = require('../abilities/professionAbilities');

const ATTRIBUTE_KEYS = ['gender', 'race', 'body', 'trait', 'profession', 'health', 'hobby', 'phobia', 'inventory', 'backpack', 'additional'];

function weightedRandom(table) {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let rand = Math.random() * total;
  for (const entry of table) {
    rand -= entry.weight;
    if (rand <= 0) return entry.value;
  }
  return table[table.length - 1].value;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample(arr, k) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < k && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function labelOf(configItems, id) {
  return configItems.find(item => item.id === id)?.label ?? id ?? '';
}

function weightedLabel(configItems, id) {
  return labelOf(configItems.map(entry => entry.value), id);
}

function formatBackpackItem(item) {
  return item.quantity > 1 ? `${item.label} (${item.quantity} шт)` : item.label;
}

function formatAttribute(attr, value, config) {
  if (!value) return '';
  switch (attr) {
    case 'gender':
      return `${weightedLabel(config.GENDERS, value.genderId)} ${weightedLabel(config.GENDER_AFFIXES, value.affixId)} (${value.age} лет)`;
    case 'body':
      return `${weightedLabel(config.BODY_TYPES, value.bodyTypeId)} (${value.height} см)`;
    case 'profession':
      return `${config.PROFESSION_ABILITIES[value.id]?.label ?? value.id} (${weightedLabel(config.SKILL_LEVELS, value.levelId)})`;
    case 'health': {
      const state = weightedLabel(config.HEALTH_STATES, value.stateId);
      const stage = value.stageId ? weightedLabel(config.HEALTH_STAGES, value.stageId) : '';
      return stage ? `${state} (${stage})` : state;
    }
    case 'hobby':
      return `${labelOf(config.HOBBIES, value.id)} (${weightedLabel(config.SKILL_LEVELS, value.levelId)})`;
    case 'phobia':
      return `Страх ${labelOf(config.PHOBIAS, value.id)}`;
    case 'backpack':
      return value.map(formatBackpackItem).join(', ');
    case 'race':
      return labelOf(config.RACES.map(entry => entry.value), value.id);
    case 'trait':
      return labelOf(config.TRAITS, value.id);
    case 'inventory':
      return value.label ?? labelOf(config.INVENTORY, value.id);
    case 'additional':
      return labelOf(config.ADDITIONAL_INFO, value.id);
    default:
      return value.label ?? String(value);
  }
}

function publicAttribute(attr, value, config) {
  return value ? { value, display: formatAttribute(attr, value, config) } : null;
}

function getHeightCurve(config, age) {
  const curves = config.packSettings.characters.height.age_curves;
  return curves.find((curve) => curve.max_age == null || age <= curve.max_age) ?? curves[curves.length - 1];
}

class Player {
  constructor(name, options = {}) {
    this.id = randomUUID();
    this.name = name;
    this.is_active = true;
    this.is_bot = Boolean(options.isBot);

    this.gender = null;
    this.race = null;
    this.body = null;
    this.trait = null;
    this.profession = null;
    this.health = null;
    this.hobby = null;
    this.phobia = null;
    this.inventory = null;
    this.backpack = [];
    this.additional = null;
    this.description = '';
    this.config = null;
    this.profession_ability_used = false;
    this.profession_ability_variant = null;
    this.vital_status = {
      health: 100,
      sanity: 100,
      statuses: [],
    };

    this.revealed_attributes = Object.fromEntries(ATTRIBUTE_KEYS.map(k => [k, false]));
  }

  generateCharacter(config) {
    this.config = config;

    const gender = weightedRandom(config.GENDERS);
    const affix = weightedRandom(config.GENDER_AFFIXES);
    const ageRange = weightedRandom(config.AGES);
    const age = randInt(ageRange.min, ageRange.max);
    this.gender = { genderId: gender.id, affixId: affix.id, age };
    this.race = { id: weightedRandom(config.RACES).id };

    const bodyType = weightedRandom(config.BODY_TYPES);
    const heightSettings = config.packSettings.characters.height;
    const curve = getHeightCurve(config, age);
    let height = Math.round(gaussRandom(curve.mean, curve.std));
    if (gender.id === 'gender_2') height -= heightSettings.female_height_offset;
    height = Math.max(heightSettings.min, Math.min(heightSettings.max, height));
    this.body = { bodyTypeId: bodyType.id, height };

    this.trait = { id: config.TRAITS[Math.floor(Math.random() * config.TRAITS.length)].id };

    const professions = Object.keys(config.PROFESSION_ABILITIES);
    const professionId = professions[Math.floor(Math.random() * professions.length)];
    const level = weightedRandom(config.SKILL_LEVELS);
    this.profession = { id: professionId, levelId: level.id };

    const abilityDef = config.PROFESSION_ABILITIES[professionId];
    if (abilityDef?.variants?.length) {
      const variants = abilityDef.variants;
      this.profession_ability_variant = variants[Math.floor(Math.random() * variants.length)].key;
    }

    const healthState = weightedRandom(config.HEALTH_STATES);
    const healthyId = config.HEALTH_STATES[0]?.value.id;
    this.health = {
      stateId: healthState.id,
      stageId: healthState.id === healthyId ? null : weightedRandom(config.HEALTH_STAGES).id,
    };

    const hobby = config.HOBBIES[Math.floor(Math.random() * config.HOBBIES.length)];
    const hobbyLevel = weightedRandom(config.SKILL_LEVELS);
    this.hobby = { id: hobby.id, levelId: hobbyLevel.id };

    const phobia = config.PHOBIAS[Math.floor(Math.random() * config.PHOBIAS.length)];
    this.phobia = { id: phobia.id };

    this.inventory = { ...config.INVENTORY[Math.floor(Math.random() * config.INVENTORY.length)] };

    const count = randInt(1, config.BACKPACK_ITEMS_COUNT_MAX);
    this.backpack = sample(config.BACKPACK_ITEMS, count).map(item => ({
      id: item.id,
      label: item.label,
      quantity: randInt(item.min ?? 1, item.max ?? item.min ?? 1),
    }));

    this.additional = { id: config.ADDITIONAL_INFO[Math.floor(Math.random() * config.ADDITIONAL_INFO.length)].id };
  }

  generateMinimalCharacter(config, options = {}) {
    this.config = config;

    const healthyId = config.HEALTH_STATES[0]?.value.id;
    this.health = { stateId: healthyId, stageId: null };

    const raceId = options.raceId ?? weightedRandom(config.RACES).id;
    this.race = { id: raceId };

    const affix = weightedRandom(config.GENDER_AFFIXES);
    const gender = weightedRandom(config.GENDERS);
    this.gender = { genderId: gender.id, affixId: affix.id, age: 0 };

    for (const attr of ATTRIBUTE_KEYS) {
      this.revealed_attributes[attr] = true;
    }
  }

  revealAttribute(attr) {
    if (!this.revealed_attributes[attr]) {
      this.revealed_attributes[attr] = true;
      return true;
    }
    return false;
  }

  revealAll() {
    const newly = [];
    for (const attr of ATTRIBUTE_KEYS) {
      if (!this.revealed_attributes[attr]) {
        this.revealed_attributes[attr] = true;
        newly.push(attr);
      }
    }
    return newly;
  }

  toDict(viewerId = null) {
    const attrs = {};
    for (const key of ATTRIBUTE_KEYS) {
      attrs[key] = (this.revealed_attributes[key] || viewerId === this.id)
        ? publicAttribute(key, this[key], this.config)
        : null;
    }
    return {
      id: this.id,
      name: this.name,
      is_active: this.is_active,
      revealed_attributes: { ...this.revealed_attributes },
      attributes: attrs,
      description: viewerId === this.id ? this.description : '',
      profession_ability: getProfessionAbilityInfo(this, viewerId),
      vital_status: {
        health: this.vital_status?.health ?? 100,
        sanity: this.vital_status?.sanity ?? 100,
        statuses: Array.isArray(this.vital_status?.statuses) ? this.vital_status.statuses.map(s => ({ ...s })) : [],
      },
    };
  }
}

function gaussRandom(mean, std) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * std + mean;
}

module.exports = { Player, ATTRIBUTE_KEYS, formatAttribute, publicAttribute, weightedRandom, randInt };
