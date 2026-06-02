const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { normalizeConfig, validateStructuredConfig } = require('./structuredConfig');

const PACK_FILES = ['People', 'Inventory', 'Bunker', 'Professions', 'Event'];
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const CONFIGS_DIR = path.join(__dirname, 'configurations');
const TARGET_TYPES = new Set(['none', 'self', 'other', 'pair']);
const ATTRIBUTE_KEYS = new Set(['gender', 'race', 'body', 'health', 'hobby', 'phobia', 'inventory', 'additional']);
const EVENT_TEMPLATE_RE = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
const EVENT_PARTICIPANT_TEMPLATE_RE = /^participant\d+$/;
const lastReportedIssues = new Map();

function getPackDir(packName) {
  return path.join(CONFIGS_DIR, packName);
}

function addError(errors, scope, message) {
  errors.push(`${scope}: ${message}`);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateStringArray(value, scope, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустой массив строк');
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      addError(errors, `${scope}[${index}]`, 'ожидается непустая строка');
    }
  });
}

function extractTemplateKeys(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(EVENT_TEMPLATE_RE)].map(match => match[1]);
}

function isParticipantTemplateKey(key) {
  return key === 'participants' || EVENT_PARTICIPANT_TEMPLATE_RE.test(key);
}

function validateEventText(value, scope, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    addError(errors, scope, 'ожидается непустая строка');
  }
}

function validateEventTextValue(value, scope, errors) {
  if (typeof value === 'string') {
    validateEventText(value, scope, errors);
    return;
  }
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустая строка или непустой массив строк');
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      addError(errors, `${scope}[${index}]`, 'ожидается непустая строка');
    }
  });
}

function resolveTemplateSource(event, altText, key) {
  if (key.startsWith('alt.')) {
    const rawKey = key.slice(4);
    if (!altText) return { exists: false, value: undefined, rawKey };
    return { exists: rawKey in altText, value: altText[rawKey], rawKey };
  }
  return { exists: key in event, value: event[key], rawKey: key };
}

function validateEventTemplateSource(event, altText, scope, key, errors) {
  if (isParticipantTemplateKey(key)) {
    return;
  }
  const source = resolveTemplateSource(event, altText, key);
  if (!source.exists) {
    addError(errors, scope, `плейсхолдер "{${key}}" ссылается на отсутствующий ключ "${source.rawKey}"`);
    return;
  }

  const value = source.value;
  if (typeof value === 'string') {
    if (value.trim() === '') addError(errors, `${scope} -> ${key}`, 'ключ подстановки не должен быть пустой строкой');
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      addError(errors, `${scope} -> ${key}`, 'ключ подстановки должен содержать непустой массив строк');
      return;
    }
    value.forEach((item, index) => {
      if (typeof item !== 'string' || item.trim() === '') {
        addError(errors, `${scope} -> ${key}[${index}]`, 'ожидается непустая строка');
      }
    });
    return;
  }

  addError(errors, `${scope} -> ${key}`, 'ключ подстановки должен быть строкой или массивом строк');
}

function validateEventTemplateReferences(event, altText, scope, fieldName, value, errors) {
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    for (const key of extractTemplateKeys(entry)) {
      validateEventTemplateSource(event, altText, `${scope}.${fieldName}`, key, errors);
    }
  }
}

function mergeAltTextSources(altTexts) {
  if (!Array.isArray(altTexts) || altTexts.length === 0) return null;
  const merged = {};
  for (const altText of altTexts) {
    if (!isPlainObject(altText)) continue;
    for (const [key, value] of Object.entries(altText)) {
      if (!(key in merged)) merged[key] = value;
    }
  }
  return merged;
}

function validateWeightedTable(value, scope, errors, valueValidator = () => {}) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустой массив пар [значение, вес]');
    return;
  }

  value.forEach((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      addError(errors, `${scope}[${index}]`, 'ожидается массив из 2 элементов: [значение, вес]');
      return;
    }

    valueValidator(entry[0], `${scope}[${index}][0]`, errors);

    if (typeof entry[1] !== 'number' || !Number.isFinite(entry[1]) || entry[1] <= 0) {
      addError(errors, `${scope}[${index}][1]`, 'вес должен быть положительным числом');
    }
  });
}

