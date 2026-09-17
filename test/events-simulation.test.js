const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../server/game/gameConfig');
const GameRoom = require('../server/game/entities/gameRoom');
const { Player } = require('../server/game/entities/player');
const {
  validateEvent, selectParticipants, buildEffectPrimitives,
  buildSchedulePrimitives, pickOutcome,
} = require('../server/game/config/yamlEvents');
const { validatePack } = require('../server/game/config/loader');

function seeded(seed) {
  return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
}

function roomWithPlayers(count = 6) {
  const players = Array.from({ length: count }, (_, index) => {
    const player = new Player(`Player ${index}`);
    player.generateCharacter(config);
    return player;
  });
  const room = new GameRoom(players[0].id);
  room.players = players;
  room.currentMonth = 4;
  return room;
}

test('Fantasy event references and schemas validate as a pack', () => {
  assert.deepEqual(validatePack('Fantasy').errors, []);
  for (const event of config.EVENTS) assert.deepEqual(validateEvent(event, event.id), []);
});

test('positive and neutral events have visible weight in a seeded distribution', () => {
  const eligible = config.EVENTS.filter(event => !event.scheduled_only && event.weight > 0);
  const total = eligible.reduce((sum, event) => sum + event.weight, 0);
  const calmIds = new Set(config.EVENTS.filter(event => event.__file.endsWith('41_calm_days.yaml')).map(event => event.id));
  const rng = seeded(42);
  let calm = 0;
  for (let i = 0; i < 5000; i++) {
    let cursor = rng() * total;
    const selected = eligible.find(event => (cursor -= event.weight) <= 0) ?? eligible.at(-1);
    if (calmIds.has(selected.id)) calm++;
  }
  assert.ok(calm / 5000 >= 0.15, `calm event share was ${calm / 5000}`);
});

test('seeded full event preparation resolves participants, outcomes, effects and schedules', () => {
  const rng = seeded(7);
  const previousRandom = Math.random;
  Math.random = rng;
  try {
    for (let run = 0; run < 5; run++) {
      const room = roomWithPlayers();
      for (const event of config.EVENTS.filter(item => !item.scheduled_only)) {
        const participants = selectParticipants(event.participants, room, rng);
        if (event.participants && !participants) continue;
        const roleMap = Object.fromEntries(Object.entries(participants ?? {}).map(([role, player]) => [role, player.id]));
        const participantIds = Object.values(roleMap);
        buildEffectPrimitives(event.effects, roleMap, room, participantIds);
        buildSchedulePrimitives(event.schedule, roleMap, room);
        for (const option of event.options ?? []) {
          const outcome = option.outcomes?.length ? pickOutcome(option.outcomes) : null;
          buildEffectPrimitives(outcome?.effects ?? option.effects, roleMap, room, participantIds);
          buildSchedulePrimitives(outcome?.schedule ?? option.schedule, roleMap, room);
        }
      }
    }
  } finally {
    Math.random = previousRandom;
  }
});
