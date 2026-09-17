const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../server/game/gameConfig');
const GameRoom = require('../server/game/entities/gameRoom');
const { Player } = require('../server/game/entities/player');
const { normalizeConfig } = require('../server/game/config/structuredConfig');
const { selectParticipants } = require('../server/game/config/yamlEvents');
const { getPlayerTags } = require('../server/game/config/playerAttributes');
const { startingVitalHealth } = require('../server/game/bunkerLife/bunkerEffects');

function taggedPlayer(name, traitLabel) {
  const player = new Player(name);
  player.generateCharacter(config);
  player.trait = { id: config.TRAITS.find(item => item.label === traitLabel).id };
  player.phobia = { id: config.PHOBIAS.find(item => !(item.groups ?? []).length).id };
  player.additional = { id: config.ADDITIONAL_INFO.find(item => !(item.groups ?? []).length).id };
  player.body = { ...player.body, bodyTypeId: config.BODY_TYPES.find(item => item.value.groups?.includes('neutral')).value.id };
  player.health = { stateId: config.HEALTH_STATES[0].value.id, stageId: null };
  return player;
}

test('grouped People sections add their group once as a normalized tag', () => {
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

test('tag and tag_not participant filters use all character attributes', () => {
  const risky = taggedPlayer('Risky', 'Агрессивный');
  const calm = taggedPlayer('Calm', 'Спокойный');
  const room = new GameRoom(risky.id);
  room.players = [risky, calm];
  const picked = selectParticipants({ risk: { tag: 'social_risk' }, safe: { tag_not: 'social_risk' } }, room, () => 0);
  assert.equal(picked.risk.id, risky.id);
  assert.equal(picked.safe.id, calm.id);
  assert.ok(getPlayerTags(risky).has('social_risk'));
});

test('seeded balance sample keeps starting health bounded and reports risk tags', () => {
  let state = 123456789;
  const rng = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
  const healthValues = [];
  const tagCounts = new Map();
  for (let i = 0; i < 500; i++) {
    const player = new Player(`P${i}`);
    player.generateCharacter(config);
    const stateEntry = config.HEALTH_STATES[Math.floor(rng() * config.HEALTH_STATES.length)].value;
    const stageEntry = config.HEALTH_STAGES[Math.floor(rng() * config.HEALTH_STAGES.length)].value;
    player.health = { stateId: stateEntry.id, stageId: stateEntry.severity ? stageEntry.id : null };
    healthValues.push(startingVitalHealth(player, config));
    for (const tag of getPlayerTags(player)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  assert.ok(Math.min(...healthValues) >= 15);
  assert.ok(healthValues.reduce((a, b) => a + b, 0) / healthValues.length > 55);
  assert.ok([...tagCounts.keys()].some(tag => tag.endsWith('_risk')));
});
