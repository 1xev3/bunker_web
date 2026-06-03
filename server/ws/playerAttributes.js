// Resolves a player's attribute to a human-readable label, used for {role.attribute}
// placeholders in event text. Filtering itself lives in Lua (event Init handlers).

function getAttrLabel(player, attribute) {
  const config = player?.config;
  if (!config) return null;

  switch (attribute) {
    case 'profession': {
      const id = player.profession?.id;
      return (id ? config.PROFESSION_ABILITIES?.[id]?.label : null) ?? id ?? null;
    }
    case 'profession_level': {
      const levelId = player.profession?.levelId;
      return config.SKILL_LEVELS?.find(e => e.value.id === levelId)?.value?.label ?? null;
    }
    case 'health': {
      const stateId = player.health?.stateId;
      return config.HEALTH_STATES?.find(e => e.value.id === stateId)?.value?.label ?? stateId ?? null;
    }
    case 'gender': {
      const genderId = player.gender?.genderId;
      return config.GENDERS?.find(e => e.value.id === genderId)?.value?.label ?? genderId ?? null;
    }
    case 'hobby': {
      const id = player.hobby?.id;
      return config.HOBBIES?.find(e => e.id === id)?.label ?? id ?? null;
    }
    case 'hobby_level': {
      const levelId = player.hobby?.levelId;
      return config.SKILL_LEVELS?.find(e => e.value.id === levelId)?.value?.label ?? null;
    }
    case 'phobia': {
      const id = player.phobia?.id;
      return config.PHOBIAS?.find(e => e.id === id)?.label ?? id ?? null;
    }
    case 'trait': {
      const id = player.trait?.id;
      return config.TRAITS?.find(e => e.id === id)?.label ?? id ?? null;
    }
    case 'race': {
      const id = player.race?.id;
      return config.RACES?.find(e => e.value.id === id)?.value?.label ?? id ?? null;
    }
    case 'body': {
      const id = player.body?.bodyTypeId;
      return config.BODY_TYPES?.find(e => e.value.id === id)?.value?.label ?? id ?? null;
    }
    case 'age':
      return player.gender?.age != null ? String(player.gender.age) : null;
    case 'name':
      return player.name ?? null;
    default:
      return null;
  }
}

module.exports = { getPlayerAttributeLabel: getAttrLabel };
