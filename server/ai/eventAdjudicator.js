const CHANCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'explanation', 'accepted_resources', 'rejected_resources'],
  properties: {
    outcome: { type: 'string', enum: ['success', 'failure'] },
    explanation: { type: 'string', maxLength: 240 },
    accepted_resources: { type: 'array', items: { type: 'string' } },
    rejected_resources: { type: 'array', items: { type: 'string' } },
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
  const fallback = { outcome: null, explanation: '', accepted_resources: [], rejected_resources: [], error: null };
  if (!provider) return fallback;
  try {
    const result = await provider.generateStructured({
      schemaName: 'bunker_event_adjudication',
      schema: CHANCE_SCHEMA,
      maxOutputTokens: 220,
      instructions: 'Выбери success или failure для одной из готовых игровых веток. Разбери каждый выбранный ресурс: полезные перечисли в accepted_resources, бесполезные — в rejected_resources, используя названия точно из входа. В explanation кратко объясни решение. Не придумывай игровые эффекты и числа.',
      input: JSON.stringify(context),
    });
    if (!result || !['success', 'failure'].includes(result.outcome) || typeof result.explanation !== 'string' || !Array.isArray(result.accepted_resources) || !Array.isArray(result.rejected_resources)) return { ...fallback, error: 'Ответ ИИ не соответствует ожидаемой схеме' };
    const resources = new Set(context.resources ?? []);
    return {
      outcome: result.outcome,
      explanation: result.explanation,
      accepted_resources: result.accepted_resources.filter(resource => resources.has(resource)),
      rejected_resources: result.rejected_resources.filter(resource => resources.has(resource)),
      error: null,
    };
  } catch (error) {
    return { ...fallback, error: error instanceof Error ? error.message : String(error) };
  }
}

async function adjudicateFood(provider, context) {
  const fallback = { effectiveness: null, explanation: '', error: null };
  if (!provider) return fallback;
  try {
    const result = await provider.generateStructured({
      schemaName: 'bunker_food_replenishment',
      schema: FOOD_SCHEMA,
      maxOutputTokens: 220,
      instructions: 'Оцени полезность выбранных предметов и профессий для добычи еды от 0 до 100. Не вычисляй еду в игровых единицах: это сделает игра. В explanation кратко объясни оценку.',
      input: JSON.stringify(context),
    });
    if (!result || !Number.isInteger(result.effectiveness) || result.effectiveness < 0 || result.effectiveness > 100 || typeof result.explanation !== 'string') return { ...fallback, error: 'Ответ ИИ не соответствует ожидаемой схеме' };
    return { effectiveness: result.effectiveness, explanation: result.explanation, error: null };
  } catch (error) {
    return { ...fallback, error: error instanceof Error ? error.message : String(error) };
  }
}

module.exports = { CHANCE_SCHEMA, FOOD_SCHEMA, adjudicateEvent, adjudicateFood };
