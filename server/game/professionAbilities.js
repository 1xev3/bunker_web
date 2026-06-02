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

// ─── Generators ───────────────────────────────────────────────────────────────

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomWeightedValue(table) {
  const total = table.reduce((sum, [, w]) => sum + w, 0);
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

function pickDifferent(current, values) {
  if (values.length <= 1) return values[0];
  let next = current;
  while (next === current) next = randomItem(values);
  return next;
}

function addItemToBackpack(backpackValue, item) {
  if (!backpackValue) return item;
  if (backpackValue.split(', ').includes(item)) return backpackValue;
  return `${backpackValue}, ${item}`;
}

function generateGender(config) {
  const gender = randomWeightedValue(config.GENDERS);
  const affix = randomWeightedValue(config.GENDER_AFFIXES);
  const [min, max] = randomWeightedValue(config.AGES);
  return `${gender} ${affix} (${randomInt(min, max)} лет)`;
}

function generateRace(config) {
  return randomWeightedValue(config.RACES);
}

function generateBody(config) {
  return `${randomWeightedValue(config.BODY_TYPES)} (${randomInt(150, 210)} см)`;
}

function generateHealth(config, forceHealthy = false) {
  if (forceHealthy) return 'Здоров';
  const state = randomWeightedValue(config.HEALTH_STATES);
  if (state === 'Здоров') return 'Здоров';
  return `${state} (${randomWeightedValue(config.HEALTH_STAGES)})`;
}

function generateWorseHealth(current, config) {
  const candidates = [];
  for (const [state] of config.HEALTH_STATES) {
    if (state === 'Здоров') continue;
    for (const [stage] of config.HEALTH_STAGES) candidates.push(`${state} (${stage})`);
  }
  return pickDifferent(current, candidates);
}

function randomizeAttribute(attribute, target, config) {
  switch (attribute) {
    case 'gender':     return generateGender(config);
    case 'race':       return generateRace(config);
    case 'body':       return generateBody(config);
    case 'health':     return pickDifferent(target.health, [generateHealth(config), generateWorseHealth(target.health, config)]);
    case 'hobby':      return pickDifferent(target.hobby, config.HOBBIES.map(h => `${h} (${randomWeightedValue(config.SKILL_LEVELS)})`));
    case 'phobia':     return pickDifferent(target.phobia, config.PHOBIAS.map(p => `Страх ${p}`));
    case 'inventory':  return pickDifferent(target.inventory, config.INVENTORY);
    case 'additional': return pickDifferent(target.additional, config.ADDITIONAL_INFO);
    default:           return null;
  }
}

// ─── Targeting helpers ────────────────────────────────────────────────────────

function adjustFoodSupply(room, delta) {
  const supplies = room.config.FOOD_SUPPLIES;
  const idx = Math.max(0, supplies.indexOf(room.bunker.food));
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

// ─── Effect executor ──────────────────────────────────────────────────────────

function executeEffect(effect, { room, actor, target, target2, config }) {
  switch (effect.type) {
    case 'add_to_backpack':
      actor.backpack = addItemToBackpack(actor.backpack, effect.item);
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
      target[effect.attribute] = effect.stolenValue ?? 'Украден';
      return {};

    case 'strip_attribute':
      target[effect.attribute] = effect.value ?? 'Потерян';
      return {};

    case 'inspect_attribute': {
      const attr = chooseInspectableAttribute(target);
      return { privateMessage: `${target.name}: ${ATTRIBUTE_LABELS[attr] ?? attr} — ${target[attr]}.` };
    }

    case 'reveal_attribute': {
      const attr = chooseInspectableAttribute(target);
      target.revealed_attributes[attr] = true;
      return { revealedLabel: ATTRIBUTE_LABELS[attr] ?? attr, revealedValue: target[attr] };
    }

    case 'adjust_food':
      adjustFoodSupply(room, effect.delta);
      return {};

    default:
      return {};
  }
}

// ─── Message formatting ───────────────────────────────────────────────────────

function formatMessage(template, vars) {
  return template
    .replace('{actor}',                vars.actor ?? '')
    .replace('{target}',               vars.target ?? '')
    .replace('{target1}',              vars.target1 ?? '')
    .replace('{target2}',              vars.target2 ?? '')
    .replace('{attribute_label}',      vars.attributeLabel ?? '')
    .replace('{attribute_label_lower}', (vars.attributeLabel ?? '').toLowerCase())
    .replace('{revealed_label}',       vars.revealedLabel ?? '')
    .replace('{revealed_value}',       vars.revealedValue ?? '');
}

// ─── Definition lookup ────────────────────────────────────────────────────────

function getProfessionBaseName(professionValue) {
  if (!professionValue) return '';
  const i = professionValue.indexOf(' (');
  return i === -1 ? professionValue : professionValue.slice(0, i);
}

function getDefinition(professionValue, config) {
  return config.PROFESSION_ABILITIES[getProfessionBaseName(professionValue)] ?? null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

function getProfessionAbilityInfo(player, viewerId) {
  const canSeeProfession = viewerId === player.id || player.revealed_attributes.profession;
  if (!canSeeProfession) return null;

  const config = player.config;
  if (!config) {
    return {
      key: 'unknown_ability',
      title: 'Неизвестная способность',
      description: 'Для этой профессии не настроена способность.',
      targetType: 'none',
      allowSelf: false,
      hasAbility: false,
      used: false,
    };
  }

  const def = getDefinition(player.profession, config);
  if (def) {
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

  return {
    key: 'unknown_ability',
    title: 'Неизвестная способность',
    description: 'Для этой профессии не настроена способность.',
    targetType: 'none',
    allowSelf: false,
    hasAbility: false,
    used: false,
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

  const effect = hasVariants
    ? def.variants.find(v => v.key === variant).effect
    : def.effect;

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