function validateRange(value, scope, errors) {
  if (!Array.isArray(value) || value.length !== 2) {
    addError(errors, scope, 'ожидается диапазон [min, max]');
    return;
  }

  const [min, max] = value;
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    addError(errors, scope, 'границы диапазона должны быть целыми числами');
    return;
  }

  if (min > max) {
    addError(errors, scope, 'левая граница диапазона не может быть больше правой');
  }
}

function validateNamedObjectArray(value, scope, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустой массив объектов');
    return;
  }

  value.forEach((item, index) => {
    if (!isPlainObject(item)) {
      addError(errors, `${scope}[${index}]`, 'ожидается объект');
      return;
    }
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      addError(errors, `${scope}[${index}].name`, 'ожидается непустая строка');
    }
    if (item.description !== undefined && typeof item.description !== 'string') {
      addError(errors, `${scope}[${index}].description`, 'если поле указано, оно должно быть строкой');
    }
  });
}

function validateBackpackItems(value, scope, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустой массив предметов');
    return;
  }

  value.forEach((item, index) => {
    if (typeof item === 'string') {
      if (item.trim() === '') addError(errors, `${scope}[${index}]`, 'строка не должна быть пустой');
      return;
    }

    if (!Array.isArray(item) || item.length !== 3) {
      addError(errors, `${scope}[${index}]`, 'ожидается строка или массив [name, min, max]');
      return;
    }

    const [name, min, max] = item;
    if (typeof name !== 'string' || name.trim() === '') {
      addError(errors, `${scope}[${index}][0]`, 'ожидается непустая строка');
    }
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      addError(errors, `${scope}[${index}]`, 'min и max должны быть целыми числами');
      return;
    }
    if (min > max) {
      addError(errors, `${scope}[${index}]`, 'min не может быть больше max');
    }
    if (min < 1) {
      addError(errors, `${scope}[${index}]`, 'количество предметов должно быть не меньше 1');
    }
  });
}

function validateEffect(effect, scope, errors, targetType) {
  if (!isPlainObject(effect)) {
    addError(errors, scope, 'ожидается объект эффекта');
    return;
  }

  if (typeof effect.type !== 'string' || effect.type.trim() === '') {
    addError(errors, `${scope}.type`, 'ожидается непустая строка');
    return;
  }

  const targetRequiredTypes = new Set(['set_attribute', 'randomize_attribute', 'steal_attribute', 'strip_attribute', 'inspect_attribute', 'reveal_attribute']);

  if (targetRequiredTypes.has(effect.type) && targetType !== 'other') {
    addError(errors, `${scope}.type`, `эффект "${effect.type}" требует targetType: "other"`);
  }
  if (effect.type === 'swap_attribute' && targetType !== 'pair') {
    addError(errors, `${scope}.type`, 'эффект "swap_attribute" требует targetType: "pair"');
  }
  if (effect.type === 'add_to_backpack' && !new Set(['self', 'none']).has(targetType)) {
    addError(errors, `${scope}.type`, 'эффект "add_to_backpack" требует targetType: "self" или "none"');
  }

  if (['set_attribute', 'randomize_attribute', 'steal_attribute', 'strip_attribute', 'swap_attribute'].includes(effect.type)) {
    if (typeof effect.attribute !== 'string' || !ATTRIBUTE_KEYS.has(effect.attribute)) {
      addError(errors, `${scope}.attribute`, `ожидается один из атрибутов: ${[...ATTRIBUTE_KEYS].join(', ')}`);
    }
  }

  if (effect.type === 'set_attribute' && !['healthy', 'worse'].includes(effect.value)) {
    addError(errors, `${scope}.value`, 'для set_attribute ожидается значение "healthy" или "worse"');
  }

  if (effect.type === 'add_to_backpack' && (typeof effect.item !== 'string' || effect.item.trim() === '')) {
    addError(errors, `${scope}.item`, 'ожидается непустая строка');
  }

  if (effect.type === 'adjust_food' && (!Number.isInteger(effect.delta) || effect.delta === 0)) {
    addError(errors, `${scope}.delta`, 'ожидается ненулевое целое число');
  }
}

