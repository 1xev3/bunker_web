const CHANCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chance_modifier', 'explanation', 'result_seed'],
  properties: {
    chance_modifier: { type: 'integer', minimum: -20, maximum: 20 },
    explanation: { type: 'string', maxLength: 240 },
    result_seed: { type: 'string', maxLength: 240 },
  },
};

function clampModifier(value) {
  return Math.max(-20, Math.min(20, Math.round(Number(value) || 0)));
}

async function adjudicateEvent(provider, context) {
  const fallback = { chance_modifier: 0, explanation: '', result_seed: '' };
  if (!provider) return fallback;
  try {
    const result = await provider.generateStructured({
      schemaName: 'bunker_event_adjudication',
      schema: CHANCE_SCHEMA,
      maxOutputTokens: 220,
      instructions: 'Оцени только уместность выбранных ресурсов. Не придумывай эффекты и не изменяй состояние игры.',
      input: JSON.stringify(context),
    });
    if (!result || typeof result.explanation !== 'string' || typeof result.result_seed !== 'string') return fallback;
    return { ...result, chance_modifier: clampModifier(result.chance_modifier) };
  } catch {
    return fallback;
  }
}

module.exports = { CHANCE_SCHEMA, clampModifier, adjudicateEvent };
