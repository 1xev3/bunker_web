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
// `wrap` decorates substituted names — highlight() for title/text (the client
// renders the markers), identity for option labels/outcome messages (rendered
// as plain text, so markers must not leak).
function renderRoleText(template, roleMap, ctx, wrap = highlight) {
  if (typeof template !== 'string') return template;
  if (ctx) template = resolveInlineText(template, ctx.def, ctx.vars);
  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (key === 'participants') {
      return wrap(formatParticipantList(Object.values(roleMap).map(p => p.name)));
    }
    const dotIdx = key.indexOf('.');
    if (dotIdx !== -1) {
      const player = roleMap[key.slice(0, dotIdx)];
      if (player) {
        const label = getPlayerAttributeLabel(player, key.slice(dotIdx + 1));
        if (label != null) return wrap(label);
      }
      return match;
    }
    const player = roleMap[key];
    return player ? wrap(player.name) : match;
  });
}

// Human-readable target of an effect. `on` is a role name (resolved to the
// concrete player's name) or one of the all/others/random keywords.
const TARGET_LABELS = { all: 'все', others: 'остальные', random: 'кто-то' };
function targetLabel(on, resolveName) {
  if (on == null) return null;
  if (TARGET_LABELS[on]) return TARGET_LABELS[on];
  return (resolveName && resolveName(on)) || on;
}

// Turns one declarative effect object into a list of consequence chips
// ({ text, tone }) describing what it does and to whom, in plain Russian.
function effectChips(eff, resolveName) {
  if (!isPlainObject(eff)) return [];
  const chips = [];
  const who = targetLabel(eff.on, resolveName);
  const prefix = who ? `${who}: ` : '';
  const signed = (v) => (v > 0 ? `+${v}` : `${v}`);
  if (typeof eff.health === 'number' && eff.health !== 0) {
    chips.push({ text: `${prefix}${signed(eff.health)} здоровья`, tone: eff.health > 0 ? 'good' : 'bad' });
  }
  if (typeof eff.sanity === 'number' && eff.sanity !== 0) {
    chips.push({ text: `${prefix}${signed(eff.sanity)} рассудка`, tone: eff.sanity > 0 ? 'good' : 'bad' });
  }
  if (eff.status && eff.status.label) {
    chips.push({ text: `${prefix}${eff.status.label}`, tone: (eff.status.value ?? 0) >= 0 ? 'good' : 'bad' });
  }
  if (eff.clear_status) chips.push({ text: `${prefix}снятие эффекта`, tone: 'good' });
  if (eff.kill) chips.push({ text: `${who || 'кто-то'}: гибель`, tone: 'bad' });
  if (eff.kill_random) chips.push({ text: 'случайная гибель', tone: 'bad' });
  if (typeof eff.food === 'number' && eff.food !== 0) {
    chips.push({ text: `${signed(eff.food)} еды`, tone: eff.food > 0 ? 'good' : 'bad' });
  } else if (typeof eff.food === 'string') {
    const pct = parseFloat(eff.food);
    chips.push({ text: `−${Number.isFinite(pct) ? Math.abs(pct) : ''}% еды`, tone: 'bad' });
  }
  if (eff.spawn_survivor) chips.push({ text: 'новый выживший', tone: 'good' });
  if (eff.add_room) chips.push({ text: 'новая комната', tone: 'good' });
  if (eff.remove_room) chips.push({ text: 'потеря комнаты', tone: 'bad' });
  if (eff.give_item) chips.push({ text: `${prefix}предмет получен`, tone: 'good' });
  if (eff.remove_item) chips.push({ text: `${prefix}предмет потерян`, tone: 'bad' });
  if (eff.add_bunker_item) chips.push({ text: 'предмет в бункере', tone: 'good' });
  if (eff.remove_bunker_item) chips.push({ text: 'пропажа предмета', tone: 'bad' });
  if (eff.steal_item) chips.push({ text: 'кража предмета', tone: 'bad' });
  return chips;
}

function summarizeEffectList(effects, resolveName) {
  const chips = [];
  for (const eff of effects ?? []) chips.push(...effectChips(eff, resolveName));
  return chips;
}

// Normalizes a list of weighted outcomes into {chance, tone, effects} entries.
// An outcome without `chance` splits the leftover probability (mirrors
// pickOutcome). `effects` is the consequence summary shown in the UI.
function summarizeOutcomes(list, resolveName) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const known = list.reduce((sum, o) => sum + (typeof o.chance === 'number' ? o.chance : 0), 0);
  const remainderCount = list.filter(o => o.chance == null).length;
  const remainderEach = remainderCount > 0 ? Math.max(0, (100 - known) / remainderCount) : 0;
  return list.map(o => ({
    chance: Math.round(typeof o.chance === 'number' ? o.chance : remainderEach),
    tone: outcomeTone(o),
    effects: summarizeEffectList(o.effects, resolveName),
  }));
}

