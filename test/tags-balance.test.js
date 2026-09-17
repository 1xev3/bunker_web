const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../server/game/gameConfig');
const { Player } = require('../server/game/entities/player');
const { normalizeConfig } = require('../server/game/config/structuredConfig');
const { startingVitalHealth } = require('../server/game/bunkerLife/bunkerEffects');

test('grouped People sections retain their normalized categories', () => {
  const normalized = normalizeConfig({
    BODY_TYPES: { physical_risk: [['Хрупкое', 2]] },
    TRAITS: { social_risk: ['Конфликтный'] },
    PHOBIAS: { mental_risk: ['Темноты'] },
    ADDITIONAL_INFO: { survival_bonus: ['Разводит огонь'] },
  });
  assert.deepEqual(normalized.BODY_TYPES[0].value.groups, ['physical_risk']);
  assert.deepEqual(normalized.TRAITS[0].groups, ['social_risk']);
  assert.deepEqual(normalized.PHOBIAS[0].groups, ['mental_risk']);
  assert.deepEqual(normalized.ADDITIONAL_INFO[0].groups, ['survival_bonus']);
});

test('seeded balance sample keeps starting health bounded', () => {
  let state = 123456789;
  const rng = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
  const healthValues = [];
  for (let i = 0; i < 500; i++) {
    const player = new Player(`P${i}`);
    player.generateCharacter(config);
    const stateEntry = config.HEALTH_STATES[Math.floor(rng() * config.HEALTH_STATES.length)].value;
    const stageEntry = config.HEALTH_STAGES[Math.floor(rng() * config.HEALTH_STAGES.length)].value;
    player.health = { stateId: stateEntry.id, stageId: stateEntry.severity ? stageEntry.id : null };
    healthValues.push(startingVitalHealth(player, config));
  }
  assert.ok(Math.min(...healthValues) >= 15);
  assert.ok(healthValues.reduce((a, b) => a + b, 0) / healthValues.length > 55);
});
