const test = require('node:test');
const assert = require('node:assert/strict');

const { FakeAiProvider } = require('../server/ai/aiProvider');
const { OpenAIProvider } = require('../server/ai/openAIProvider');
const { adjudicateEvent } = require('../server/ai/eventAdjudicator');
const { isAiAvailable, providerOptions } = require('../server/ai');

test('AI adjudication accepts a valid structured response', async () => {
  const provider = new FakeAiProvider({ chance_modifier: 12, explanation: 'Подходящий инструмент', result_seed: 'Работа спорилась.' });
  const result = await adjudicateEvent(provider, { situation: 'Обвал' });
  assert.equal(result.chance_modifier, 12);
  assert.equal(provider.requests.length, 1);
});

test('AI adjudication clamps modifiers and falls back on an invalid schema', async () => {
  assert.equal((await adjudicateEvent(new FakeAiProvider({ chance_modifier: 99, explanation: 'x', result_seed: 'y' }), {})).chance_modifier, 20);
  assert.deepEqual(await adjudicateEvent(new FakeAiProvider({ chance_modifier: 5 }), {}), { chance_modifier: 0, explanation: '', result_seed: '' });
});

test('OpenAI provider sends stateless structured request and parses output_text', async () => {
  let captured;
  const client = { responses: { create: async (body) => {
    captured = body;
    return { status: 'completed', output_text: '{"value":7}' };
  } } };
  const provider = new OpenAIProvider({ model: 'test-model', client });
  assert.deepEqual(await provider.generateStructured({ input: 'x', schema: { type: 'object' } }), { value: 7 });
  assert.equal(captured.store, false);
  assert.equal(captured.text.format.type, 'json_schema');
});

test('timeout and malformed JSON use the gameplay fallback', async () => {
  const timeoutClient = { responses: { create: (_body, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }) } };
  const timeoutProvider = new OpenAIProvider({ model: 'test-model', client: timeoutClient, timeoutMs: 5 });
  assert.deepEqual(await adjudicateEvent(timeoutProvider, {}), { chance_modifier: 0, explanation: '', result_seed: '' });
  const malformed = new OpenAIProvider({ model: 'test-model', client: { responses: { create: async () => ({ status: 'completed', output_text: 'nope' }) } } });
  assert.deepEqual(await adjudicateEvent(malformed, {}), { chance_modifier: 0, explanation: '', result_seed: '' });
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
