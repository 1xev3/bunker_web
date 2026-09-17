const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../server/game/gameConfig');
const { Player } = require('../server/game/entities/player');

test('race modifiers affect generated age and height', () => {
  const testConfig = {
    ...config,
    RACES: [{ value: { id: 'test_race', label: 'Test', age_multiplier: 3, height_offset: 25 }, weight: 1 }],
    AGES: [{ value: { min: 20, max: 20 }, weight: 1 }],
    GENDERS: [{ value: { id: 'gender_1', label: 'Test' }, weight: 1 }],
    packSettings: {
      ...config.packSettings,
      characters: {
        ...config.packSettings.characters,
        height: {
          ...config.packSettings.characters.height,
          min: 0,
          max: 300,
          age_curves: [{ max_age: null, mean: 170, std: 0 }],
        },
      },
    },
  };

  const player = new Player('Test');
  player.generateCharacter(testConfig);

  assert.equal(player.gender.age, 60);
  assert.equal(player.body.height, 195);
});
