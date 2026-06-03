const { isPlainObject } = require('./settings');
const { validateVariantString } = require('./itemVariants');
const { normalizeConfig, validateStructuredConfig } = require('./structuredConfig');

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TARGET_TYPES = new Set(['none', 'self', 'other', 'pair']);
const ATTRIBUTE_KEYS = new Set(['gender', 'race', 'body', 'health', 'hobby', 'phobia', 'inventory', 'additional']);
const EVENT_TEMPLATE_RE = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
const EVENT_PARTICIPANT_TEMPLATE_RE = /^participant\d+$/;

function addError(errors, scope, message) {
  errors.push(`${scope}: ${message}`);
}

function validateStringArray(value, scope, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустой массив строк');
    return;
  }
  value.forEach((item, index) => {
    // Object syntax: { label, groups? }
    if (item && typeof item === 'object' && !Array.isArray(item) && 'label' in item) {
      if (typeof item.label !== 'string' || item.label.trim() === '') {
        addError(errors, `${scope}[${index}].label`, 'ожидается непустая строка');
      }
      return;
    }
    if (typeof item !== 'string' || item.trim() === '') {
      addError(errors, `${scope}[${index}]`, 'ожидается непустая строка');
      return;
    }
    try {
      validateVariantString(item);
    } catch (error) {
      addError(errors, `${scope}[${index}]`, error.message);
    }
  });
}

function validateNumberInRange(value, scope, errors, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    addError(errors, scope, `ожидается число от ${min} до ${max}`);
  }
}

function validatePositiveInteger(value, scope, errors) {
  if (!Number.isInteger(value) || value < 1) {
    addError(errors, scope, 'ожидается положительное целое число');
  }
}

function validateBunkerLifeSettings(settings, scope, errors) {
  if (!isPlainObject(settings)) { addError(errors, scope, 'ожидается объект'); return; }
  if (settings.initial_survival_chance !== undefined) {
    validatePositiveInteger(settings.initial_survival_chance, `${scope}.initial_survival_chance`, errors);
  }
  if (settings.max_survival_chance !== undefined) {
    validatePositiveInteger(settings.max_survival_chance, `${scope}.max_survival_chance`, errors);
  }
  if (
    settings.initial_survival_chance !== undefined
    && settings.max_survival_chance !== undefined
    && settings.initial_survival_chance > settings.max_survival_chance
  ) {
    addError(errors, `${scope}.initial_survival_chance`, 'не может быть больше max_survival_chance');
  }
  if (settings.month_duration_ms !== undefined) {
    validatePositiveInteger(settings.month_duration_ms, `${scope}.month_duration_ms`, errors);
  }
  if (settings.food_consumption_per_player !== undefined) {
    validatePositiveInteger(settings.food_consumption_per_player, `${scope}.food_consumption_per_player`, errors);
  }
}

function validateBunkerGenerationSettings(settings, scope, errors) {
  if (!isPlainObject(settings)) { addError(errors, scope, 'ожидается объект'); return; }
  if (settings.max_empty_fraction !== undefined) {
    validateNumberInRange(settings.max_empty_fraction, `${scope}.max_empty_fraction`, errors, 0, 1);
  }
  if (settings.max_extra_items !== undefined && (!Number.isInteger(settings.max_extra_items) || settings.max_extra_items < 0)) {
    addError(errors, `${scope}.max_extra_items`, 'ожидается целое число не меньше 0');
  }
}

function validateEventSettings(settings, scope, errors) {
  if (!isPlainObject(settings)) { addError(errors, scope, 'ожидается объект'); return; }
  if (settings.bunker_event_chance !== undefined) {
    validateNumberInRange(settings.bunker_event_chance, `${scope}.bunker_event_chance`, errors, 0, 1);
  }
  if (settings.success_chances_by_resources !== undefined) {
    if (!Array.isArray(settings.success_chances_by_resources) || settings.success_chances_by_resources.length !== 3) {
      addError(errors, `${scope}.success_chances_by_resources`, 'ожидается массив из 3 чисел: [1 ресурс, 2 ресурса, 3+ ресурса]');
    } else {
      settings.success_chances_by_resources.forEach((chance, index) => {
        validateNumberInRange(chance, `${scope}.success_chances_by_resources[${index}]`, errors, 0, 1);
      });
    }
  }
  if (settings.food_replenish !== undefined) {
    if (!isPlainObject(settings.food_replenish)) {
      addError(errors, `${scope}.food_replenish`, 'ожидается объект');
    } else if (settings.food_replenish.food_per_resource !== undefined) {
      validatePositiveInteger(settings.food_replenish.food_per_resource, `${scope}.food_replenish.food_per_resource`, errors);
    }
  }
}