function validateProfessionDefinition(value, scope, errors) {
  if (!isPlainObject(value)) {
    addError(errors, scope, 'ожидается объект описания профессии');
    return;
  }

  if (typeof value.title !== 'string' || value.title.trim() === '') {
    addError(errors, `${scope}.title`, 'ожидается непустая строка');
  }
  if (typeof value.description !== 'string' || value.description.trim() === '') {
    addError(errors, `${scope}.description`, 'ожидается непустая строка');
  }
  if (typeof value.publicMessage !== 'string' || value.publicMessage.trim() === '') {
    addError(errors, `${scope}.publicMessage`, 'ожидается непустая строка');
  }
  if (typeof value.targetType !== 'string' || !TARGET_TYPES.has(value.targetType)) {
    addError(errors, `${scope}.targetType`, `ожидается одно из значений: ${[...TARGET_TYPES].join(', ')}`);
  }
  if (value.allowSelf !== undefined && typeof value.allowSelf !== 'boolean') {
    addError(errors, `${scope}.allowSelf`, 'если поле указано, оно должно быть boolean');
  }

  const hasEffect = value.effect !== undefined;
  const hasVariants = Array.isArray(value.variants) && value.variants.length > 0;

  if (!hasEffect && !hasVariants) {
    addError(errors, scope, 'должно быть задано либо поле effect, либо непустой массив variants');
  }
  if (hasEffect) {
    validateEffect(value.effect, `${scope}.effect`, errors, value.targetType);
  }
  if (value.variants !== undefined) {
    if (!Array.isArray(value.variants) || value.variants.length === 0) {
      addError(errors, `${scope}.variants`, 'если поле указано, ожидается непустой массив');
    } else {
      value.variants.forEach((variant, index) => {
        if (!isPlainObject(variant)) {
          addError(errors, `${scope}.variants[${index}]`, 'ожидается объект');
          return;
        }
        if (typeof variant.key !== 'string' || variant.key.trim() === '') {
          addError(errors, `${scope}.variants[${index}].key`, 'ожидается непустая строка');
        }
        if (typeof variant.label !== 'string' || variant.label.trim() === '') {
          addError(errors, `${scope}.variants[${index}].label`, 'ожидается непустая строка');
        }
        validateEffect(variant.effect, `${scope}.variants[${index}].effect`, errors, value.targetType);
      });
    }
  }
}

