const test = require('node:test');
const assert = require('node:assert/strict');

const { FakeAiProvider } = require('../server/ai/aiProvider');
const { OpenAIProvider } = require('../server/ai/openAIProvider');
const { adjudicateEvent, adjudicateFood, determineConsequences } = require('../server/ai/eventAdjudicator');
const { isAiAvailable, providerOptions } = require('../server/ai');
const { generateBunkerTheme } = require('../server/ai/bunkerThemeGenerator');
const Bunker = require('../server/game/entities/bunker');
const { loadPack, getDefaultPackName } = require('../server/game/gameConfig');

test('AI generates a bunker theme from the host topic', async () => {
  const provider = new FakeAiProvider({
    title: 'Восстание машин',
    disaster_description: 'Автономные машины захватили города.',
    bunker_description: 'Старый командный центр скрыт под землёй.',
  });
  const context = { topic: 'мир после восстания роботов', bunker: { size: 'Большой', rooms: 5 } };
  assert.deepEqual(await generateBunkerTheme(provider, context), {
    id: 'ai_generated',
    label: 'Восстание машин',
    description: 'Автономные машины захватили города.',
    bunkerDescription: 'Старый командный центр скрыт под землёй.',
  });
  assert.deepEqual(JSON.parse(provider.requests[0].input), context);
  assert.match(provider.requests[0].instructions, /3–5 atmospheric sentences \(400–700 characters\)/);
  assert.match(provider.requests[0].instructions, /language of the input topic/);

  const bunker = new Bunker();
  bunker.generate(await generateBunkerTheme(provider, context), loadPack(getDefaultPackName()));
  assert.equal(bunker.theme.label, 'Восстание машин');
  assert.equal(bunker.disaster_info, 'Автономные машины захватили города.');
  assert.equal(bunker.bunker_info, 'Старый командный центр скрыт под землёй.');
});

test('AI retries an unfinished bunker description', async () => {
  let attempt = 0;
  const provider = new FakeAiProvider(() => ++attempt === 1
    ? { title: 'Лёд', disaster_description: 'Мир замёрз.', bunker_description: 'Убежище находится в ска' }
    : { title: 'Лёд', disaster_description: 'Мир замёрз.', bunker_description: 'Убежище находится в скале.' });
  const result = await generateBunkerTheme(provider, { topic: 'вечная зима' });
  assert.equal(result.bunkerDescription, 'Убежище находится в скале.');
  assert.equal(provider.requests.length, 2);
});

test('AI adjudication accepts a valid structured response', async () => {
  const provider = new FakeAiProvider({ outcome: 'success', explanation: 'Лом удержал плиту', used_resources: ['Лом'], rejected_resources: [] });
  const result = await adjudicateEvent(provider, { scenario: 'Обвал', selected_resources: ['Лом'] });
  assert.equal(result.outcome, 'success');
  assert.equal(result.explanation, 'Лом удержал плиту');
  assert.equal(provider.requests.length, 1);
});

test('AI adjudication reports an invalid schema', async () => {
  assert.deepEqual(await adjudicateEvent(new FakeAiProvider({ outcome: 'maybe', explanation: 'x' }), {}), { outcome: null, explanation: '', accepted_resources: [], rejected_resources: [], error: 'Ответ ИИ не соответствует ожидаемой схеме' });
  assert.equal((await adjudicateEvent(new FakeAiProvider({ outcome: 'success', explanation: '', used_resources: [], rejected_resources: [] }), {})).error, 'Ответ ИИ не соответствует ожидаемой схеме');
});

test('AI retries once and rejects resources players did not select', async () => {
  let attempt = 0;
  const provider = new FakeAiProvider(() => ++attempt === 1
    ? { outcome: 'success', explanation: 'Сработал фильтр', used_resources: ['Рунный фильтр'], rejected_resources: [] }
    : { outcome: 'success', explanation: 'Кузнец прокалил воду в котле', used_resources: ['Рунный кузнец — Средний'], rejected_resources: ['Мыло'] });
  const result = await adjudicateEvent(provider, { selected_resources: ['Мыло', 'Рунный кузнец — Средний'] });
  assert.deepEqual(result.accepted_resources, ['Рунный кузнец — Средний']);
  assert.equal(provider.requests.length, 2);
});