function extractTemplateKeys(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(EVENT_TEMPLATE_RE)].map(match => match[1]);
}

function isParticipantTemplateKey(key, eventRoles) {
  if (key === 'participants' || EVENT_PARTICIPANT_TEMPLATE_RE.test(key) || key.startsWith('context.')) return true;
  // Role name or role.attribute from participants slots
  const base = key.includes('.') ? key.slice(0, key.indexOf('.')) : key;
  return eventRoles?.has(base) ?? false;
}

function getEventRoles(event) {
  const roles = new Set();
  if (Array.isArray(event.participants)) {
    event.participants.forEach((slot, i) => {
      roles.add(typeof slot.role === 'string' && slot.role.trim() !== '' ? slot.role : `participant${i + 1}`);
    });
  }
  return roles;
}

function validateEventText(value, scope, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    addError(errors, scope, 'ожидается непустая строка');
  }
}

function validateEventTextValue(value, scope, errors) {
  if (typeof value === 'string') { validateEventText(value, scope, errors); return; }
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

function validateEventTemplateSource(event, altText, scope, key, errors, eventRoles) {
  if (isParticipantTemplateKey(key, eventRoles)) return;
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
  const eventRoles = getEventRoles(event);
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    for (const key of extractTemplateKeys(entry)) {
      validateEventTemplateSource(event, altText, `${scope}.${fieldName}`, key, errors, eventRoles);
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
    // Object syntax: { label, weight, groups? }
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'label' in entry) {
      if (typeof entry.label !== 'string' || entry.label.trim() === '') {
        addError(errors, `${scope}[${index}].label`, 'ожидается непустая строка');
      }
      if (typeof entry.weight !== 'number' || !Number.isFinite(entry.weight) || entry.weight <= 0) {
        addError(errors, `${scope}[${index}].weight`, 'вес должен быть положительным числом');
      }
      return;
    }
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
  if (min > max) addError(errors, scope, 'левая граница диапазона не может быть больше правой');
}

function validateNamedObjectArray(value, scope, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустой массив объектов');
    return;
  }
  value.forEach((item, index) => {
    if (!isPlainObject(item)) { addError(errors, `${scope}[${index}]`, 'ожидается объект'); return; }
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      addError(errors, `${scope}[${index}].name`, 'ожидается непустая строка');
    }
    if (item.description !== undefined && typeof item.description !== 'string') {
      addError(errors, `${scope}[${index}].description`, 'если поле указано, оно должно быть строкой');
    }
  });
}

function validateFoodSupplies(value, scope, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустой массив объектов');
    return;
  }
  value.forEach((item, index) => {
    if (!isPlainObject(item)) { addError(errors, `${scope}[${index}]`, 'ожидается объект'); return; }
    const label = item.label ?? item.name;
    if (typeof label !== 'string' || label.trim() === '') {
      addError(errors, `${scope}[${index}].label`, 'ожидается непустая строка');
    }
    validatePositiveInteger(item.amount, `${scope}[${index}].amount`, errors);
  });
}

