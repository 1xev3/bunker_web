const { evaluateFilter, getPlayerAttributeLabel } = require('./eventFilterEngine');

const EVENT_TEMPLATE_RE = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
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

// resolvedParticipants: [{ role: string, player: Player }]
function renderParticipantText(template, resolvedParticipants) {
  if (typeof template !== 'string') return template;
  const roleMap = new Map(resolvedParticipants.map(rp => [rp.role, rp.player]));

  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (key === 'participants') {
      const names = resolvedParticipants.map(rp => rp.player.name);
      return `${EVENT_HIGHLIGHT_START}${formatParticipantList(names)}${EVENT_HIGHLIGHT_END}`;
    }

    // {role.attribute} — attribute access
    const dotIdx = key.indexOf('.');
    if (dotIdx !== -1) {
      const role = key.slice(0, dotIdx);
      const attr = key.slice(dotIdx + 1);
      const player = roleMap.get(role);
      if (player) {
        const label = getPlayerAttributeLabel(player, attr);
        if (label != null) return `${EVENT_HIGHLIGHT_START}${label}${EVENT_HIGHLIGHT_END}`;
      }
      return match;
    }

    // {role} — player name by role (includes participant1, participant2, etc. for legacy templates)
    const player = roleMap.get(key);
    if (player) return `${EVENT_HIGHLIGHT_START}${player.name}${EVENT_HIGHLIGHT_END}`;

    return match;
  });
}

// Returns [{ role: string, player: Player }]
function materializeEventParticipants(event, resolvedParticipants) {
  return {
    ...event,
    title: renderParticipantText(event.title, resolvedParticipants),
    description: renderParticipantText(event.description, resolvedParticipants),
    participants: resolvedParticipants.map(rp => rp.player.name),
    participant_ids: resolvedParticipants.map(rp => rp.player.id),
    participant_roles: Object.fromEntries(resolvedParticipants.map(rp => [rp.role, rp.player.id])),
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

// Resolves participants from event.participants slot array.
// Returns [{ role, player }] or null if any required slot has no match.
function resolveParticipantSlots(slots, activePlayers, scriptedFilters) {
  const result = [];
  const assignedIds = new Set();

  for (const slot of slots) {
    const filter = slot.filter ?? null;
    const optional = slot.optional === true;

    const candidates = activePlayers.filter(p => {
      if (assignedIds.has(p.id)) return false;
      if (!filter) return true;
      return evaluateFilter(filter, p, scriptedFilters);
    });

    if (candidates.length === 0) {
      if (optional) continue;
      return null;
    }

    const player = candidates[Math.floor(Math.random() * candidates.length)];
    const role = typeof slot.role === 'string' && slot.role.trim() !== ''
      ? slot.role
      : `participant${result.length + 1}`;

    assignedIds.add(player.id);
    result.push({ role, player });
  }

  return result;
}

// Returns [{ role: string, player: Player }]
function resolveEventParticipants(event, activePlayers, scriptedFilters) {
  if (activePlayers.length === 0) return [];

  // New slot-based system
  if (Array.isArray(event.participants) && event.participants.length > 0) {
    return resolveParticipantSlots(event.participants, activePlayers, scriptedFilters) ?? [];
  }

  // Legacy: participants_template
  const template = event.participants_template;
  if (!template) return [];

  const hasConfiguredMin = Number.isInteger(event.participants_min);
  const defaultMin = template === 'random_group' ? Math.min(2, activePlayers.length) : 1;
  const minParticipants = Math.max(1, hasConfiguredMin ? event.participants_min : defaultMin);
  const maxParticipants = Math.max(minParticipants, Number.isInteger(event.participants_max) ? event.participants_max : activePlayers.length);

  if (hasConfiguredMin && activePlayers.length < minParticipants) return [];

  const toResolved = (players) => players.map((p, i) => ({ role: `participant${i + 1}`, player: p }));

  if (template === 'couple') {
    const pairs = [];
    for (let i = 0; i < activePlayers.length; i++) {
      for (let j = i + 1; j < activePlayers.length; j++) {
        if (canBeCouple(activePlayers[i], activePlayers[j])) pairs.push([activePlayers[i], activePlayers[j]]);
      }
    }
    if (pairs.length === 0) return [];
    const pair = pairs[Math.floor(Math.random() * pairs.length)];
    return toResolved(pair);
  }

  if (template === 'random_one') {
    if (minParticipants > 1) return [];
    return toResolved([activePlayers[Math.floor(Math.random() * activePlayers.length)]]);
  }

  if (template === 'random_group') {
    const maxCount = Math.min(activePlayers.length, maxParticipants);
    const count = minParticipants + Math.floor(Math.random() * (maxCount - minParticipants + 1));
    const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
    return toResolved(shuffled.slice(0, count));
  }

  return [];
}

function collectAllEffects(event) {
  const effects = [];
  for (const key of ['success_effect', 'failure_effect', 'success_effects', 'failure_effects']) {
    const val = event[key];
    if (Array.isArray(val)) effects.push(...val);
    else if (val) effects.push(val);
  }
  return effects;
}

function collectScheduledEventIds(events) {
  const ids = new Set();
  function walk(effects) {
    for (const e of effects) {
      if (!e) continue;
      if (e.type === 'schedule_event' && typeof e.event_id === 'string') ids.add(e.event_id);
      if (e.type === 'if') {
        walk(e.then ?? []);
        walk(e.else ?? []);
      }
    }
  }
  for (const event of events) walk(collectAllEffects(event));
  return ids;
}

function isTriggeredOnly(event) {
  // Only exclude events explicitly designed to be chain/schedule targets
  return event.event_type === 'narrative' || event.event_type === 'passive';
}

function weightedRandom(items, getWeight) {
  const total = items.reduce((sum, item) => sum + getWeight(item), 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= getWeight(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// Picks a random eligible event whose participants can be resolved.
// Tries events in weighted-random order until one works.
// Returns { event (materialized), participants } or null if none found.
function pickRandomEvent(config, activePlayers, scriptedFilters) {
  const events = Array.isArray(config.EVENTS) ? config.EVENTS : [];

  const excludedIds = new Set([
    ...events.flatMap(e => [e.chain_success, e.chain_failure].filter(id => typeof id === 'string')),
    ...collectScheduledEventIds(events),
  ]);

  const pool = events.filter(e => !excludedIds.has(e.id) && !isTriggeredOnly(e));
  const source = pool.length > 0 ? pool : events.filter(e => !isTriggeredOnly(e));
  if (source.length === 0) return null;

  const getWeight = e => (typeof e.weight === 'number' && e.weight > 0 ? e.weight : 1);

  // If no players passed, just pick weighted random (legacy call)
  if (!activePlayers) {
    return { event: materializeEvent(weightedRandom(source, getWeight)), participants: [] };
  }

  // Shuffle pool in weighted-random order, try each until participants resolve
  const remaining = [...source];
  while (remaining.length > 0) {
    const picked = weightedRandom(remaining, getWeight);
    remaining.splice(remaining.indexOf(picked), 1);

    const materialized = materializeEvent(picked);
    const participants = resolveEventParticipants(materialized, activePlayers, scriptedFilters);

    if (!picked.participants && !picked.participants_template) {
      return { event: materialized, participants };
    }
    if (participants.length > 0) {
      return { event: materialized, participants };
    }
    // participants failed — try next event
  }

  return null;
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
