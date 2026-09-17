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

const CONSEQUENCES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['explanation', 'food_change', 'player_changes'],
  properties: {
    explanation: { type: 'string', maxLength: 400 },
    food_change: { type: 'integer', minimum: -1000, maximum: 1000 },
    player_changes: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['player_id', 'health', 'sanity', 'status_label', 'status_stat', 'status_value', 'status_months'],
        properties: {
          player_id: { type: 'string' },
          health: { type: 'integer', minimum: -100, maximum: 100 },
          sanity: { type: 'integer', minimum: -100, maximum: 100 },
          status_label: { type: 'string', maxLength: 60 },
          status_stat: { type: 'string', enum: ['health', 'sanity'] },
          status_value: { type: 'integer', minimum: -100, maximum: 100 },
          status_months: { type: 'integer', minimum: 0, maximum: 24 },
        },
      },
    },
  },
};

async function determineConsequences(provider, context) {
  const fallback = { effects: null, explanation: '', error: null };
  if (!provider) return fallback;
  try {
    const result = await provider.generateStructured({
      schemaName: 'bunker_event_consequences',
      schema: CONSEQUENCES_SCHEMA,
      maxOutputTokens: 600,
      instructions: 'Определи разумные игровые последствия события и решения игроков. Используй только player_id из входа. health и sanity — разовые изменения, food_change — изменение общего запаса еды. Если нужен временный эффект, заполни status_label, status_stat, status_value и status_months; иначе оставь status_label пустым, status_value и status_months равными 0. Не делай каждое событие катастрофой.',
      input: JSON.stringify(context),
    });
    const validChange = change => change
      && typeof change.player_id === 'string'
      && Number.isInteger(change.health) && Math.abs(change.health) <= 100
      && Number.isInteger(change.sanity) && Math.abs(change.sanity) <= 100
      && typeof change.status_label === 'string'
      && ['health', 'sanity'].includes(change.status_stat)
      && Number.isInteger(change.status_value) && Math.abs(change.status_value) <= 100
      && Number.isInteger(change.status_months) && change.status_months >= 0 && change.status_months <= 24;
    if (!result || typeof result.explanation !== 'string' || !Number.isInteger(result.food_change) || Math.abs(result.food_change) > 1000 || !Array.isArray(result.player_changes) || result.player_changes.length > 12 || !result.player_changes.every(validChange)) {
      return { ...fallback, error: 'Ответ ИИ не соответствует ожидаемой схеме' };
    }
    const playerIds = new Set((context.players ?? []).map(player => player.id));
    const effects = [{ type: 'food_change', value: result.food_change }];
    for (const change of result.player_changes) {
      if (!change || !playerIds.has(change.player_id)) continue;
      if (Number.isInteger(change.health) && change.health !== 0) effects.push({ type: 'health_change', target: change.player_id, value: change.health });
      if (Number.isInteger(change.sanity) && change.sanity !== 0) effects.push({ type: 'sanity_change', target: change.player_id, value: change.sanity });
      if (typeof change.status_label === 'string' && change.status_label.trim() && ['health', 'sanity'].includes(change.status_stat) && Number.isInteger(change.status_value) && Number.isInteger(change.status_months) && change.status_months > 0) {
        effects.push({ type: 'add_status', target: change.player_id, status: { id: `ai_${change.status_label.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_')}`, label: change.status_label.trim(), stat: change.status_stat, value: change.status_value, months: change.status_months } });
      }
    }
    return { effects, explanation: result.explanation, error: null };
  } catch (error) {
    console.error('[ИИ] Ошибка расчёта события:', error);
    return { ...fallback, error: error instanceof Error ? error.message : String(error) };
  }
}

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
    if (!result || !['success', 'failure'].includes(result.outcome) || typeof result.explanation !== 'string' || !result.explanation.trim() || !Array.isArray(result.accepted_resources) || !Array.isArray(result.rejected_resources)) return { ...fallback, error: 'Ответ ИИ не соответствует ожидаемой схеме' };
    const resources = new Set(context.resources ?? []);
    const accepted_resources = result.accepted_resources.filter(resource => resources.has(resource));
    const rejected_resources = result.rejected_resources.filter(resource => resources.has(resource));
    return {
      outcome: result.outcome,
      explanation: [
        accepted_resources.length && `Учтены: ${accepted_resources.join(', ')}.`,
        rejected_resources.length && `Не помогли: ${rejected_resources.join(', ')}.`,
      ].filter(Boolean).join(' ') || 'Выбранные ресурсы оценены.',
      accepted_resources,
      rejected_resources,
      error: null,
    };
  } catch (error) {
    console.error('[ИИ] Ошибка расчёта запасов:', error);
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
    if (!result || !Number.isInteger(result.effectiveness) || result.effectiveness < 0 || result.effectiveness > 100 || typeof result.explanation !== 'string' || !result.explanation.trim()) return { ...fallback, error: 'Ответ ИИ не соответствует ожидаемой схеме' };
    return { effectiveness: result.effectiveness, explanation: result.explanation, error: null };
  } catch (error) {
    return { ...fallback, error: error instanceof Error ? error.message : String(error) };
  }
}

module.exports = { CHANCE_SCHEMA, FOOD_SCHEMA, CONSEQUENCES_SCHEMA, adjudicateEvent, adjudicateFood, determineConsequences };
