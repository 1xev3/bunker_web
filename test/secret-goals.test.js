const test = require('node:test');
const assert = require('node:assert/strict');

const GameRoom = require('../server/game/entities/gameRoom');

test('secret goals resolve inline alternatives when assigned', () => {
  const room = new GameRoom('admin');
  room.config.secretGoals = { count: 1, percent: null, goals: ['Доказывай, что {женщин|мужчин} не стоит брать.'] };
  room.players = [{ secret_goal: null }];

  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    room.assignSecretGoals();
  } finally {
    Math.random = originalRandom;
  }

  assert.equal(room.players[0].secret_goal, 'Доказывай, что женщин не стоит брать.');
});