// Success/failure consequence chips for a selection-scaled option, so the card
// can describe what's at stake even before the council picks. Success draws on
// the best (all → some) bucket; failure on the worst (none) bucket.
function scaledEffectSummary(buckets, resolveName) {
  const successPool = (buckets.all && buckets.all.length ? buckets.all : buckets.some) ?? [];
  const success = successPool.find(o => outcomeTone(o) !== 'bad') ?? successPool[0];
  const failPool = buckets.none ?? [];
  const fail = failPool[failPool.length - 1] ?? failPool[0];
  return {
    success_effects: success ? summarizeEffectList(success.effects, resolveName) : [],
    fail_effects: fail ? summarizeEffectList(fail.effects, resolveName) : [],
  };
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

function optionOdds(option, resolveName) {
  // Selection-scaled options compute their odds live on the client from the
  // current pick count (see selectionSuccessChance); the server hands over the
  // success/failure colours and the consequence chips for each branch.
  if (isPlainObject(option.outcomes_by_selection)) {
    return {
      odds_scaled: {
        good_tone: selectionGoodTone(option.outcomes_by_selection),
        bad_tone: 'bad',
        ...scaledEffectSummary(option.outcomes_by_selection, resolveName),
      },
    };
  }
  if (Array.isArray(option.outcomes) && option.outcomes.length > 0) {
    return { odds: summarizeOutcomes(option.outcomes, resolveName) };
  }
  // Options with a flat, guaranteed `effects` list have no roll — present them
  // as a single certain outcome so their consequences are still shown.
  if (Array.isArray(option.effects) && option.effects.length > 0) {
    return {
      odds: [{
        chance: 100,
        guaranteed: true,
        tone: outcomeTone({ effects: option.effects }),
        effects: summarizeEffectList(option.effects, resolveName),
      }],
    };
  }
  return {};
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// `render` substitutes role placeholders ({finder}, {man}, …) and inline
// alternatives in option label/description, mirroring how title/text are
// rendered. Without it, placeholders would leak to the client verbatim.
function publicOptions(def, render = (t) => t, resolveName = () => null) {
  if (!Array.isArray(def.options)) return undefined;
  return def.options.map(o => ({
    id: o.id,
    label: render(o.label),
    description: o.description != null ? render(o.description) : null,
    requires: Array.isArray(o.requires) ? o.requires.filter(k => ['player', 'item', 'profession'].includes(k)) : [],
    ...optionOdds(o, resolveName),
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
    options: publicOptions(def, t => renderRoleText(t, roleMap, ctx, v => v), role => roleMap[role]?.name ?? null),
    select: publicSelect(def),
    __source: def,
    __roles: Object.fromEntries(Object.entries(roleMap).map(([role, player]) => [role, player.id])),
  };
}

// Picks a random eligible event whose `when` passes and whose participants fill,
// using each event's `weight` for weighted random selection.
function pickRandomEvent(config, room) {
  const pool = (Array.isArray(config.EVENTS) ? config.EVENTS : []).filter(e => !e.scheduled_only);

  const eligible = [];
  for (const def of pool) {
    if (!matchesWhen(def.when, room)) continue;
    const roleMap = selectParticipants(def.participants, room);
    if (roleMap === null) continue;
    eligible.push({ def, roleMap });
  }

  if (eligible.length === 0) return null;

  const total = eligible.reduce((sum, e) => sum + (e.def.weight ?? 1), 0);
  let rand = Math.random() * total;
  for (const entry of eligible) {
    rand -= entry.def.weight ?? 1;
    if (rand <= 0) return materializeEvent(entry.def, entry.roleMap);
  }
  const last = eligible[eligible.length - 1];
  return materializeEvent(last.def, last.roleMap);
}

// Renders text for a scheduled event using carried role names (a player may be
// gone by the time the follow-up fires).
function renderScheduledText(template, roleNames, roleMap, room, ctx, wrap = highlight) {
  if (typeof template !== 'string') return template;
  if (ctx) template = resolveInlineText(template, ctx.def, ctx.vars);
  return template.replace(EVENT_TEMPLATE_RE, (match, key) => {
    if (key === 'participants') return wrap(formatParticipantList(Object.values(roleNames)));
    const dotIdx = key.indexOf('.');
    if (dotIdx !== -1) {
      const role = key.slice(0, dotIdx);
      const player = roleMap[role] ? room.getPlayer(roleMap[role]) : null;
      if (player) {
        const label = getPlayerAttributeLabel(player, key.slice(dotIdx + 1));
        if (label != null) return wrap(label);
      }
      return roleNames[role] != null ? wrap(roleNames[role]) : match;
    }
    return roleNames[key] != null ? wrap(roleNames[key]) : match;
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
    options: publicOptions(def, t => renderScheduledText(t, roleNames, roleMap, room, ctx, v => v), role => roleNames[role] ?? null),
    select: publicSelect(def),
    __source: def,
    __roles: roleMap,
  };
}

// Renders an outcome's result text: inline alternatives, {event.x} vars, and
// role placeholders ({thief}, {chosen}, …). `roleMap` is role->playerId (e.g.
// event.__roles plus `chosen`); names/attributes are looked up live from `room`.
function renderEventText(template, def, roleMap, room) {
  const roleNames = {};
  for (const [role, id] of Object.entries(roleMap || {})) {
    const player = room.getPlayer(id);
    if (player) roleNames[role] = player.name;
  }
  return renderScheduledText(template, roleNames, roleMap || {}, room, { def, vars: buildEventVars(def) }, v => v);
}

module.exports = {
  parseDurationMonths,
  pickRandomEvent,
  materializeScheduledEvent,
  renderEventText,
  EVENT_HIGHLIGHT_START,
  EVENT_HIGHLIGHT_END,
};
