const { getPlayerAttributeLabel } = require('../game/config/playerAttributes');
const { matchesWhen, selectParticipants } = require('../game/config/yamlEvents');

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

// Renders {role}, {role.attribute} and {participants} against a role->player map.
function renderRoleText(template, roleMap) {
  if (typeof template !== 'string') return template;
  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (key === 'participants') {
      return highlight(formatParticipantList(Object.values(roleMap).map(p => p.name)));
    }
    const dotIdx = key.indexOf('.');
    if (dotIdx !== -1) {
      const player = roleMap[key.slice(0, dotIdx)];
      if (player) {
        const label = getPlayerAttributeLabel(player, key.slice(dotIdx + 1));
        if (label != null) return highlight(label);
      }
      return match;
    }
    const player = roleMap[key];
    return player ? highlight(player.name) : match;
  });
}

function publicOptions(def) {
  if (!Array.isArray(def.options)) return undefined;
  return def.options.map(o => ({ id: o.id, label: o.label, description: o.description ?? null }));
}

function publicSelect(def) {
  return def.select ? { kind: def.select.kind, prompt: def.select.prompt ?? null } : undefined;
}

// Builds the live activeEvent object from a definition + a role->player map.
// __source / __roles are stripped before reaching the client (see GameRoom.toDict).
function materializeEvent(def, roleMap) {
  return {
    id: def.id,
    event_type: def.type,
    title: renderRoleText(def.title, roleMap),
    description: renderRoleText(def.text, roleMap),
    participants: Object.values(roleMap).map(p => p.name),
    participant_ids: Object.values(roleMap).map(p => p.id),
    options: publicOptions(def),
    select: publicSelect(def),
    __source: def,
    __roles: Object.fromEntries(Object.entries(roleMap).map(([role, player]) => [role, player.id])),
  };
}

// Picks a random eligible event whose `when` passes and whose participants fill.
// Returns a materialized activeEvent or null.
function pickRandomEvent(config, room) {
  const pool = (Array.isArray(config.EVENTS) ? config.EVENTS : []).filter(e => !e.scheduled_only);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const def of pool) {
    if (!matchesWhen(def.when, room)) continue;
    const roleMap = selectParticipants(def.participants, room);
    if (roleMap === null) continue;
    return materializeEvent(def, roleMap);
  }
  return null;
}

// Renders text for a scheduled event using carried role names (a player may be
// gone by the time the follow-up fires).
function renderScheduledText(template, roleNames, roleMap, room) {
  if (typeof template !== 'string') return template;
  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (key === 'participants') return highlight(formatParticipantList(Object.values(roleNames)));
    const dotIdx = key.indexOf('.');
    if (dotIdx !== -1) {
      const role = key.slice(0, dotIdx);
      const player = roleMap[role] ? room.getPlayer(roleMap[role]) : null;
      if (player) {
        const label = getPlayerAttributeLabel(player, key.slice(dotIdx + 1));
        if (label != null) return highlight(label);
      }
      return roleNames[role] != null ? highlight(roleNames[role]) : match;
    }
    return roleNames[key] != null ? highlight(roleNames[key]) : match;
  });
}

// Materializes a scheduled event from its stored context ({ roles: {role:{id,name}} }).
function materializeScheduledEvent(def, context, room) {
  const roles = context?.roles ?? {};
  const roleMap = {};        // role -> id
  const roleNames = {};      // role -> name
  for (const [role, info] of Object.entries(roles)) {
    roleMap[role] = info.id;
    roleNames[role] = info.name;
  }
  const activeIds = Object.values(roleMap).filter(id => room.getPlayer(id)?.is_active);
  return {
    id: def.id,
    event_type: def.type,
    title: renderScheduledText(def.title, roleNames, roleMap, room),
    description: renderScheduledText(def.text, roleNames, roleMap, room),
    participants: Object.values(roleNames),
    participant_ids: activeIds,
    options: publicOptions(def),
    select: publicSelect(def),
    __source: def,
    __roles: roleMap,
  };
}

module.exports = {
  parseDurationMonths,
  pickRandomEvent,
  materializeScheduledEvent,
  EVENT_HIGHLIGHT_START,
  EVENT_HIGHLIGHT_END,
};
