const fs = require('fs');
const path = require('path');

const PACK_FILES = ['People', 'Inventory', 'Bunker', 'Professions', 'events'];
const CONFIGS_DIR = path.join(__dirname, 'configurations');
const TARGET_TYPES = new Set(['none', 'self', 'other', 'pair']);
const ATTRIBUTE_KEYS = new Set(['gender', 'body', 'health', 'hobby', 'phobia', 'inventory', 'additional']);
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

  if (typeof value.key !== 'string' || value.key.trim() === '') {
    addError(errors, `${scope}.key`, 'ожидается непустая строка');
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
    addError(errors, 'People.json', 'корневой JSON должен быть объектом');
  } else {
    validateWeightedTable(files.People.GENDERS, 'People.json -> GENDERS', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateWeightedTable(files.People.GENDER_AFFIXES, 'People.json -> GENDER_AFFIXES', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateWeightedTable(files.People.AGES, 'People.json -> AGES', errors, validateRange);
    validateWeightedTable(files.People.BODY_TYPES, 'People.json -> BODY_TYPES', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateWeightedTable(files.People.SKILL_LEVELS, 'People.json -> SKILL_LEVELS', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateStringArray(files.People.TRAITS, 'People.json -> TRAITS', errors);
    validateWeightedTable(files.People.HEALTH_STATES, 'People.json -> HEALTH_STATES', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateWeightedTable(files.People.HEALTH_STAGES, 'People.json -> HEALTH_STAGES', errors, (v, s, e) => {
      if (typeof v !== 'string' || v.trim() === '') addError(e, s, 'ожидается непустая строка');
    });
    validateStringArray(files.People.HOBBIES, 'People.json -> HOBBIES', errors);
    validateStringArray(files.People.PHOBIAS, 'People.json -> PHOBIAS', errors);
    validateStringArray(files.People.ADDITIONAL_INFO, 'People.json -> ADDITIONAL_INFO', errors);
  }

  if (!isPlainObject(files.Inventory)) {
    addError(errors, 'Inventory.json', 'корневой JSON должен быть объектом');
  } else {
    validateStringArray(files.Inventory.INVENTORY, 'Inventory.json -> INVENTORY', errors);
    if (!Number.isInteger(files.Inventory.BACKPACK_ITEMS_COUNT_MAX) || files.Inventory.BACKPACK_ITEMS_COUNT_MAX < 1) {
      addError(errors, 'Inventory.json -> BACKPACK_ITEMS_COUNT_MAX', 'ожидается целое число не меньше 1');
    }
    validateBackpackItems(files.Inventory.BACKPACK_ITEMS, 'Inventory.json -> BACKPACK_ITEMS', errors);
  }

  if (!isPlainObject(files.Bunker)) {
    addError(errors, 'Bunker.json', 'корневой JSON должен быть объектом');
  } else {
    validateNamedObjectArray(files.Bunker.BUNKER_THEMES, 'Bunker.json -> BUNKER_THEMES', errors);
    validateNamedObjectArray(files.Bunker.BUNKER_SIZES, 'Bunker.json -> BUNKER_SIZES', errors);
    validateStringArray(files.Bunker.BUNKER_DURATIONS, 'Bunker.json -> BUNKER_DURATIONS', errors);
    validateStringArray(files.Bunker.FOOD_SUPPLIES, 'Bunker.json -> FOOD_SUPPLIES', errors);
    validateStringArray(files.Bunker.BUNKER_ITEMS, 'Bunker.json -> BUNKER_ITEMS', errors);

    if (!Array.isArray(files.Bunker.ROOM_COUNTS) || files.Bunker.ROOM_COUNTS.length === 0) {
      addError(errors, 'Bunker.json -> ROOM_COUNTS', 'ожидается непустой массив целых чисел');
    } else {
      files.Bunker.ROOM_COUNTS.forEach((count, index) => {
        if (!Number.isInteger(count) || count < 1 || count > 25) {
          addError(errors, `Bunker.json -> ROOM_COUNTS[${index}]`, 'значение должно быть целым числом от 1 до 25');
        }
      });
    }

    if (Array.isArray(files.Bunker.BUNKER_SIZES) && Array.isArray(files.Bunker.ROOM_COUNTS)
      && files.Bunker.BUNKER_SIZES.length !== files.Bunker.ROOM_COUNTS.length) {
      addError(
        errors,
        'Bunker.json -> ROOM_COUNTS',
        `длина массива (${files.Bunker.ROOM_COUNTS.length}) должна совпадать с количеством BUNKER_SIZES (${files.Bunker.BUNKER_SIZES.length})`,
      );
    }
  }

  if (!isPlainObject(files.Professions)) {
    addError(errors, 'Professions.json', 'корневой JSON должен быть объектом');
  } else if (!isPlainObject(files.Professions.PROFESSION_ABILITIES) || Object.keys(files.Professions.PROFESSION_ABILITIES).length === 0) {
    addError(errors, 'Professions.json -> PROFESSION_ABILITIES', 'ожидается непустой объект');
  } else {
    Object.entries(files.Professions.PROFESSION_ABILITIES).forEach(([professionName, definition]) => {
      if (typeof professionName !== 'string' || professionName.trim() === '') {
        addError(errors, 'Professions.json -> PROFESSION_ABILITIES', 'название профессии не должно быть пустым');
        return;
      }
      validateProfessionDefinition(definition, `Professions.json -> PROFESSION_ABILITIES["${professionName}"]`, errors);
    });
  }

  if (!isPlainObject(files.events)) {
    addError(errors, 'events.json', 'корневой JSON должен быть объектом');
  } else if (!Array.isArray(files.events.EVENTS) || files.events.EVENTS.length === 0) {
    addError(errors, 'events.json -> EVENTS', 'ожидается непустой массив событий');
  } else {
    files.events.EVENTS.forEach((event, index) => {
      const scope = `events.json -> EVENTS[${index}]`;
      if (!isPlainObject(event)) { addError(errors, scope, 'ожидается объект'); return; }
      if (typeof event.id !== 'string' || event.id.trim() === '') addError(errors, `${scope}.id`, 'ожидается непустая строка');
      if (typeof event.title !== 'string' || event.title.trim() === '') addError(errors, `${scope}.title`, 'ожидается непустая строка');
      if (typeof event.description !== 'string' || event.description.trim() === '') addError(errors, `${scope}.description`, 'ожидается непустая строка');
      if (!Array.isArray(event.helpful_professions)) addError(errors, `${scope}.helpful_professions`, 'ожидается массив строк');
      if (!Array.isArray(event.helpful_items)) addError(errors, `${scope}.helpful_items`, 'ожидается массив строк');
      for (const effectKey of ['success_effect', 'failure_effect', 'nothing_effect']) {
        const eff = event[effectKey];
        if (!isPlainObject(eff)) { addError(errors, `${scope}.${effectKey}`, 'ожидается объект эффекта'); continue; }
        if (typeof eff.type !== 'string' || eff.type.trim() === '') addError(errors, `${scope}.${effectKey}.type`, 'ожидается непустая строка');
        if (eff.type === 'survival_change' && typeof eff.value !== 'number') addError(errors, `${scope}.${effectKey}.value`, 'ожидается число');
      }
    });
  }

  return {
    packName,
    valid: errors.length === 0,
    errors,
  };
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
    const filePath = path.join(dir, `${file}.json`);
    if (!fs.existsSync(filePath)) {
      addError(errors, `${packName}/${file}.json`, 'файл отсутствует');
      continue;
    }

    try {
      files[file] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      addError(errors, `${packName}/${file}.json`, `не удалось распарсить JSON: ${error.message}`);
    }
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

function listPacks() {
  return fs.readdirSync(CONFIGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const result = validatePack(entry.name);
      if (!result.valid) reportPackIssues(entry.name, result.errors);
      return result;
    })
    .filter((result) => result.valid)
    .map((result) => result.packName)
    .sort((a, b) => a.localeCompare(b));
}

function getDefaultPackName() {
  const packs = listPacks();
  if (packs.length === 0) {
    throw new Error('No valid configuration packs found');
  }
  return packs.includes('DefaultPack') ? 'DefaultPack' : packs[0];
}

function loadPack(packName = getDefaultPackName()) {
  const result = validatePack(packName);
  if (!result.valid) {
    reportPackIssues(packName, result.errors);
    throw new Error(formatPackError(packName, result.errors));
  }

  const dir = getPackDir(packName);
  return PACK_FILES.reduce((cfg, file) => ({
    ...cfg,
    ...JSON.parse(fs.readFileSync(path.join(dir, `${file}.json`), 'utf8')),
  }), {});
}

const defaultConfig = loadPack();
defaultConfig.loadPack = loadPack;
defaultConfig.listPacks = listPacks;
defaultConfig.getDefaultPackName = getDefaultPackName;
defaultConfig.validatePack = validatePack;

module.exports = defaultConfig;
