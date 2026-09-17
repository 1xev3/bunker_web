const { OpenAIProvider } = require('./openAIProvider');

function isAiAvailable(env = process.env) {
  return Boolean(env.OPENAI_API_KEY && env.OPENAI_MODEL);
}

function providerOptions(env = process.env) {
  return {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    baseURL: env.OPENAI_BASE_URL || undefined,
  };
}

let provider;
function getAiProvider() {
  if (!isAiAvailable()) return null;
  provider ??= new OpenAIProvider(providerOptions());
  return provider;
}

module.exports = { isAiAvailable, providerOptions, getAiProvider };