function validateDurationArray(value, scope, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустой массив длительностей');
    return;
  }
  value.forEach((item, index) => {
    if (!Array.isArray(item) || item.length !== 2) {
      addError(errors, `${scope}[${index}]`, 'ожидается массив [name, months]');
      return;
    }
    const [name, months] = item;
    if (typeof name !== 'string' || name.trim() === '') {
      addError(errors, `${scope}[${index}][0]`, 'ожидается непустая строка');
    }
    if (!Number.isInteger(months) || months < 1) {
      addError(errors, `${scope}[${index}][1]`, 'ожидается положительное целое число месяцев');
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
      if (item.trim() === '') {
        addError(errors, `${scope}[${index}]`, 'строка не должна быть пустой');
        return;
      }
      try {
        validateVariantString(item);
      } catch (error) {
        addError(errors, `${scope}[${index}]`, error.message);
      }
      return;
    }
    if (!Array.isArray(item) || item.length !== 3) {
      addError(errors, `${scope}[${index}]`, 'ожидается строка или массив [name, min, max]');
      return;
    }
    const [name, min, max] = item;
    if (typeof name !== 'string' || name.trim() === '') addError(errors, `${scope}[${index}][0]`, 'ожидается непустая строка');
    else {
      try {
        validateVariantString(name);
      } catch (error) {
        addError(errors, `${scope}[${index}][0]`, error.message);
      }
    }
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      addError(errors, `${scope}[${index}]`, 'min и max должны быть целыми числами');
      return;
    }
    if (min > max) addError(errors, `${scope}[${index}]`, 'min не может быть больше max');
    if (min < 1) addError(errors, `${scope}[${index}]`, 'количество предметов должно быть не меньше 1');
  });
}

