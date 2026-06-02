const EVENT_TEMPLATE_RE = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
const EVENT_PARTICIPANT_TEMPLATE_RE = /^participant(\d+)$/;
const EVENT_HIGHLIGHT_START = '<<event-highlight>>';
const EVENT_HIGHLIGHT_END = '<</event-highlight>>';

function parseDurationMonths(label) {
  if (!label) return 24;
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*(год|года|лет|месяц|месяца|месяцев)/i);
  if (!m) return 24;
  const n = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  if (unit.startsWith('месяц')) return Math.round(n);
  return Math.round(n * 12);
}

function pickRandomValue(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function pickEventTextValue(value) {
  return Array.isArray(value) ? pickRandomValue(value) : value;
}

function resolveEventTemplateValue(context, key, cache) {
  if (cache.has(key)) return cache.get(key);
  const isAltKey = key.startsWith('alt.');
  const sourceKey = isAltKey ? key.slice(4) : key;
  const source = isAltKey ? context.alt : context.event;
  if (!source || !(sourceKey in source)) return undefined;
  const rawValue = source[sourceKey];
  const resolvedValue = Array.isArray(rawValue) ? pickRandomValue(rawValue) : rawValue;
  cache.set(key, resolvedValue);
  return resolvedValue;
}

function renderEventText(template, context, cache) {
  if (typeof template !== 'string') return template;
  return template.replace(EVENT_TEMPLATE_RE, (_, key) => {
    const value = resolveEventTemplateValue(context, key, cache);
    if (typeof value !== 'string') return `{${key}}`;
    return `${EVENT_HIGHLIGHT_START}${value}${EVENT_HIGHLIGHT_END}`;
  });
}

function resolveEventText(sourceValue, context, cache) {
  return renderEventText(pickEventTextValue(sourceValue), context, cache);
}

function inferEventType(event) {
  if (event.event_type) return event.event_type;
  if (event.choice_labels) return 'interactive';
  return event.base_chance == null ? 'passive' : 'interactive';
}

function materializeEvent(event) {
  const altText = Array.isArray(event.alt) && event.alt.length > 0
    ? pickRandomValue(event.alt)
    : null;
  const context = { event, alt: altText };
  const cache = new Map();
  return {
    ...event,
    event_type: inferEventType(event),
    title: resolveEventText(event.title, context, cache),
    description: resolveEventText(event.description, context, cache),
  };
}

function formatParticipantList(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

function renderParticipantText(template, participants) {
  if (typeof template !== 'string') return template;
  const names = participants.map(player => player.name);
  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (key === 'participants') {
      return `${EVENT_HIGHLIGHT_START}${formatParticipantList(names)}${EVENT_HIGHLIGHT_END}`;
    }
    const participantMatch = key.match(EVENT_PARTICIPANT_TEMPLATE_RE);
    if (!participantMatch) return match;
    const index = Number.parseInt(participantMatch[1], 10) - 1;
    return names[index] ? `${EVENT_HIGHLIGHT_START}${names[index]}${EVENT_HIGHLIGHT_END}` : match;
  });
}

function materializeEventParticipants(event, participants) {
  return {
    ...event,
    title: renderParticipantText(event.title, participants),
    description: renderParticipantText(event.description, participants),
    participants: participants.map(player => player.name),
    participant_ids: participants.map(player => player.id),
  };
}

function renderContextText(template, context) {
  if (typeof template !== 'string' || !context) return template;
  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (!key.startsWith('context.')) return match;
    const contextKey = key.slice(8);
    const value = context[contextKey];
    if (typeof value !== 'string' && typeof value !== 'number') return match;
    return `${EVENT_HIGHLIGHT_START}${value}${EVENT_HIGHLIGHT_END}`;
  });
}

function materializeScheduledEvent(event, context) {
  const base = materializeEvent(event);
  if (!context) return base;
  return {
    ...base,
    title: renderContextText(base.title, context),
    description: renderContextText(base.description, context),
    scheduled_context: context,
  };
}

function canBeCouple(p1, p2) {
  const config = p1.config ?? p2.config;
  const affix1 = config?.GENDER_AFFIXES.find(entry => entry.value.id === p1.gender?.affixId)?.value;
  const affix2 = config?.GENDER_AFFIXES.find(entry => entry.value.id === p2.gender?.affixId)?.value;
  if (!affix1 || !affix2) return true;
  if (affix1.attraction === 'none' || affix2.attraction === 'none') return false;
  if (affix1.attraction === 'any' || affix2.attraction === 'any') return true;
  const sameGender = p1.gender?.genderId === p2.gender?.genderId;
  const compatible = (affix) => {
    if (affix.attraction === 'same') return sameGender;
    if (affix.attraction === 'opposite') return !sameGender;
    return true;
  };
  return compatible(affix1) && compatible(affix2);
}

function getGenderLabel(player) {
  return player?.config?.GENDERS.find(entry => entry.value.id === player.gender?.genderId)?.value?.label ?? null;
}

function orderCoupleParticipants(event, pair) {
  if (!Array.isArray(pair) || pair.length !== 2) return pair;
  if (event?.id !== 'coitus') return pair;

  const [first, second] = pair;
  const firstGender = getGenderLabel(first);
  const secondGender = getGenderLabel(second);

  if (firstGender === 'Мужчина' && secondGender === 'Женщина') return pair;
  if (firstGender === 'Женщина' && secondGender === 'Мужчина') return [second, first];
  return pair;
}

function resolveEventParticipants(event, activePlayers) {
  const template = event.participants_template;
  if (!template || activePlayers.length === 0) return [];
  const hasConfiguredMin = Number.isInteger(event.participants_min);
  const defaultMin = template === 'random_group' ? Math.min(2, activePlayers.length) : 1;
  const minParticipants = Math.max(1, hasConfiguredMin ? event.participants_min : defaultMin);
  const maxParticipants = Math.max(minParticipants, Number.isInteger(event.participants_max) ? event.participants_max : activePlayers.length);

  if (hasConfiguredMin && activePlayers.length < minParticipants) return [];

  if (template === 'couple') {
    const pairs = [];
    for (let i = 0; i < activePlayers.length; i++) {
      for (let j = i + 1; j < activePlayers.length; j++) {
        if (canBeCouple(activePlayers[i], activePlayers[j])) pairs.push([activePlayers[i], activePlayers[j]]);
      }
    }
    if (pairs.length === 0) return [];
    return orderCoupleParticipants(event, pairs[Math.floor(Math.random() * pairs.length)]);
  }

  if (template === 'random_one') {
    if (minParticipants > 1) return [];
    return [activePlayers[Math.floor(Math.random() * activePlayers.length)]];
  }

  if (template === 'random_group') {
    const maxCount = Math.min(activePlayers.length, maxParticipants);
    const count = minParticipants + Math.floor(Math.random() * (maxCount - minParticipants + 1));
    const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  return [];
}

function pickRandomEvent(config) {
  const events = Array.isArray(config.EVENTS) ? config.EVENTS : [];
  const chainedEventIds = new Set(
    events.flatMap(event => [event.chain_success, event.chain_failure].filter(id => typeof id === 'string'))
  );
  const randomPool = events.filter(event => !chainedEventIds.has(event.id));
  const pool = randomPool.length > 0 ? randomPool : events;
  return materializeEvent(pool[Math.floor(Math.random() * pool.length)]);
}

module.exports = {
  parseDurationMonths,
  pickRandomEvent,
  materializeEvent,
  materializeEventParticipants,
  materializeScheduledEvent,
  resolveEventParticipants,
  EVENT_HIGHLIGHT_START,
  EVENT_HIGHLIGHT_END,
};
