const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../server/game/gameConfig');
const GameRoom = require('../server/game/entities/gameRoom');
const { Player } = require('../server/game/entities/player');
const { applyProfessionAbility } = require('../server/game/abilities/professionAbilities');
const { validateStructuredConfig } = require('../server/game/config/structuredConfig');

function generatedPlayer(name) {
  const player = new Player(name);
  player.generateCharacter(config);
  return player;
}

for (const [professionId, definition] of Object.entries(config.PROFESSION_ABILITIES)) {
  if (!definition.effect) continue;
  test(`profession contract: ${definition.label}`, () => {
    const actor = generatedPlayer('Actor');
    const first = generatedPlayer('First target');
    const second = generatedPlayer('Second target');
    const room = new GameRoom(actor.id);
    room.players = [actor, first, second];
    actor.profession = { id: professionId, levelId: config.SKILL_LEVELS[0].value.id };
    actor.profession_ability_available = true;

    const result = applyProfessionAbility(room, actor, first.id, second.id);

    assert.equal(result.ok, true, result.error);
    assert.equal(actor.profession_ability_used, true);
    assert.ok(Array.isArray(result.changedAttributes));
    assert.ok(Array.isArray(result.reveals));
    assert.equal(typeof result.publicMessage, 'string');
    assert.ok(result.privateMessage === null || typeof result.privateMessage === 'string');
  });
}

test('profession definitions have one effect and no randomly assigned variants', () => {
  for (const definition of Object.values(config.PROFESSION_ABILITIES)) {
    if (definition.effect) assert.equal(typeof definition.effect.type, 'string');
    assert.equal(definition.variants, undefined);
  }
});

test('professions without an effect remain in character generation without an ability', () => {
  const definition = Object.values(config.PROFESSION_ABILITIES).find(entry => !entry.effect);
  assert.ok(definition);
  const player = generatedPlayer('Ordinary specialist');
  player.profession = { id: definition.id, levelId: config.SKILL_LEVELS[0].value.id };
  player.profession_ability_available = true;
  assert.equal(player.toDict(player.id).profession_ability, null);
});

test('an unavailable profession ability cannot be seen or used', () => {
  const [professionId] = Object.entries(config.PROFESSION_ABILITIES).find(([, definition]) => definition.effect);
  const actor = generatedPlayer('Actor');
  const target = generatedPlayer('Target');
  const room = new GameRoom(actor.id);
  room.players = [actor, target];
  actor.profession = { id: professionId, levelId: config.SKILL_LEVELS[0].value.id };
  actor.profession_ability_available = false;

  assert.equal(actor.toDict(actor.id).profession_ability, null);
  assert.equal(applyProfessionAbility(room, actor, target.id).ok, false);
});

test('unknown profession effects fail pack validation', () => {
  const professionId = Object.keys(config.PROFESSION_ABILITIES)[0];
  const invalid = {
    ...config,
    PROFESSION_ABILITIES: {
      ...config.PROFESSION_ABILITIES,
      [professionId]: {
        ...config.PROFESSION_ABILITIES[professionId],
        effect: { type: 'not_a_real_effect' },
      },
    },
  };
  assert.match(validateStructuredConfig(invalid).join('\n'), /unknown effect/);
});

test('worsening health keeps the disease and stops at its worst stage', () => {
  const actor = generatedPlayer('Alchemist');
  const target = generatedPlayer('Target');
  const room = new GameRoom(actor.id);
  room.players = [actor, target];
  const [alchemistId] = Object.entries(config.PROFESSION_ABILITIES).find(([, definition]) =>
    definition.effect?.type === 'set_attribute'
    && definition.effect.attribute === 'health'
    && definition.effect.value === 'worse'
  );
  actor.profession = { id: alchemistId, levelId: config.SKILL_LEVELS[0].value.id };
  actor.profession_ability_available = true;
  const diseaseId = config.HEALTH_STATES[1].value.id;
  const stages = [...config.HEALTH_STAGES.map(entry => entry.value)]
    .sort((a, b) => a.multiplier - b.multiplier);
  target.health = { stateId: diseaseId, stageId: stages[1].id };

  assert.equal(applyProfessionAbility(room, actor, target.id).ok, true);
  assert.deepEqual(target.health, { stateId: diseaseId, stageId: stages[2].id });

  actor.profession_ability_used = false;
  target.health.stageId = stages.at(-1).id;
  assert.equal(applyProfessionAbility(room, actor, target.id).ok, true);
  assert.deepEqual(target.health, { stateId: diseaseId, stageId: stages.at(-1).id });
});
