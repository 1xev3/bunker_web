const { OpenAIProvider } = require('./openAIProvider');

function isAiAvailable(env = process.env) {
  return Boolean(env.OPENAI_API_KEY && env.OPENAI_MODEL);
}

let provider;
function getAiProvider() {
  if (!isAiAvailable()) return null;
  provider ??= new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL });
  return provider;
}

module.exports = { isAiAvailable, getAiProvider };