function validateEffect(effect, scope, errors, targetType) {
  if (!isPlainObject(effect)) { addError(errors, scope, 'ожидается объект эффекта'); return; }
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
  if (!isPlainObject(value)) { addError(errors, scope, 'ожидается объект описания профессии'); return; }
  if (typeof value.title !== 'string' || value.title.trim() === '') addError(errors, `${scope}.title`, 'ожидается непустая строка');
  if (typeof value.description !== 'string' || value.description.trim() === '') addError(errors, `${scope}.description`, 'ожидается непустая строка');
  if (typeof value.publicMessage !== 'string' || value.publicMessage.trim() === '') addError(errors, `${scope}.publicMessage`, 'ожидается непустая строка');
  if (typeof value.targetType !== 'string' || !TARGET_TYPES.has(value.targetType)) {
    addError(errors, `${scope}.targetType`, `ожидается одно из значений: ${[...TARGET_TYPES].join(', ')}`);
  }
  if (value.allowSelf !== undefined && typeof value.allowSelf !== 'boolean') {
    addError(errors, `${scope}.allowSelf`, 'если поле указано, оно должно быть boolean');
  }
  const hasEffect = value.effect !== undefined;
  const hasVariants = Array.isArray(value.variants) && value.variants.length > 0;
  if (!hasEffect && !hasVariants) addError(errors, scope, 'должно быть задано либо поле effect, либо непустой массив variants');
  if (hasEffect) validateEffect(value.effect, `${scope}.effect`, errors, value.targetType);
  if (value.variants !== undefined) {
    if (!Array.isArray(value.variants) || value.variants.length === 0) {
      addError(errors, `${scope}.variants`, 'если поле указано, ожидается непустой массив');
    } else {
      value.variants.forEach((variant, index) => {
        if (!isPlainObject(variant)) { addError(errors, `${scope}.variants[${index}]`, 'ожидается объект'); return; }
        if (typeof variant.key !== 'string' || variant.key.trim() === '') addError(errors, `${scope}.variants[${index}].key`, 'ожидается непустая строка');
        if (typeof variant.label !== 'string' || variant.label.trim() === '') addError(errors, `${scope}.variants[${index}].label`, 'ожидается непустая строка');
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
    validateDurationArray(files.Bunker.BUNKER_DURATIONS, 'Bunker -> BUNKER_DURATIONS', errors);
    validateFoodSupplies(files.Bunker.FOOD_SUPPLIES, 'Bunker -> FOOD_SUPPLIES', errors);
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

    if (files.Bunker.BUNKER_LIFE_SETTINGS !== undefined) {
      validateBunkerLifeSettings(files.Bunker.BUNKER_LIFE_SETTINGS, 'Bunker -> BUNKER_LIFE_SETTINGS', errors);
    }
    if (files.Bunker.BUNKER_GENERATION_SETTINGS !== undefined) {
      validateBunkerGenerationSettings(files.Bunker.BUNKER_GENERATION_SETTINGS, 'Bunker -> BUNKER_GENERATION_SETTINGS', errors);
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
  } else {
    if (files.Event.EVENT_SETTINGS !== undefined) {
      validateEventSettings(files.Event.EVENT_SETTINGS, 'Event -> EVENT_SETTINGS', errors);
    }
    if (!Array.isArray(files.Event.EVENTS) || files.Event.EVENTS.length === 0) {
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
              if (!isPlainObject(altText)) { addError(errors, altScope, 'ожидается объект'); return; }
              if ('title' in altText || 'description' in altText) {
                addError(errors, altScope, 'alt должен содержать только данные для подстановок, без title/description');
              }
              for (const [key, value] of Object.entries(altText)) {
                if (typeof value === 'string') {
                  if (value.trim() === '') addError(errors, `${altScope}.${key}`, 'ожидается непустая строка');
                  continue;
                }
                if (Array.isArray(value)) {
                  if (value.length === 0) { addError(errors, `${altScope}.${key}`, 'ожидается непустой массив строк'); continue; }
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
        if (event.participants != null) {
          if (!Array.isArray(event.participants) || event.participants.length === 0) {
            addError(errors, `${scope}.participants`, 'ожидается непустой массив слотов');
          } else {
            event.participants.forEach((slot, i) => {
              const slotScope = `${scope}.participants[${i}]`;
              if (!isPlainObject(slot)) { addError(errors, slotScope, 'ожидается объект'); return; }
              if (slot.role != null && typeof slot.role !== 'string') addError(errors, `${slotScope}.role`, 'ожидается строка');
              if (slot.optional != null && typeof slot.optional !== 'boolean') addError(errors, `${slotScope}.optional`, 'ожидается boolean');
              if (slot.filter != null && !isPlainObject(slot.filter)) addError(errors, `${slotScope}.filter`, 'ожидается объект');
            });
          }
        }
        const KNOWN_EFFECT_TYPES = new Set([
          'survival_change', 'food_change',
          'kill_participant', 'kill_random_active',
          'remove_room', 'add_room', 'add_player', 'schedule_event',
          'if',
        ]);

        const validateEffect = (eff, effScope) => {
          if (!isPlainObject(eff)) { addError(errors, effScope, 'ожидается объект эффекта'); return; }
          if (typeof eff.type !== 'string' || eff.type.trim() === '') { addError(errors, `${effScope}.type`, 'ожидается непустая строка'); return; }
          if (!KNOWN_EFFECT_TYPES.has(eff.type)) addError(errors, `${effScope}.type`, `неизвестный тип: "${eff.type}"`);
          if (eff.type === 'survival_change' && typeof eff.value !== 'number') addError(errors, `${effScope}.value`, 'ожидается число');
          if (eff.type === 'food_change' && typeof eff.value !== 'number') addError(errors, `${effScope}.value`, 'ожидается число');
          if (eff.chance != null && (typeof eff.chance !== 'number' || eff.chance <= 0 || eff.chance > 1)) addError(errors, `${effScope}.chance`, 'ожидается число от 0 (исключительно) до 1');
          if (eff.per_target_chance != null && (typeof eff.per_target_chance !== 'number' || eff.per_target_chance <= 0 || eff.per_target_chance > 1)) addError(errors, `${effScope}.per_target_chance`, 'ожидается число от 0 (исключительно) до 1');
          if (eff.per_target_chance != null && !(eff.type === 'kill_participant' && eff.target === 'each_participant')) {
            addError(errors, `${effScope}.per_target_chance`, 'допустим только для kill_participant с target: each_participant');
          }
          if (eff.type === 'schedule_event') {
            if (typeof eff.event_id !== 'string' || eff.event_id.trim() === '') addError(errors, `${effScope}.event_id`, 'ожидается непустая строка');
            if (!Number.isInteger(eff.delay_months) || eff.delay_months < 1) addError(errors, `${effScope}.delay_months`, 'ожидается целое число >= 1');
          }
          if (eff.type === 'if') {
            if (!isPlainObject(eff.condition)) addError(errors, `${effScope}.condition`, 'ожидается объект условия');
            if (eff.then != null) {
              if (!Array.isArray(eff.then)) addError(errors, `${effScope}.then`, 'ожидается массив эффектов');
              else eff.then.forEach((e, i) => validateEffect(e, `${effScope}.then[${i}]`));
            }
            if (eff.else != null) {
              if (!Array.isArray(eff.else)) addError(errors, `${effScope}.else`, 'ожидается массив эффектов');
              else eff.else.forEach((e, i) => validateEffect(e, `${effScope}.else[${i}]`));
            }
          }
        };

        const validateEffectsField = (singKey, arrKey, required) => {
          if (Array.isArray(event[arrKey])) {
            event[arrKey].forEach((eff, i) => validateEffect(eff, `${scope}.${arrKey}[${i}]`));
          } else if (isPlainObject(event[singKey])) {
            validateEffect(event[singKey], `${scope}.${singKey}`);
          } else if (required) {
            addError(errors, `${scope}.${singKey}`, 'ожидается объект или массив эффектов');
          }
        };

        const isNarrative = event.event_type === 'narrative';
        const isChoice = event.choice_labels != null;
        const isPassive = !isChoice && event.base_chance == null;

        if (isChoice) {
          if (typeof event.choice_labels?.success !== 'string' || event.choice_labels.success.trim() === '') addError(errors, `${scope}.choice_labels.success`, 'ожидается непустая строка');
          if (typeof event.choice_labels?.failure !== 'string' || event.choice_labels.failure.trim() === '') addError(errors, `${scope}.choice_labels.failure`, 'ожидается непустая строка');
          validateEffectsField('success_effect', 'success_effects', true);
          validateEffectsField('failure_effect', 'failure_effects', true);
        } else if (!isPassive && !isNarrative) {
          if (typeof event.base_chance !== 'number' || event.base_chance < 0 || event.base_chance > 1) addError(errors, `${scope}.base_chance`, 'ожидается число от 0 до 1');
          validateEffectsField('success_effect', 'success_effects', true);
          validateEffectsField('failure_effect', 'failure_effects', true);
        } else {
          validateEffectsField('success_effect', 'success_effects', !isNarrative);
        }

        if (isNarrative && event.narrative_duration_ms != null) {
          if (!Number.isInteger(event.narrative_duration_ms) || event.narrative_duration_ms < 100) {
            addError(errors, `${scope}.narrative_duration_ms`, 'ожидается целое число >= 100');
          }
        }

        if (event.weight != null && (typeof event.weight !== 'number' || !Number.isFinite(event.weight) || event.weight <= 0)) {
          addError(errors, `${scope}.weight`, 'ожидается положительное число');
        }

        const allEventIds = files.Event?.EVENTS?.map(e => e.id).filter(Boolean) ?? [];
        for (const chainKey of ['chain_success', 'chain_failure']) {
          if (event[chainKey] != null) {
            if (typeof event[chainKey] !== 'string' || event[chainKey].trim() === '') {
              addError(errors, `${scope}.${chainKey}`, 'ожидается непустая строка (ID события)');
            } else if (!allEventIds.includes(event[chainKey])) {
              addError(errors, `${scope}.${chainKey}`, `событие с ID "${event[chainKey]}" не найдено`);
            }
          }
        }
      });
    }
  }

  if (files.Pack !== undefined) {
    if (!isPlainObject(files.Pack)) {
      addError(errors, 'Pack', 'корневой объект не найден');
    } else {
      if (typeof files.Pack.name !== 'string' || files.Pack.name.trim() === '') addError(errors, 'Pack -> name', 'ожидается непустая строка');
      if (typeof files.Pack.author !== 'string' || files.Pack.author.trim() === '') addError(errors, 'Pack -> author', 'ожидается непустая строка');
      if (typeof files.Pack.color !== 'string' || !HEX_COLOR_RE.test(files.Pack.color)) addError(errors, 'Pack -> color', 'ожидается hex-цвет в формате #rrggbb');
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

module.exports = { addError, validatePackContent };
