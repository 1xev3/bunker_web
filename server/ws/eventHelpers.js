const { getPlayerAttributeLabel } = require('../game/config/playerAttributes');
const { matchesWhen, selectParticipants, getSelectKinds, buildEventVars, resolveInlineText, outcomeTone } = require('../game/config/yamlEvents');

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
// `ctx` ({ def, vars }) lets the text first resolve inline alternatives
// ("{a|b|c}") and event self-references ("{event.<name>}").
function renderRoleText(template, roleMap, ctx) {
  if (typeof template !== 'string') return template;
  if (ctx) template = resolveInlineText(template, ctx.def, ctx.vars);
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

// Normalizes a list of weighted outcomes into {chance, tone} entries. An outcome
// without `chance` splits the leftover probability (mirrors pickOutcome).
function summarizeOutcomes(list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const known = list.reduce((sum, o) => sum + (typeof o.chance === 'number' ? o.chance : 0), 0);
  const remainderCount = list.filter(o => o.chance == null).length;
  const remainderEach = remainderCount > 0 ? Math.max(0, (100 - known) / remainderCount) : 0;
  return list.map(o => ({
    chance: Math.round(typeof o.chance === 'number' ? o.chance : remainderEach),
    tone: outcomeTone(o),
  }));
}

// Tone of the "good" branch of a selection-scaled option (highest-chance
// non-bad outcome among the all/some buckets), used to colour the success share.
function selectionGoodTone(buckets) {
  for (const bucket of ['all', 'some']) {
    for (const outcome of buckets[bucket] ?? []) {
      const tone = outcomeTone(outcome);
      if (tone !== 'bad') return tone;
    }
  }
  return 'good';
}

function optionOdds(option) {
  // Selection-scaled options compute their odds live on the client from the
  // current pick count (see selectionSuccessChance); the server only needs to
  // hand over the success/failure colours.
  if (isPlainObject(option.outcomes_by_selection)) {
    return { odds_scaled: { good_tone: selectionGoodTone(option.outcomes_by_selection), bad_tone: 'bad' } };
  }
  return { odds: summarizeOutcomes(option.outcomes) };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function publicOptions(def) {
  if (!Array.isArray(def.options)) return undefined;
  return def.options.map(o => ({
    id: o.id,
    label: o.label,
    description: o.description ?? null,
    requires: Array.isArray(o.requires) ? o.requires.filter(k => ['player', 'item', 'profession'].includes(k)) : [],
    ...optionOdds(o),
  }));
}

function publicSelect(def) {
  if (!def.select) return undefined;
  const kinds = getSelectKinds(def.select);
  return {
    kind: kinds[0] ?? null,
    kinds,
    prompt: def.select.prompt ?? null,
    prompt_item: def.select.prompt_item ?? null,
    prompt_profession: def.select.prompt_profession ?? null,
  };
}

// Builds the live activeEvent object from a definition + a role->player map.
// __source / __roles are stripped before reaching the client (see GameRoom.toDict).
function materializeEvent(def, roleMap) {
  const ctx = { def, vars: buildEventVars(def) };
  return {
    id: def.id,
    event_type: def.type,
    title: renderRoleText(def.title, roleMap, ctx),
    description: renderRoleText(def.text, roleMap, ctx),
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
function renderScheduledText(template, roleNames, roleMap, room, ctx) {
  if (typeof template !== 'string') return template;
  if (ctx) template = resolveInlineText(template, ctx.def, ctx.vars);
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
  const ctx = { def, vars: buildEventVars(def) };
  return {
    id: def.id,
    event_type: def.type,
    title: renderScheduledText(def.title, roleNames, roleMap, room, ctx),
    description: renderScheduledText(def.text, roleNames, roleMap, room, ctx),
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
