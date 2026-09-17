const CHANCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'explanation'],
  properties: {
    outcome: { type: 'string', enum: ['success', 'failure'] },
    explanation: { type: 'string', maxLength: 240 },
  },
};

const FOOD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['effectiveness', 'explanation'],
  properties: {
    effectiveness: { type: 'integer', minimum: 0, maximum: 100 },
    explanation: { type: 'string', maxLength: 240 },
  },
};

async function adjudicateEvent(provider, context) {
  const fallback = { outcome: null, explanation: '' };
  if (!provider) return fallback;
  try {
    const result = await provider.generateStructured({
      schemaName: 'bunker_event_adjudication',
      schema: CHANCE_SCHEMA,
      maxOutputTokens: 220,
      instructions: 'Реши, помогли ли выбранные предметы и профессии в этой ситуации. В explanation кратко объясни, как именно. Не придумывай новые игровые эффекты.',
      input: JSON.stringify(context),
    });
    if (!result || !['success', 'failure'].includes(result.outcome) || typeof result.explanation !== 'string') return fallback;
    return { outcome: result.outcome, explanation: result.explanation };
  } catch {
    return fallback;
  }
}

async function adjudicateFood(provider, context) {
  const fallback = { effectiveness: null, explanation: '' };
  if (!provider) return fallback;
  try {
    const result = await provider.generateStructured({
      schemaName: 'bunker_food_replenishment',
      schema: FOOD_SCHEMA,
      maxOutputTokens: 220,
      instructions: 'Оцени полезность выбранных предметов и профессий для добычи еды от 0 до 100. Не вычисляй еду в игровых единицах: это сделает игра. В explanation кратко объясни оценку.',
      input: JSON.stringify(context),
    });
    if (!result || !Number.isInteger(result.effectiveness) || result.effectiveness < 0 || result.effectiveness > 100 || typeof result.explanation !== 'string') return fallback;
    return { effectiveness: result.effectiveness, explanation: result.explanation };
  } catch {
    return fallback;
  }
}

module.exports = { CHANCE_SCHEMA, FOOD_SCHEMA, adjudicateEvent, adjudicateFood };
