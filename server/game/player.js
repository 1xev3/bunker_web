const { randomUUID } = require('crypto');
const { getProfessionAbilityInfo } = require('./professionAbilities');

const ATTRIBUTE_KEYS = ['gender', 'body', 'trait', 'profession', 'health', 'hobby', 'phobia', 'inventory', 'backpack', 'additional'];

function weightedRandom(table) {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let rand = Math.random() * total;
  for (const [item, weight] of table) {
    rand -= weight;
    if (rand <= 0) return item;
  }
  return table[table.length - 1][0];
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

class Player {
  constructor(name) {
    this.id = randomUUID();
    this.name = name;
    this.is_active = true;

    this.gender = '';
    this.body = '';
    this.trait = '';
    this.profession = '';
    this.health = '';
    this.hobby = '';
    this.phobia = '';
    this.inventory = '';
    this.backpack = '';
    this.additional = '';
    this.description = '';
    this.config = null;
    this.profession_ability_used = false;

    this.revealed_attributes = Object.fromEntries(ATTRIBUTE_KEYS.map(k => [k, false]));
  }

  generateCharacter(config) {
    this.config = config;

    const gender = weightedRandom(config.GENDERS);
    const affix = weightedRandom(config.GENDER_AFFIXES);
    const ageRange = weightedRandom(config.AGES);
    const age = randInt(ageRange[0], ageRange[1]);
    this.gender = `${gender} ${affix} (${age} лет)`;

    const bodyType = weightedRandom(config.BODY_TYPES);
    let height;
    if (age < 18) height = Math.round(gaussRandom(160, 20));
    else if (age < 30) height = Math.round(gaussRandom(180, 15));
    else if (age < 50) height = Math.round(gaussRandom(175, 10));
    else height = Math.round(gaussRandom(170, 8));
    if (gender === 'Женщина') height -= 10;
    height = Math.max(150, Math.min(210, height));
    this.body = `${bodyType} (${height} см)`;

    this.trait = config.TRAITS[Math.floor(Math.random() * config.TRAITS.length)];

    const professions = Object.keys(config.PROFESSION_ABILITIES);
    const profession = professions[Math.floor(Math.random() * professions.length)];
    const level = weightedRandom(config.SKILL_LEVELS);
    this.profession = `${profession} (${level})`;

    const healthState = weightedRandom(config.HEALTH_STATES);
    if (healthState === 'Здоров') {
      this.health = 'Здоров';
    } else {
      const stage = weightedRandom(config.HEALTH_STAGES);
      this.health = `${healthState} (${stage})`;
    }

    const hobby = config.HOBBIES[Math.floor(Math.random() * config.HOBBIES.length)];
    const hobbyLevel = weightedRandom(config.SKILL_LEVELS);
    this.hobby = `${hobby} (${hobbyLevel})`;

    const phobia = config.PHOBIAS[Math.floor(Math.random() * config.PHOBIAS.length)];
    this.phobia = `Страх ${phobia}`;

    this.inventory = config.INVENTORY[Math.floor(Math.random() * config.INVENTORY.length)];

    const count = randInt(1, config.BACKPACK_ITEMS_COUNT_MAX);
    const items = sample(config.BACKPACK_ITEMS, count);
    this.backpack = items.map(item => {
      if (Array.isArray(item)) {
        const [name, min, max] = item;
        return `${name} (${randInt(min, max)} шт)`;
      }
      return item;
    }).join(', ');

    this.additional = config.ADDITIONAL_INFO[Math.floor(Math.random() * config.ADDITIONAL_INFO.length)];
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
      attrs[key] = (this.revealed_attributes[key] || viewerId === this.id) ? this[key] : null;
    }
    return {
      id: this.id,
      name: this.name,
      is_active: this.is_active,
      revealed_attributes: { ...this.revealed_attributes },
      attributes: attrs,
      description: viewerId === this.id ? this.description : '',
      profession_ability: getProfessionAbilityInfo(this, viewerId),
    };
  }
}

// Box-Muller for gaussian random
function gaussRandom(mean, std) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * std + mean;
}

module.exports = { Player, ATTRIBUTE_KEYS };