test('AI determines replenished food', async () => {
  const provider = new FakeAiProvider({ effectiveness: 75, explanation: 'Охотник добыл провизию' });
  assert.deepEqual(
    await adjudicateFood(provider, {}),
    { effectiveness: 75, explanation: 'Охотник добыл провизию', error: null },
  );
  assert.match(provider.requests[0].instructions, /Готовая съедобная еда сама по себе полезна/);
});

test('AI determines event consequences using known player ids only', async () => {
  const provider = new FakeAiProvider({
    explanation: 'Обвал ранил исследователя',
    used_resources: [],
    food_change: -2,
    player_changes: [
      { player_id: 'known', health: -15, sanity: -5, status_label: 'Ушиб', status_stat: 'health', status_value: -2, status_months: 2 },
      { player_id: 'invented', health: -100, sanity: 0, status_label: '', status_stat: 'health', status_value: 0, status_months: 0 },
    ],
  });
  const result = await determineConsequences(provider, { players: [{ id: 'known' }] });
  assert.equal(result.error, null);
  assert.equal(result.effects.filter(effect => effect.target === 'known').length, 3);
  assert.equal(result.effects.some(effect => effect.target === 'invented'), false);
});

test('OpenAI provider sends non-thinking structured chat request', async () => {
  let captured;
  const client = { chat: { completions: { create: async (body) => {
    captured = body;
    return { choices: [{ finish_reason: 'stop', message: { content: '{"value":7}' } }] };
  } } } };
  const provider = new OpenAIProvider({ model: 'test-model', client });
  assert.equal(provider.timeoutMs, 30_000);
  assert.deepEqual(await provider.generateStructured({ input: 'x', schema: { type: 'object' } }), { value: 7 });
  assert.equal(captured.response_format.type, 'json_schema');
  assert.equal(captured.max_tokens, 512);
  assert.equal(captured.chat_template_kwargs.enable_thinking, false);
});

test('timeout and malformed JSON use the gameplay fallback', async () => {
  const timeoutClient = { chat: { completions: { create: (_body, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }) } } };
  const timeoutProvider = new OpenAIProvider({ model: 'test-model', client: timeoutClient, timeoutMs: 5 });
  assert.deepEqual(await adjudicateEvent(timeoutProvider, {}), { outcome: null, explanation: '', accepted_resources: [], rejected_resources: [], error: 'aborted' });
  const malformed = new OpenAIProvider({ model: 'test-model', client: { chat: { completions: { create: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'nope' } }] }) } } } });
  assert.match((await adjudicateEvent(malformed, {})).error, /JSON/);
  const incomplete = new OpenAIProvider({ model: 'test-model', client: { chat: { completions: { create: async () => ({ choices: [{ finish_reason: 'length', message: { content: '' } }] }) } } } });
  assert.match((await adjudicateEvent(incomplete, {})).error, /reason: length/);
});

test('AI capability requires both environment variables', () => {
  assert.equal(isAiAvailable({ OPENAI_API_KEY: 'key', OPENAI_MODEL: 'model' }), true);
  assert.equal(isAiAvailable({ OPENAI_API_KEY: 'key' }), false);
});

test('OpenAI-compatible base URL is forwarded to provider options', () => {
  assert.deepEqual(providerOptions({
    OPENAI_API_KEY: 'gpustack-key',
    OPENAI_MODEL: 'qwen3',
    OPENAI_BASE_URL: 'http://gpustack.local/v1',
  }), {
    apiKey: 'gpustack-key',
    model: 'qwen3',
    baseURL: 'http://gpustack.local/v1',
  });
});
