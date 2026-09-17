const THEME_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'disaster_description', 'bunker_description'],
  properties: {
    title: { type: 'string', maxLength: 80 },
    disaster_description: { type: 'string', maxLength: 1200 },
    bunker_description: { type: 'string', maxLength: 1000 },
  },
};

async function generateBunkerTheme(provider, context) {
  const request = {
    schemaName: 'bunker_theme',
    schema: THEME_SCHEMA,
    maxOutputTokens: 1000,
    instructions: 'Create a dark, tense, and dramatic theme for the Bunker board game based on the user request. Detect the language of the input topic and write the title and both descriptions entirely in that same language. title is a short name for the disaster. disaster_description must contain 3–5 atmospheric sentences (400–700 characters) describing what happened to the world, the immediate outside threats, and the cost of failure for the survivors. bunker_description must contain 3–5 atmospheric sentences (400–700 characters) describing the shelter, its advantages, and its alarming limitations. Build danger through concrete details, but avoid melodrama, repetition, and excessive cruelty. Strictly honor the provided size, room count, habitation duration, food, and items; do not contradict them or invent other bunker characteristics. End each description with a complete sentence and do not mention game mechanics.',
    input: JSON.stringify(context),
  };
  let result;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = await provider.generateStructured(attempt === 0 ? request : {
      ...request,
      instructions: `${request.instructions} The previous response was incomplete. Rewrite both descriptions in full and make sure each ends with a complete sentence.`,
    });
    const texts = [result?.disaster_description, result?.bunker_description];
    if (typeof result?.title === 'string' && result.title.trim() && texts.every(value => typeof value === 'string' && /[.!?…»)]$/.test(value.trim()))) break;
  }
  if (typeof result?.title !== 'string' || !result.title.trim() || ![result?.disaster_description, result?.bunker_description].every(value => typeof value === 'string' && /[.!?…»)]$/.test(value.trim()))) {
    throw new Error('Ответ ИИ не соответствует ожидаемой схеме');
  }
  return {
    id: 'ai_generated',
    label: result.title.trim(),
    description: result.disaster_description.trim(),
    bunkerDescription: result.bunker_description.trim(),
  };
}

module.exports = { THEME_SCHEMA, generateBunkerTheme };
