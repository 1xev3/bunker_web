const test = require('node:test');
const assert = require('node:assert/strict');

const { FakeAiProvider } = require('../server/ai/aiProvider');
const { OpenAIProvider } = require('../server/ai/openAIProvider');
const { adjudicateEvent, adjudicateFood } = require('../server/ai/eventAdjudicator');
const { isAiAvailable, providerOptions } = require('../server/ai');

test('AI adjudication accepts a valid structured response', async () => {
  const provider = new FakeAiProvider({ outcome: 'success', explanation: 'Инструмент подошёл' });
  const result = await adjudicateEvent(provider, { situation: 'Обвал' });
  assert.equal(result.outcome, 'success');
  assert.equal(provider.requests.length, 1);
});

test('AI adjudication falls back on an invalid schema', async () => {
  assert.deepEqual(await adjudicateEvent(new FakeAiProvider({ outcome: 'maybe', explanation: 'x' }), {}), { outcome: null, explanation: '' });
});

test('AI determines replenished food', async () => {
  assert.deepEqual(
    await adjudicateFood(new FakeAiProvider({ effectiveness: 75, explanation: 'Охотник добыл провизию' }), {}),
    { effectiveness: 75, explanation: 'Охотник добыл провизию' },
  );
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
  assert.deepEqual(await adjudicateEvent(timeoutProvider, {}), { outcome: null, explanation: '' });
  const malformed = new OpenAIProvider({ model: 'test-model', client: { responses: { create: async () => ({ status: 'completed', output_text: 'nope' }) } } });
  assert.deepEqual(await adjudicateEvent(malformed, {}), { outcome: null, explanation: '' });
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