function validatePackContent(packName, files) {
  const errors = [];

  if (!isPlainObject(files.People)) {
    addError(errors, 'People', 'корневой объект не найден');
  } else {
    validateWeightedTable(files.People.GENDERS, 'People -> GENDERS', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateWeightedTable(files.People.RACES, 'People -> RACES', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateWeightedTable(files.People.GENDER_AFFIXES, 'People -> GENDER_AFFIXES', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateWeightedTable(files.People.AGES, 'People -> AGES', errors, validateRange);
    validateWeightedTable(files.People.BODY_TYPES, 'People -> BODY_TYPES', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateWeightedTable(files.People.SKILL_LEVELS, 'People -> SKILL_LEVELS', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateStringArray(files.People.TRAITS, 'People -> TRAITS', errors);
    validateWeightedTable(files.People.HEALTH_STATES, 'People -> HEALTH_STATES', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateWeightedTable(files.People.HEALTH_STAGES, 'People -> HEALTH_STAGES', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateStringArray(files.People.HOBBIES, 'People -> HOBBIES', errors);
    validateStringArray(files.People.PHOBIAS, 'People -> PHOBIAS', errors);
    validateStringArray(files.People.ADDITIONAL_INFO, 'People -> ADDITIONAL_INFO', errors);
  }

  if (!isPlainObject(files.Inventory)) {
    addError(errors, 'Inventory', 'корневой объект не найден');
  } else {
    validateStringArray(files.Inventory.INVENTORY, 'Inventory -> INVENTORY', errors);
    if (!Number.isInteger(files.Inventory.BACKPACK_ITEMS_COUNT_MAX) || files.Inventory.BACKPACK_ITEMS_COUNT_MAX < 1) {
      addError(errors, 'Inventory -> BACKPACK_ITEMS_COUNT_MAX', 'ожидается целое число не меньше 1');
    }
    validateBackpackItems(files.Inventory.BACKPACK_ITEMS, 'Inventory -> BACKPACK_ITEMS', errors);
  }

  if (!isPlainObject(files.Bunker)) {
    addError(errors, 'Bunker', 'корневой объект не найден');
  } else {
    validateNamedObjectArray(files.Bunker.BUNKER_THEMES, 'Bunker -> BUNKER_THEMES', errors);
    validateNamedObjectArray(files.Bunker.BUNKER_SIZES, 'Bunker -> BUNKER_SIZES', errors);
    validateStringArray(files.Bunker.BUNKER_DURATIONS, 'Bunker -> BUNKER_DURATIONS', errors);
    validateStringArray(files.Bunker.FOOD_SUPPLIES, 'Bunker -> FOOD_SUPPLIES', errors);
    validateStringArray(files.Bunker.BUNKER_ITEMS, 'Bunker -> BUNKER_ITEMS', errors);

    if (!Array.isArray(files.Bunker.ROOM_COUNTS) || files.Bunker.ROOM_COUNTS.length === 0) {
      addError(errors, 'Bunker -> ROOM_COUNTS', 'ожидается непустой массив целых чисел');
    } else {
      files.Bunker.ROOM_COUNTS.forEach((count, index) => {
        if (!Number.isInteger(count) || count < 1 || count > 25) {
          addError(errors, `Bunker -> ROOM_COUNTS[${index}]`, 'значение должно быть целым числом от 1 до 25');
        }
      });
    }

    if (Array.isArray(files.Bunker.BUNKER_SIZES) && Array.isArray(files.Bunker.ROOM_COUNTS)
      && files.Bunker.BUNKER_SIZES.length !== files.Bunker.ROOM_COUNTS.length) {
      addError(
        errors,
        'Bunker -> ROOM_COUNTS',
        `длина массива (${files.Bunker.ROOM_COUNTS.length}) должна совпадать с количеством BUNKER_SIZES (${files.Bunker.BUNKER_SIZES.length})`,
      );
    }
  }

  if (!isPlainObject(files.Professions)) {
    addError(errors, 'Professions', 'корневой объект не найден');
  } else if (!isPlainObject(files.Professions.PROFESSION_ABILITIES) || Object.keys(files.Professions.PROFESSION_ABILITIES).length === 0) {
    addError(errors, 'Professions -> PROFESSION_ABILITIES', 'ожидается непустой объект');
  } else {
    Object.entries(files.Professions.PROFESSION_ABILITIES).forEach(([professionName, definition]) => {
      if (typeof professionName !== 'string' || professionName.trim() === '') {
        addError(errors, 'Professions -> PROFESSION_ABILITIES', 'название профессии не должно быть пустым');
        return;
      }
      validateProfessionDefinition(definition, `Professions -> PROFESSION_ABILITIES["${professionName}"]`, errors);
    });
  }

  if (!isPlainObject(files.Event)) {
    addError(errors, 'Event', 'корневой объект не найден');
  } else if (!Array.isArray(files.Event.EVENTS) || files.Event.EVENTS.length === 0) {
    addError(errors, 'Event -> EVENTS', 'ожидается непустой массив событий');
  } else {
    files.Event.EVENTS.forEach((event, index) => {
      const scope = `Event -> EVENTS[${index}]`;
      if (!isPlainObject(event)) { addError(errors, scope, 'ожидается объект'); return; }
      if (typeof event.id !== 'string' || event.id.trim() === '') addError(errors, `${scope}.id`, 'ожидается непустая строка');
      if (event.title == null) addError(errors, `${scope}.title`, 'ожидается поле title');
      else validateEventTextValue(event.title, `${scope}.title`, errors);
      if (event.description == null) addError(errors, `${scope}.description`, 'ожидается поле description');
      else validateEventTextValue(event.description, `${scope}.description`, errors);
      const mergedAltText = mergeAltTextSources(event.alt);
      if (event.title != null) validateEventTemplateReferences(event, mergedAltText, scope, 'title', event.title, errors);
      if (event.description != null) validateEventTemplateReferences(event, mergedAltText, scope, 'description', event.description, errors);
      if (event.alt != null) {
        if (!Array.isArray(event.alt) || event.alt.length === 0) {
          addError(errors, `${scope}.alt`, 'ожидается непустой массив объектов');
        } else {
          event.alt.forEach((altText, altIndex) => {
            const altScope = `${scope}.alt[${altIndex}]`;
            if (!isPlainObject(altText)) {
              addError(errors, altScope, 'ожидается объект');
              return;
            }
            if ('title' in altText || 'description' in altText) {
              addError(errors, altScope, 'alt должен содержать только данные для подстановок, без title/description');
            }
            for (const [key, value] of Object.entries(altText)) {
              if (typeof value === 'string') {
                if (value.trim() === '') addError(errors, `${altScope}.${key}`, 'ожидается непустая строка');
                continue;
              }
              if (Array.isArray(value)) {
                if (value.length === 0) {
                  addError(errors, `${altScope}.${key}`, 'ожидается непустой массив строк');
                  continue;
                }
                value.forEach((item, itemIndex) => {
                  if (typeof item !== 'string' || item.trim() === '') {
                    addError(errors, `${altScope}.${key}[${itemIndex}]`, 'ожидается непустая строка');
                  }
                });
                continue;
              }
              addError(errors, `${altScope}.${key}`, 'ожидается строка или массив строк');
            }
          });
        }
      }
      if (event.participants_template != null && !['couple', 'random_one', 'random_group'].includes(event.participants_template)) {
        addError(errors, `${scope}.participants_template`, 'expected one of: couple, random_one, random_group');
      }
      for (const key of ['participants_min', 'participants_max']) {
        if (event[key] != null && (!Number.isInteger(event[key]) || event[key] < 1)) {
          addError(errors, `${scope}.${key}`, 'expected a positive integer');
        }
      }
      if (Number.isInteger(event.participants_min) && Number.isInteger(event.participants_max) && event.participants_max < event.participants_min) {
        addError(errors, `${scope}.participants_max`, 'must be greater than or equal to participants_min');
      }
      // Passive events are inferred by the absence of base_chance
      const isPassive = event.base_chance == null;
      if (!isPassive) {
        if (typeof event.base_chance !== 'number' || event.base_chance < 0 || event.base_chance > 1) addError(errors, `${scope}.base_chance`, 'ожидается число от 0 до 1');
        for (const effectKey of ['success_effect', 'failure_effect']) {
          const eff = event[effectKey];
          if (!isPlainObject(eff)) { addError(errors, `${scope}.${effectKey}`, 'ожидается объект эффекта'); continue; }
          if (typeof eff.type !== 'string' || eff.type.trim() === '') addError(errors, `${scope}.${effectKey}.type`, 'ожидается непустая строка');
          if (eff.type === 'survival_change' && typeof eff.value !== 'number') addError(errors, `${scope}.${effectKey}.value`, 'ожидается число');
        }
      } else {
        const eff = event.success_effect;
        if (!isPlainObject(eff)) { addError(errors, `${scope}.success_effect`, 'ожидается объект эффекта'); }
        else {
          if (typeof eff.type !== 'string' || eff.type.trim() === '') addError(errors, `${scope}.success_effect.type`, 'ожидается непустая строка');
          if (eff.type === 'survival_change' && typeof eff.value !== 'number') addError(errors, `${scope}.success_effect.value`, 'ожидается число');
        }
      }
    });
  }

  if (files.Pack !== undefined) {
    if (!isPlainObject(files.Pack)) {
      addError(errors, 'Pack', 'корневой объект не найден');
    } else {
      if (typeof files.Pack.name !== 'string' || files.Pack.name.trim() === '') {
        addError(errors, 'Pack -> name', 'ожидается непустая строка');
      }
      if (typeof files.Pack.author !== 'string' || files.Pack.author.trim() === '') {
        addError(errors, 'Pack -> author', 'ожидается непустая строка');
      }
      if (typeof files.Pack.color !== 'string' || !HEX_COLOR_RE.test(files.Pack.color)) {
        addError(errors, 'Pack -> color', 'ожидается hex-цвет в формате #rrggbb');
      }
    }
  }

  const normalizedErrors = errors.length === 0
    ? validateStructuredConfig(normalizeConfig({
      ...files.People,
      ...files.Inventory,
      ...files.Bunker,
      ...files.Professions,
      ...files.Event,
    }))
    : [];

  return {
    packName,
    valid: errors.length + normalizedErrors.length === 0,
    errors: [...errors, ...normalizedErrors],
  };
}

function readConfigFile(dir, baseName) {
  const yamlPath = path.join(dir, `${baseName}.yaml`);
  const jsonPath = path.join(dir, `${baseName}.json`);

  if (fs.existsSync(yamlPath)) {
    return yaml.load(fs.readFileSync(yamlPath, 'utf8'));
  }
  if (fs.existsSync(jsonPath)) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  }
  return null;
}

function readPackFiles(packName) {
  const dir = getPackDir(packName);
  const files = {};
  const errors = [];

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    addError(errors, packName, `папка не найдена: ${dir}`);
    return { valid: false, errors, files: null };
  }

  for (const file of PACK_FILES) {
    try {
      const content = readConfigFile(dir, file);
      if (content === null) {
        addError(errors, `${packName}/${file}`, 'файл отсутствует (ожидается .yaml или .json)');
        continue;
      }
      files[file] = content;
    } catch (error) {
      addError(errors, `${packName}/${file}`, `не удалось распарсить файл: ${error.message}`);
    }
  }

  try {
    const packMeta = readConfigFile(dir, 'Pack');
    if (packMeta !== null) files.Pack = packMeta;
  } catch (error) {
    addError(errors, `${packName}/Pack`, `не удалось распарсить файл: ${error.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    files,
  };
}

function validatePack(packName) {
  const parsed = readPackFiles(packName);
  if (!parsed.valid) {
    return { packName, valid: false, errors: parsed.errors };
  }

  return validatePackContent(packName, parsed.files);
}

function reportPackIssues(packName, errors) {
  const signature = errors.join('\n');
  if (lastReportedIssues.get(packName) === signature) return;
  lastReportedIssues.set(packName, signature);
  console.error(`[pack:${packName}] Configuration validation failed:\n- ${errors.join('\n- ')}`);
}

function formatPackError(packName, errors) {
  return `Пак "${packName}" содержит ошибки конфигурации:\n- ${errors.join('\n- ')}`;
}

function readPackMeta(packName) {
  const dir = getPackDir(packName);
  try {
    const raw = readConfigFile(dir, 'Pack');
    if (!raw) return { name: packName, author: '', color: '#f59e0b' };
    return {
      name: typeof raw.name === 'string' ? raw.name : packName,
      author: typeof raw.author === 'string' ? raw.author : '',
      color: typeof raw.color === 'string' && HEX_COLOR_RE.test(raw.color) ? raw.color : '#f59e0b',
    };
  } catch {
    return { name: packName, author: '', color: '#f59e0b' };
  }
}

function listPacks() {
  return fs.readdirSync(CONFIGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const result = validatePack(entry.name);
      if (!result.valid) reportPackIssues(entry.name, result.errors);
      return result;
    })
    .filter((result) => result.valid)
    .map((result) => ({ id: result.packName, meta: readPackMeta(result.packName) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getDefaultPackName() {
  const packs = listPacks();
  if (packs.length === 0) {
    throw new Error('No valid configuration packs found');
  }
  const ids = packs.map((p) => p.id);
  return ids.includes('DefaultPack') ? 'DefaultPack' : ids[0];
}

function loadPack(packName = getDefaultPackName()) {
  const result = validatePack(packName);
  if (!result.valid) {
    reportPackIssues(packName, result.errors);
    throw new Error(formatPackError(packName, result.errors));
  }

  const dir = getPackDir(packName);
  const rawConfig = PACK_FILES.reduce((cfg, file) => ({
    ...cfg,
    ...readConfigFile(dir, file),
  }), {});
  const config = normalizeConfig(rawConfig);
  config.packMeta = readPackMeta(packName);
  return config;
}

const defaultConfig = loadPack();
defaultConfig.loadPack = loadPack;
defaultConfig.listPacks = listPacks;
defaultConfig.getDefaultPackName = getDefaultPackName;
defaultConfig.validatePack = validatePack;

module.exports = defaultConfig;
