const OpenAI = require('openai');
const { AiProvider } = require('./aiProvider');

class OpenAIProvider extends AiProvider {
  constructor({ apiKey, baseURL, model, timeoutMs = 30_000, client } = {}) {
    super();
    if (!client && !apiKey) throw new Error('OPENAI_API_KEY is required');
    if (!model) throw new Error('OPENAI_MODEL is required');
    this.client = client ?? new OpenAI({ apiKey, baseURL, timeout: timeoutMs });
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async generateStructured({ instructions, input, schema, schemaName = 'structured_response', maxOutputTokens = 220 }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'system', content: instructions }, { role: 'user', content: input }],
        max_tokens: Math.max(maxOutputTokens, 512),
        chat_template_kwargs: { enable_thinking: false },
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
      }, { signal: controller.signal });
      const choice = response.choices?.[0];
      if (!choice || choice.finish_reason !== 'stop') {
        throw new Error(`OpenAI completion did not finish (reason: ${choice?.finish_reason ?? 'unknown'})`);
      }
      const parsed = JSON.parse(choice.message?.content ?? '');
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { OpenAIProvider };
