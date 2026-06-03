const { getPlayerAttributeLabel } = require('./playerAttributes');
const { prepareLuaEvent } = require('../game/config/luaEvents');

const EVENT_TEMPLATE_RE = /\{([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
const EVENT_HIGHLIGHT_START = '<<event-highlight>>';
const EVENT_HIGHLIGHT_END = '<</event-highlight>>';

function highlight(value) {
  return `${EVENT_HIGHLIGHT_START}${value}${EVENT_HIGHLIGHT_END}`;
}

function parseDurationMonths(label) {
  if (!label) return 24;
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*(год|года|лет|месяц|месяца|месяцев)/i);
  if (!m) return 24;
  const n = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  if (unit.startsWith('месяц')) return Math.round(n);
  return Math.round(n * 12);
}

function formatParticipantList(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} и ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

// Renders {participants}, {role} and {role.attribute} placeholders against the
// players the Lua Init handler bound to each role.
// resolvedParticipants: [{ role: string, player: Player }]
function renderParticipantText(template, resolvedParticipants) {
  if (typeof template !== 'string') return template;
  const roleMap = new Map(resolvedParticipants.map(rp => [rp.role, rp.player]));

  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (key === 'participants') {
      return highlight(formatParticipantList(resolvedParticipants.map(rp => rp.player.name)));
    }

    const dotIdx = key.indexOf('.');
    if (dotIdx !== -1) {
      const player = roleMap.get(key.slice(0, dotIdx));
      if (player) {
        const label = getPlayerAttributeLabel(player, key.slice(dotIdx + 1));
        if (label != null) return highlight(label);
      }
      return match;
    }

    const player = roleMap.get(key);
    return player ? highlight(player.name) : match;
  });
}

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

// Renders {context.key} placeholders for scheduled events.
function renderContextText(template, context) {
  if (typeof template !== 'string' || !context) return template;
  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (!key.startsWith('context.')) return match;
    const value = context[key.slice(8)];
    if (typeof value !== 'string' && typeof value !== 'number') return match;
    return highlight(value);
  });
}

function materializeScheduledEvent(event, context) {
  if (!context) return { ...event };
  return {
    ...event,
    title: renderContextText(event.title, context),
    description: renderContextText(event.description, context),
    scheduled_context: context,
  };
}

// Events that must never surface from the random pool — only via ctx:Schedule.
function isTriggeredOnly(event) {
  return event.event_type === 'narrative' || event.scheduled_only === true;
}

// Picks a random eligible event whose Lua CanInvoke/Init succeed.
// Returns { event, participants } or null if nothing is eligible.
function pickRandomEvent(config, room) {
  const pool = (Array.isArray(config.EVENTS) ? config.EVENTS : []).filter(e => !isTriggeredOnly(e));

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  for (const candidate of pool) {
    const prepared = prepareLuaEvent(candidate, room);
    if (prepared) return prepared;
  }
  return null;
}

module.exports = {
  parseDurationMonths,
  pickRandomEvent,
  materializeEventParticipants,
  materializeScheduledEvent,
  EVENT_HIGHLIGHT_START,
  EVENT_HIGHLIGHT_END,
};
