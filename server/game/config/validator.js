const { isPlainObject } = require('./settings');
const { validateVariantString } = require('./itemVariants');
const { normalizeConfig, validateStructuredConfig } = require('./structuredConfig');
const { validateEvent } = require('./yamlEvents');

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const TARGET_TYPES = new Set(['none', 'self', 'other', 'pair']);
const ATTRIBUTE_KEYS = new Set(['gender', 'race', 'body', 'health', 'hobby', 'phobia', 'inventory', 'additional']);

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

function validateWeightedTable(value, scope, errors, valueValidator = () => {}, { allowMultiplier = false } = {}) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, scope, 'ожидается непустой массив пар [значение, вес]');
    return;
  }
  const maxLen = allowMultiplier ? 3 : 2;
  value.forEach((entry, index) => {
    // Object syntax: { label, weight, groups? }
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'label' in entry) {
      if (typeof entry.label !== 'string' || entry.label.trim() === '') {
        addError(errors, `${scope}[${index}].label`, 'ожидается непустая строка');
      }
      if (typeof entry.weight !== 'number' || !Number.isFinite(entry.weight) || entry.weight <= 0) {
        addError(errors, `${scope}[${index}].weight`, 'вес должен быть положительным числом');
      }
      if (allowMultiplier && entry.multiplier !== undefined && (typeof entry.multiplier !== 'number' || !Number.isFinite(entry.multiplier) || entry.multiplier < 0)) {
        addError(errors, `${scope}[${index}].multiplier`, 'множитель должен быть неотрицательным числом');
      }
      return;
    }
    if (!Array.isArray(entry) || entry.length < 2 || entry.length > maxLen) {
      addError(errors, `${scope}[${index}]`, allowMultiplier
        ? 'ожидается массив [значение, вес] или [значение, вес, множитель]'
        : 'ожидается массив из 2 элементов: [значение, вес]');
      return;
    }
    valueValidator(entry[0], `${scope}[${index}][0]`, errors);
    if (typeof entry[1] !== 'number' || !Number.isFinite(entry[1]) || entry[1] <= 0) {
      addError(errors, `${scope}[${index}][1]`, 'вес должен быть положительным числом');
    }
    if (allowMultiplier && entry[2] !== undefined && (typeof entry[2] !== 'number' || !Number.isFinite(entry[2]) || entry[2] < 0)) {
      addError(errors, `${scope}[${index}][2]`, 'множитель должен быть неотрицательным числом');
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
    if (item.image !== undefined) {
      if (typeof item.image !== 'string' || item.image.trim() === '') {
        addError(errors, `${scope}[${index}].image`, 'если поле указано, оно должно быть непустой строкой (имя файла в папке Images/)');
      } else {
        const image = item.image.trim();
        const isUrl = /^https?:\/\//i.test(image);
        const ext = image.slice(image.lastIndexOf('.')).toLowerCase();
        if (!isUrl && !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
          addError(errors, `${scope}[${index}].image`, `недопустимое расширение файла (разрешены: ${[...ALLOWED_IMAGE_EXTENSIONS].join(', ')})`);
        }
      }
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
    }, { allowMultiplier: true });
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
      const seenIds = new Set();
      const knownIds = new Set(files.Event.EVENTS.map(e => e?.id).filter(id => typeof id === 'string'));
      files.Event.EVENTS.forEach((event, index) => {
        const fileName = event?.__file ? require('path').basename(event.__file) : `EVENTS[${index}]`;
        const scope = `Event -> ${fileName}`;
        if (!isPlainObject(event)) { addError(errors, scope, 'ожидается объект'); return; }

        if (typeof event.id === 'string' && event.id.trim() !== '') {
          if (seenIds.has(event.id)) addError(errors, `${scope}.id`, `дублирующийся id события: "${event.id}"`);
          seenIds.add(event.id);
        }

        for (const message of validateEvent(event, scope)) errors.push(message);

        // Schedule targets must reference an existing event id.
        const scheduleRefs = [
          ...(event.schedule ?? []),
          ...((event.options ?? []).flatMap(opt => opt?.schedule ?? [])),
        ];
        for (const ref of scheduleRefs) {
          if (ref && typeof ref.event === 'string' && !knownIds.has(ref.event)) {
            addError(errors, `${scope}.schedule`, `ссылка на несуществующее событие: "${ref.event}"`);
          }
        }

        // status.on_expire targets must reference an existing event id too.
        const allEffects = [
          ...(event.effects ?? []),
          ...((event.options ?? []).flatMap(opt => [
            ...(opt?.effects ?? []),
            ...((opt?.outcomes ?? []).flatMap(o => o?.effects ?? [])),
            ...Object.values(opt?.outcomes_by_selection ?? {}).flatMap(list => (Array.isArray(list) ? list : []).flatMap(o => o?.effects ?? [])),
          ])),
        ];
        for (const eff of allEffects) {
          const ref = eff?.status?.on_expire?.event;
          if (typeof ref === 'string' && !knownIds.has(ref)) {
            addError(errors, `${scope}.on_expire`, `ссылка на несуществующее событие: "${ref}"`);
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
