const GameConfig = require('./gameConfig');

const ATTRIBUTE_LABELS = {
  gender: 'Пол',
  body: 'Телосложение',
  trait: 'Черта',
  profession: 'Профессия',
  health: 'Здоровье',
  hobby: 'Хобби',
  phobia: 'Фобия',
  inventory: 'Инвентарь',
  backpack: 'Рюкзак',
  additional: 'Доп. факт',
};

const ABILITIES = {
  'Врач': {
    key: 'doctor_heal',
    title: 'Лечение',
    description: 'Полностью лечит здоровье выбранного игрока.',
    targetType: 'other',
  },
  'Инженер': {
    key: 'engineer_kit',
    title: 'Инструментальный набор',
    description: 'Выдаёт себе набор инструментов.',
    targetType: 'self',
  },
  'Учитель': {
    key: 'teacher_retrain',
    title: 'Переобучение',
    description: 'Меняет хобби выбранного игрока.',
    targetType: 'other',
  },
  'Военный': {
    key: 'soldier_cache',
    title: 'Заначка',
    description: 'Добавляет себе оружие.',
    targetType: 'self',
  },
  'Фермер': {
    key: 'farmer_food',
    title: 'Прибавка еды',
    description: 'Увеличивает запас еды в бункере на одну ступень.',
    targetType: 'none',
  },
  'Программист': {
    key: 'programmer_scan',
    title: 'Проверка',
    description: 'Узнаёт один скрытый атрибут выбранного игрока.',
    targetType: 'other',
  },
  'Повар': {
    key: 'cook_food',
    title: 'Прибавка еды',
    description: 'Увеличивает запас еды в бункере на одну ступень.',
    targetType: 'none',
  },
  'Строитель': {
    key: 'builder_supplies',
    title: 'Стройматериалы',
    description: 'Добавляет себе строительный инвентарь.',
    targetType: 'self',
  },
  'Учёный': {
    key: 'scientist_experiment',
    title: 'Эксперимент',
    description: 'Меняет здоровье или фобию выбранного игрока.',
    targetType: 'other',
    variants: [
      { key: 'health', label: 'Менять здоровье' },
      { key: 'phobia', label: 'Менять фобию' },
    ],
  },
  'Пилот': {
    key: 'pilot_navigation',
    title: 'Лётная карта',
    description: 'Добавляет себе навигационный инвентарь.',
    targetType: 'self',
  },
  'Электрик': {
    key: 'electrician_gear',
    title: 'Электронабор',
    description: 'Добавляет себе электротехнический инвентарь.',
    targetType: 'self',
  },
  'Сантехник': {
    key: 'plumber_filter',
    title: 'Фильтр для воды',
    description: 'Добавляет себе фильтр для воды.',
    targetType: 'self',
  },
  'Психолог': {
    key: 'psychologist_therapy',
    title: 'Терапия',
    description: 'Меняет фобию выбранного игрока.',
    targetType: 'other',
  },
  'Биолог': {
    key: 'biologist_mutation',
    title: 'Мутация',
    description: 'Меняет пол, телосложение или здоровье выбранного игрока.',
    targetType: 'other',
    variants: [
      { key: 'gender', label: 'Менять пол' },
      { key: 'body', label: 'Менять телосложение' },
      { key: 'health', label: 'Менять здоровье' },
    ],
  },
  'Химик': {
    key: 'chemist_mix',
    title: 'Отравление или лечение',
    description: 'Улучшает или ухудшает здоровье выбранного игрока.',
    targetType: 'other',
    variants: [
      { key: 'heal', label: 'Лечить' },
      { key: 'harm', label: 'Отравить' },
    ],
  },
  'Механик': {
    key: 'mechanic_tools',
    title: 'Ремкомплект',
    description: 'Добавляет себе механический инструмент.',
    targetType: 'self',
  },
  'Сварщик': {
    key: 'welder_rig',
    title: 'Сварочный комплект',
    description: 'Добавляет себе сварочный инвентарь.',
    targetType: 'self',
  },
  'Охотник': {
    key: 'hunter_food',
    title: 'Прибавка еды',
    description: 'Увеличивает запас еды в бункере на одну ступень.',
    targetType: 'none',
  },
  'Киллер': {
    key: 'killer_strip_inventory',
    title: 'Устранение признака',
    description: 'Лишает выбранного игрока его основного инвентаря.',
    targetType: 'other',
  },
  'Шпион': {
    key: 'spy_scan',
    title: 'Сбор данных',
    description: 'Узнаёт один скрытый атрибут выбранного игрока.',
    targetType: 'other',
  },
  'Торговец': {
    key: 'trader_swap_inventory',
    title: 'Обмен',
    description: 'Меняет местами инвентарь двух выбранных игроков.',
    targetType: 'pair',
  },
  'Банкир': {
    key: 'banker_cash',
    title: 'Наличные',
    description: 'Добавляет себе деньги, которые в апокалипсисе почти бесполезны.',
    targetType: 'self',
  },
  'Юрист': {
    key: 'lawyer_rewrite',
    title: 'Переписывание',
    description: 'Меняет дополнительный факт выбранного игрока.',
    targetType: 'other',
  },
  'Архитектор': {
    key: 'architect_plan',
    title: 'План эвакуации',
    description: 'Добавляет себе план помещений.',
    targetType: 'self',
  },
  'Следователь': {
    key: 'detective_reveal',
    title: 'Допрос',
    description: 'Публично раскрывает один скрытый атрибут выбранного игрока.',
    targetType: 'other',
  },
  'Судья': {
    key: 'judge_status',
    title: 'Мантия судьи',
    description: 'Добавляет себе статусный, но почти бесполезный предмет.',
    targetType: 'self',
  },
  'Бандит': {
    key: 'bandit_rob',
    title: 'Грабёж',
    description: 'Крадёт основной инвентарь выбранного игрока.',
    targetType: 'other',
  },
  'Бармен': {
    key: 'bartender_mix',
    title: 'Спаивание',
    description: 'Меняет дополнительный факт или инвентарь выбранного игрока.',
    targetType: 'other',
    variants: [
      { key: 'additional', label: 'Менять доп. факт' },
      { key: 'inventory', label: 'Менять инвентарь' },
    ],
  },
  'Секс-работник': {
    key: 'seduce_shift',
    title: 'Соблазнение',
    description: 'Меняет пол или дополнительный факт выбранного игрока.',
    targetType: 'other',
    variants: [
      { key: 'gender', label: 'Менять пол' },
      { key: 'additional', label: 'Менять доп. факт' },
    ],
  },
  'Клоун': {
    key: 'clown_break',
    title: 'Срыв',
    description: 'Меняет фобию или дополнительный факт выбранного игрока.',
    targetType: 'other',
    variants: [
      { key: 'phobia', label: 'Менять фобию' },
      { key: 'additional', label: 'Менять доп. факт' },
    ],
  },
  'Трюкач': {
    key: 'trickster_swap',
    title: 'Подмена',
    description: 'Меняет местами фобии, хобби или инвентарь двух выбранных игроков.',
    targetType: 'pair',
    variants: [
      { key: 'hobby', label: 'Менять хобби' },
      { key: 'phobia', label: 'Менять фобии' },
      { key: 'inventory', label: 'Менять инвентарь' },
    ],
  },
};

