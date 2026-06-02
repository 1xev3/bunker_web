const ATTRIBUTE_LABELS = {
  gender: 'Пол',
  race: 'Раса',
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

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function weightedRandom(table) {
  const total = table.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.random() * total;
  for (const entry of table) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.value;
  }
  return table[table.length - 1].value;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function format(attr, value, config) {
  return require('../entities/player').formatAttribute(attr, value, config);
}

function pickDifferent(currentId, values) {
  if (values.length <= 1) return values[0];
  let next = values[0];
  while (next.id === currentId) next = randomItem(values);
  return next;
}

function addItemToBackpack(backpack, effect, config) {
  const itemId = effect.itemId;
  const existing = backpack.find(item => item.id === itemId);
  if (existing) {
    existing.quantity += 1;
    return backpack;
  }
  const configured = config.BACKPACK_ITEMS.find(item => item.id === itemId)
    ?? config.INVENTORY.find(item => item.id === itemId)
    ?? { id: itemId, label: effect.itemLabel ?? itemId };
  backpack.push({ id: configured.id, label: configured.label, quantity: 1 });
  return backpack;
}

function generateGender(config) {
  const gender = weightedRandom(config.GENDERS);
  const affix = weightedRandom(config.GENDER_AFFIXES);
  const range = weightedRandom(config.AGES);
  return { genderId: gender.id, affixId: affix.id, age: randInt(range.min, range.max) };
}

function generateBody(config) {
  const heightSettings = config.packSettings.characters.height;
  return {
    bodyTypeId: weightedRandom(config.BODY_TYPES).id,
    height: randInt(heightSettings.min, heightSettings.max),
  };
}

function generateHealth(config, forceHealthy = false) {
  const healthyId = config.HEALTH_STATES[0]?.value.id;
  if (forceHealthy) return { stateId: healthyId, stageId: null };
  const state = weightedRandom(config.HEALTH_STATES);
  return {
    stateId: state.id,
    stageId: state.id === healthyId ? null : weightedRandom(config.HEALTH_STAGES).id,
  };
}

function generateWorseHealth(current, config) {
  const healthyId = config.HEALTH_STATES[0]?.value.id;
  const states = config.HEALTH_STATES.map(entry => entry.value).filter(state => state.id !== healthyId);
  const state = pickDifferent(current?.stateId, states);
  return { stateId: state.id, stageId: weightedRandom(config.HEALTH_STAGES).id };
}

function randomizeAttribute(attribute, target, config) {
  switch (attribute) {
    case 'gender':
      return generateGender(config);
    case 'race':
      return { id: pickDifferent(target.race?.id, config.RACES.map(entry => entry.value)).id };
    case 'body':
      return generateBody(config);
    case 'health':
      return Math.random() < config.packSettings.characters.health_randomize_worse_chance
        ? generateWorseHealth(target.health, config)
        : generateHealth(config);
    case 'hobby': {
      const hobby = pickDifferent(target.hobby?.id, config.HOBBIES);
      return { id: hobby.id, levelId: weightedRandom(config.SKILL_LEVELS).id };
    }
    case 'phobia':
      return { id: pickDifferent(target.phobia?.id, config.PHOBIAS).id };
    case 'inventory':
      return { ...pickDifferent(target.inventory?.id, config.INVENTORY) };
    case 'additional':
      return { id: pickDifferent(target.additional?.id, config.ADDITIONAL_INFO).id };
    default:
      return null;
  }
}

function adjustFoodSupply(room, delta) {
  const supplies = room.config.FOOD_SUPPLIES;
  const idx = Math.max(0, supplies.findIndex(supply => supply.id === room.bunker.food?.id));
  room.bunker.food = supplies[Math.max(0, Math.min(supplies.length - 1, idx + delta))];
}

function getTargetPlayer(room, actor, targetId, allowSelf = false) {
  if (!targetId) return null;
  const target = room.getPlayer(targetId);
  if (!target || !target.is_active) return null;
  if (!allowSelf && target.id === actor.id) return null;
  return target;
}

function getTwoTargets(room, actor, targetId, secondTargetId, allowSelf = false) {
  if (!targetId || !secondTargetId || targetId === secondTargetId) return null;
  const t1 = getTargetPlayer(room, actor, targetId, allowSelf);
  const t2 = getTargetPlayer(room, actor, secondTargetId, allowSelf);
  return t1 && t2 ? [t1, t2] : null;
}

function chooseInspectableAttribute(target) {
  const hidden = Object.entries(target.revealed_attributes)
    .filter(([, revealed]) => !revealed)
    .map(([attr]) => attr);
  return randomItem(hidden.length > 0 ? hidden : Object.keys(ATTRIBUTE_LABELS));
}

function executeEffect(effect, { room, actor, target, target2, config }) {
  switch (effect.type) {
    case 'add_to_backpack':
      actor.backpack = addItemToBackpack(actor.backpack, effect, config);
      return {};

    case 'set_attribute':
      if (effect.value === 'healthy') target[effect.attribute] = generateHealth(config, true);
      else if (effect.value === 'worse') target[effect.attribute] = generateWorseHealth(target[effect.attribute], config);
      return {};

    case 'randomize_attribute':
      target[effect.attribute] = randomizeAttribute(effect.attribute, target, config);
      return {};

    case 'swap_attribute': {
      const tmp = target[effect.attribute];
      target[effect.attribute] = target2[effect.attribute];
      target2[effect.attribute] = tmp;
      return {};
    }

    case 'steal_attribute':
      actor[effect.attribute] = target[effect.attribute];
      target[effect.attribute] = effect.stolenValue
        ? { id: 'stolen', label: effect.stolenValue }
        : null;
      return {};

    case 'strip_attribute':
      target[effect.attribute] = effect.value
        ? { id: 'stripped', label: effect.value }
        : null;
      return {};

    case 'inspect_attribute': {
      const attr = chooseInspectableAttribute(target);
      return { privateMessage: `${target.name}: ${ATTRIBUTE_LABELS[attr] ?? attr} - ${format(attr, target[attr], config)}.` };
    }

    case 'reveal_attribute': {
      const attr = chooseInspectableAttribute(target);
      target.revealed_attributes[attr] = true;
      return {
        revealedLabel: ATTRIBUTE_LABELS[attr] ?? attr,
        revealedValue: format(attr, target[attr], config),
      };
    }

    case 'adjust_food':
      adjustFoodSupply(room, effect.delta);
      return {};

    default:
      return {};
  }
}

function formatMessage(template, vars) {
  return template
    .replace('{actor}', vars.actor ?? '')
    .replace('{target}', vars.target ?? '')
    .replace('{target1}', vars.target1 ?? '')
    .replace('{target2}', vars.target2 ?? '')
    .replace('{attribute_label}', vars.attributeLabel ?? '')
    .replace('{attribute_label_lower}', (vars.attributeLabel ?? '').toLowerCase())
    .replace('{revealed_label}', vars.revealedLabel ?? '')
    .replace('{revealed_value}', vars.revealedValue ?? '');
}

function getDefinition(professionValue, config) {
  return professionValue?.id ? config.PROFESSION_ABILITIES[professionValue.id] ?? null : null;
}

function emptyAbility(used = false) {
  return {
    key: 'unknown_ability',
    title: 'Неизвестная способность',
    description: 'Для этой профессии не настроена способность.',
    targetType: 'none',
    allowSelf: false,
    hasAbility: false,
    used,
  };
}

function getProfessionAbilityInfo(player, viewerId) {
  const canSeeProfession = viewerId === player.id || player.revealed_attributes.profession;
  if (!canSeeProfession) return null;

  const config = player.config;
  if (!config) return emptyAbility(player.profession_ability_used);

  const def = getDefinition(player.profession, config);
  if (!def) return emptyAbility(player.profession_ability_used);

  return {
    key: def.key,
    title: def.title,
    description: def.description,
    targetType: def.targetType,
    allowSelf: def.allowSelf !== false,
    variants: def.variants?.map(v => ({ key: v.key, label: v.label })),
    hasAbility: true,
    used: player.profession_ability_used,
  };
}

function applyProfessionAbility(room, actor, targetId, secondTargetId, variant) {
  const config = room.config;
  const def = getDefinition(actor.profession, config);
  if (!def) return { ok: false, error: 'У этой профессии нет активной способности.' };
  if (actor.profession_ability_used) return { ok: false, error: 'Способность этой профессии уже использована.' };

  const hasVariants = Boolean(def.variants?.length);
  if (hasVariants && !def.variants.some(v => v.key === variant)) {
    return { ok: false, error: 'Нужно выбрать вариант применения способности.' };
  }

  const effect = hasVariants ? def.variants.find(v => v.key === variant).effect : def.effect;
  const allowSelf = def.allowSelf !== false;
  let target = null;
  let target2 = null;

  if (def.targetType === 'other') {
    target = getTargetPlayer(room, actor, targetId, allowSelf);
    if (!target) return { ok: false, error: 'Нужно выбрать другого активного игрока.' };
  } else if (def.targetType === 'pair') {
    const pair = getTwoTargets(room, actor, targetId, secondTargetId, allowSelf);
    if (!pair) return { ok: false, error: 'Нужно выбрать двух разных активных игроков.' };
    [target, target2] = pair;
  }

  const effectResult = executeEffect(effect, { room, actor, target, target2, config });
  const variantDef = def.variants?.find(v => v.key === variant);
  const publicMessage = formatMessage(def.publicMessage, {
    actor: actor.name,
    target: target?.name,
    target1: target?.name,
    target2: target2?.name,
    attributeLabel: ATTRIBUTE_LABELS[variantDef?.key] ?? variantDef?.label,
    revealedLabel: effectResult.revealedLabel,
    revealedValue: effectResult.revealedValue,
  });

  actor.profession_ability_used = true;
  room.touch();

  return { ok: true, publicMessage, privateMessage: effectResult.privateMessage };
}

module.exports = { getProfessionAbilityInfo, applyProfessionAbility };
