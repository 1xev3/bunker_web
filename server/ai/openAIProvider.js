const OpenAI = require('openai');
const { AiProvider } = require('./aiProvider');

class OpenAIProvider extends AiProvider {
  constructor({ apiKey, model, timeoutMs = 10_000, client } = {}) {
    super();
    if (!client && !apiKey) throw new Error('OPENAI_API_KEY is required');
    if (!model) throw new Error('OPENAI_MODEL is required');
    this.client = client ?? new OpenAI({ apiKey, timeout: timeoutMs });
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async generateStructured({ instructions, input, schema, schemaName = 'structured_response', maxOutputTokens = 220 }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions,
        input,
        store: false,
        max_output_tokens: maxOutputTokens,
        text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
      }, { signal: controller.signal });
      if (response.status && response.status !== 'completed') throw new Error(`OpenAI response status: ${response.status}`);
      const parsed = JSON.parse(response.output_text);
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { OpenAIProvider };