const SELF_INVENTORY_REWARDS = {
  'Инженер': 'Набор инструментов',
  'Военный': 'AK-47',
  'Строитель': 'Верстак с инструментами',
  'Пилот': 'Карта местности',
  'Электрик': 'Электроника',
  'Сантехник': 'Фильтр для воды',
  'Механик': 'Набор инструментов',
  'Сварщик': 'Сварочный аппарат',
  'Банкир': '1000 долларов',
  'Судья': 'Судейская мантия',
};

function addItemToBackpack(backpackValue, item) {
  if (!backpackValue) return item;
  if (backpackValue.split(', ').includes(item)) return backpackValue;
  return `${backpackValue}, ${item}`;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomWeightedValue(table) {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = Math.random() * total;
  for (const [value, weight] of table) {
    cursor -= weight;
    if (cursor <= 0) return value;
  }
  return table[table.length - 1][0];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickDifferent(currentValue, values) {
  if (values.length <= 1) return values[0];
  let nextValue = currentValue;
  while (nextValue === currentValue) {
    nextValue = randomItem(values);
  }
  return nextValue;
}

function getProfessionBaseName(professionValue) {
  if (!professionValue) return '';
  const dividerIndex = professionValue.indexOf(' (');
  return dividerIndex === -1 ? professionValue : professionValue.slice(0, dividerIndex);
}

function getProfessionAbilityDefinition(professionValue) {
  return ABILITIES[getProfessionBaseName(professionValue)] ?? null;
}

function hasAbilityVariant(definition, variant) {
  return Boolean(definition?.variants?.some((option) => option.key === variant));
}

function getProfessionAbilityInfo(player, viewerId) {
  const canSeeProfession = viewerId === player.id || player.revealed_attributes.profession;
  if (!canSeeProfession) return null;

  const definition = getProfessionAbilityDefinition(player.profession);
  if (definition) {
    return {
      ...definition,
      hasAbility: true,
      used: player.profession_ability_used,
    };
  }

  return {
    key: 'unknown_ability',
    title: 'Неизвестная способность',
    description: 'Для этой профессии не настроена способность.',
    targetType: 'none',
    hasAbility: false,
    used: false,
  };
}

function createGenderValue() {
  const gender = randomWeightedValue(GameConfig.GENDERS);
  const affix = randomWeightedValue(GameConfig.GENDER_AFFIXES);
  const ageRange = randomWeightedValue(GameConfig.AGES);
  const age = randomInt(ageRange[0], ageRange[1]);
  return `${gender} ${affix} (${age} лет)`;
}

function createBodyValue() {
  const bodyType = randomWeightedValue(GameConfig.BODY_TYPES);
  const height = randomInt(150, 210);
  return `${bodyType} (${height} см)`;
}

function createHealthValue(forceHealthy = false) {
  if (forceHealthy) return 'Здоров';
  const state = randomWeightedValue(GameConfig.HEALTH_STATES);
  if (state === 'Здоров') return 'Здоров';
  const stage = randomWeightedValue(GameConfig.HEALTH_STAGES);
  return `${state} (${stage})`;
}

function createHobbyValue() {
  return `${randomItem(GameConfig.HOBBIES)} (${randomWeightedValue(GameConfig.SKILL_LEVELS)})`;
}

function createPhobiaValue() {
  return `Страх ${randomItem(GameConfig.PHOBIAS)}`;
}

function createInventoryValue() {
  return randomItem(GameConfig.INVENTORY);
}

function createAdditionalValue() {
  return randomItem(GameConfig.ADDITIONAL_INFO);
}

function createWorseHealthValue(currentValue) {
  const candidates = [];
  for (const [state] of GameConfig.HEALTH_STATES) {
    if (state === 'Здоров') continue;
    for (const [stage] of GameConfig.HEALTH_STAGES) {
      candidates.push(`${state} (${stage})`);
    }
  }
  return pickDifferent(currentValue, candidates);
}

function adjustFoodSupply(room, delta) {
  const supplies = GameConfig.FOOD_SUPPLIES;
  const currentIndex = Math.max(0, supplies.indexOf(room.bunker.food));
  const nextIndex = Math.max(0, Math.min(supplies.length - 1, currentIndex + delta));
  room.bunker.food = supplies[nextIndex];
}

function getTargetPlayer(room, actor, targetId, allowSelf = false) {
  if (!targetId) return null;
  const target = room.getPlayer(targetId);
  if (!target || !target.is_active) return null;
  if (!allowSelf && target.id === actor.id) return null;
  return target;
}

function getTwoTargets(room, actor, targetId, secondTargetId) {
  if (!targetId || !secondTargetId || targetId === secondTargetId) return null;
  const firstTarget = getTargetPlayer(room, actor, targetId);
  const secondTarget = getTargetPlayer(room, actor, secondTargetId);
  if (!firstTarget || !secondTarget) return null;
  return [firstTarget, secondTarget];
}

function chooseInspectableAttribute(target) {
  const hidden = Object.entries(target.revealed_attributes)
    .filter(([, revealed]) => !revealed)
    .map(([attribute]) => attribute);
  const pool = hidden.length > 0 ? hidden : Object.keys(ATTRIBUTE_LABELS);
  return randomItem(pool);
}

function applySelfAbility(room, actor, professionName) {
  if (SELF_INVENTORY_REWARDS[professionName]) {
    actor.backpack = addItemToBackpack(actor.backpack, SELF_INVENTORY_REWARDS[professionName]);
    actor.profession_ability_used = true;
    room.touch();
    return { ok: true, publicMessage: `${actor.name} использовал личную способность.` };
  }

  if (professionName === 'Архитектор') {
    actor.additional = 'Имеет план помещений';
    actor.profession_ability_used = true;
    room.touch();
    return { ok: true, publicMessage: `${actor.name} использовал личную способность.` };
  }

  return { ok: false, error: 'Для этой профессии не настроена способность.' };
}

function applyProfessionAbility(room, actor, targetId, secondTargetId, variant) {
  const definition = getProfessionAbilityDefinition(actor.profession);
  if (!definition) return { ok: false, error: 'У этой профессии нет активной способности.' };
  if (actor.profession_ability_used) return { ok: false, error: 'Способность этой профессии уже использована.' };
  if (definition.variants?.length && !hasAbilityVariant(definition, variant)) {
    return { ok: false, error: 'Нужно выбрать вариант применения способности.' };
  }

  const professionName = getProfessionBaseName(actor.profession);
  if (definition.targetType === 'self') {
    return applySelfAbility(room, actor, professionName);
  }
  const allowSelfTarget = definition.targetType === 'other' && Boolean(definition.variants?.length);

  let publicMessage = '';
  let privateMessage = '';

  switch (professionName) {
    case 'Врач': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      target.health = createHealthValue(true);
      publicMessage = `${actor.name} вылечил игрока ${target.name}.`;
      break;
    }
    case 'Учитель': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      target.hobby = pickDifferent(
        target.hobby,
        GameConfig.HOBBIES.map((hobby) => `${hobby} (${randomWeightedValue(GameConfig.SKILL_LEVELS)})`)
      );
      publicMessage = `${actor.name} переобучил игрока ${target.name}.`;
      break;
    }
    case 'Фермер':
    case 'Повар':
    case 'Охотник': {
      adjustFoodSupply(room, 1);
      publicMessage = `${actor.name} увеличил запас еды в бункере.`;
      break;
    }
    case 'Программист':
    case 'Шпион': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      const attribute = chooseInspectableAttribute(target);
      publicMessage = `${actor.name} использовал способность на игроке ${target.name}.`;
      privateMessage = `${target.name}: ${ATTRIBUTE_LABELS[attribute]} — ${target[attribute]}.`;
      break;
    }
    case 'Учёный': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      if (variant === 'health') {
        target.health = pickDifferent(target.health, [createHealthValue(), createWorseHealthValue(target.health)]);
      }
      if (variant === 'phobia') {
        target.phobia = pickDifferent(target.phobia, GameConfig.PHOBIAS.map((phobia) => `Страх ${phobia}`));
      }
      publicMessage = `${actor.name} поставил эксперимент над игроком ${target.name}.`;
      break;
    }
    case 'Психолог': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      target.phobia = pickDifferent(target.phobia, GameConfig.PHOBIAS.map((phobia) => `Страх ${phobia}`));
      publicMessage = `${actor.name} изменил фобию игрока ${target.name}.`;
      break;
    }
    case 'Биолог': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      if (variant === 'gender') target.gender = createGenderValue();
      if (variant === 'body') target.body = createBodyValue();
      if (variant === 'health') target.health = createHealthValue();
      publicMessage = `${actor.name} вызвал мутацию у игрока ${target.name}.`;
      break;
    }
    case 'Химик': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      if (variant === 'heal') target.health = createHealthValue(true);
      if (variant === 'harm') target.health = createWorseHealthValue(target.health);
      publicMessage = `${actor.name} применил химический состав на игроке ${target.name}.`;
      break;
    }
    case 'Киллер': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      target.inventory = 'Потерян';
      publicMessage = `${actor.name} лишил игрока ${target.name} его инвентаря.`;
      break;
    }
    case 'Торговец': {
      const targets = getTwoTargets(room, actor, targetId, secondTargetId);
      if (!targets) return { ok: false, error: 'Нужно выбрать двух разных активных игроков.' };
      const [firstTarget, secondTarget] = targets;
      [firstTarget.inventory, secondTarget.inventory] = [secondTarget.inventory, firstTarget.inventory];
      publicMessage = `${actor.name} обменял инвентарь игроков ${firstTarget.name} и ${secondTarget.name}.`;
      break;
    }
    case 'Юрист': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      target.additional = pickDifferent(target.additional, GameConfig.ADDITIONAL_INFO);
      publicMessage = `${actor.name} переписал биографию игрока ${target.name}.`;
      break;
    }
    case 'Следователь': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      const attribute = chooseInspectableAttribute(target);
      target.revealed_attributes[attribute] = true;
      publicMessage = `${actor.name} раскрыл у игрока ${target.name} атрибут "${ATTRIBUTE_LABELS[attribute]}": ${target[attribute]}.`;
      break;
    }
    case 'Бандит': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      actor.inventory = target.inventory;
      target.inventory = 'Украден';
      publicMessage = `${actor.name} ограбил игрока ${target.name}.`;
      break;
    }
    case 'Бармен': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      if (variant === 'additional') target.additional = pickDifferent(target.additional, GameConfig.ADDITIONAL_INFO);
      if (variant === 'inventory') target.inventory = pickDifferent(target.inventory, GameConfig.INVENTORY);
      publicMessage = `${actor.name} споил игрока ${target.name}.`;
      break;
    }
    case 'Секс-работник': {
      const target = getTargetPlayer(room, actor, targetId, allowSelfTarget);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      if (variant === 'gender') target.gender = createGenderValue();
      if (variant === 'additional') target.additional = pickDifferent(target.additional, GameConfig.ADDITIONAL_INFO);
      publicMessage = `${actor.name} повлиял на игрока ${target.name}.`;
      break;
    }
    case 'Клоун': {
      const target = getTargetPlayer(room, actor, targetId);
      if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
      if (variant === 'phobia') target.phobia = pickDifferent(target.phobia, GameConfig.PHOBIAS.map((phobia) => `Страх ${phobia}`));
      if (variant === 'additional') target.additional = pickDifferent(target.additional, GameConfig.ADDITIONAL_INFO);
      publicMessage = `${actor.name} устроил срыв игроку ${target.name}.`;
      break;
    }
    case 'Трюкач': {
      const targets = getTwoTargets(room, actor, targetId, secondTargetId);
      if (!targets) return { ok: false, error: 'Нужно выбрать двух разных активных игроков.' };
      const [firstTarget, secondTarget] = targets;
      [firstTarget[variant], secondTarget[variant]] = [secondTarget[variant], firstTarget[variant]];
      publicMessage = `${actor.name} подменил ${ATTRIBUTE_LABELS[variant].toLowerCase()} игроков ${firstTarget.name} и ${secondTarget.name}.`;
      break;
    }
    default:
      return { ok: false, error: 'Для этой профессии не настроена способность.' };
  }

  actor.profession_ability_used = true;
  room.touch();
  return { ok: true, publicMessage, privateMessage };
}

module.exports = {
  getProfessionAbilityInfo,
  applyProfessionAbility,
};
