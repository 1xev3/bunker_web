const fs = require('fs');
const path = require('path');
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = require('fengari');

function luaError(L) {
  let msg = lua.lua_tojsstring(L, -1);
  if (!msg && lua.lua_isstring(L, -1)) {
    const raw = lua.lua_tostring(L, -1);
    if (raw) msg = to_jsstring(raw);
  }
  lua.lua_pop(L, 1);
  return msg || 'unknown Lua error';
}

function openSafeLibs(L) {
  const libs = [
    ['_G', lualib.luaopen_base],
    [lualib.LUA_TABLIBNAME, lualib.luaopen_table],
    [lualib.LUA_STRLIBNAME, lualib.luaopen_string],
    [lualib.LUA_MATHLIBNAME, lualib.luaopen_math],
  ];
  for (const [name, openFn] of libs) {
    lauxlib.luaL_requiref(L, to_luastring(name), openFn, 1);
    lua.lua_pop(L, 1);
  }
  for (const name of ['require', 'io', 'os', 'package', 'debug', 'dofile', 'loadfile', 'load', 'collectgarbage']) {
    lua.lua_pushnil(L);
    lua.lua_setglobal(L, to_luastring(name));
  }
}

function absIndex(L, idx) {
  return idx < 0 ? lua.lua_gettop(L) + idx + 1 : idx;
}

function getField(L, idx, key) {
  lua.lua_getfield(L, idx, to_luastring(key));
}

function readStringField(L, idx, key) {
  getField(L, idx, key);
  const value = lua.lua_isstring(L, -1) ? lua.lua_tojsstring(L, -1) : undefined;
  lua.lua_pop(L, 1);
  return value;
}

function readNumberField(L, idx, key) {
  getField(L, idx, key);
  const value = lua.lua_isnumber(L, -1) ? lua.lua_tonumber(L, -1) : undefined;
  lua.lua_pop(L, 1);
  return value;
}

function readBooleanField(L, idx, key) {
  getField(L, idx, key);
  const value = lua.lua_isboolean(L, -1) ? Boolean(lua.lua_toboolean(L, -1)) : undefined;
  lua.lua_pop(L, 1);
  return value;
}

function readChoiceLabels(L, idx) {
  getField(L, idx, 'Choice');
  if (!lua.lua_istable(L, -1)) {
    lua.lua_pop(L, 1);
    return undefined;
  }
  const success = readStringField(L, -1, 'Success');
  const failure = readStringField(L, -1, 'Failure');
  lua.lua_pop(L, 1);
  return success && failure ? { success, failure } : undefined;
}

function parseEventTable(L, idx, filePath) {
  const eventIdx = absIndex(L, idx);
  const event = {
    id: readStringField(L, eventIdx, 'Id'),
    event_type: readStringField(L, eventIdx, 'Type') ?? 'interactive',
    title: readStringField(L, eventIdx, 'Title'),
    description: readStringField(L, eventIdx, 'Description'),
    __lua_file: filePath,
  };

  const baseChance = readNumberField(L, eventIdx, 'BaseChance');
  const requiresPlayerSelection = readBooleanField(L, eventIdx, 'RequiresPlayerSelection');
  const scheduledOnly = readBooleanField(L, eventIdx, 'ScheduledOnly');
  if (baseChance !== undefined) event.base_chance = baseChance > 1 ? baseChance / 100 : baseChance;
  if (requiresPlayerSelection !== undefined) event.requires_player_selection = requiresPlayerSelection;
  if (scheduledOnly !== undefined) event.scheduled_only = scheduledOnly;

  const choiceLabels = readChoiceLabels(L, eventIdx);
  if (choiceLabels) event.choice_labels = choiceLabels;

  for (const key of ['id', 'title', 'description']) {
    if (!event[key]) throw new Error(`event missing required field: ${key}`);
  }

  return event;
}

function createLuaStateForFile(filePath, onEvent) {
  const L = lauxlib.luaL_newstate();
  openSafeLibs(L);
  lua.lua_pushcfunction(L, () => {
    lauxlib.luaL_checktype(L, 1, lua.LUA_TTABLE);
    onEvent(L, 1);
    return 0;
  });
  lua.lua_setglobal(L, to_luastring('Event'));

  const source = fs.readFileSync(filePath, 'utf8');
  const status = lauxlib.luaL_loadstring(L, to_luastring(source)) || lua.lua_pcall(L, 0, 0, 0);
  if (status !== lua.LUA_OK) throw new Error(`${path.basename(filePath)}: ${luaError(L)}`);
  return L;
}

function loadLuaEventFile(filePath) {
  const events = [];
  createLuaStateForFile(filePath, (L, idx) => {
    events.push(parseEventTable(L, idx, filePath));
  });
  return events;
}

function readLuaEventsDirectory(eventsDir) {
  return fs.readdirSync(eventsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.lua'))
    .map(entry => path.join(eventsDir, entry.name))
    .sort((a, b) => a.localeCompare(b))
    .flatMap(loadLuaEventFile);
}

function pushJsValue(L, value) {
  if (value && value.__playerProxy === true) {
    pushPlayerProxy(L, value.collector, value.room, value.player.id);
  } else if (typeof value === 'boolean') {
    lua.lua_pushboolean(L, value);
  } else if (typeof value === 'number') {
    lua.lua_pushnumber(L, value);
  } else if (typeof value === 'string') {
    lua.lua_pushstring(L, to_luastring(value));
  } else if (value == null) {
    lua.lua_pushnil(L);
  } else {
    lua.lua_pushstring(L, to_luastring(String(value)));
  }
}

function readLuaScalar(L, idx) {
  if (lua.lua_isboolean(L, idx)) return Boolean(lua.lua_toboolean(L, idx));
  if (lua.lua_isnumber(L, idx)) return lua.lua_tonumber(L, idx);
  if (lua.lua_isstring(L, idx)) return lua.lua_tojsstring(L, idx);
  return null;
}

function getPlayerGender(player) {
  const config = player?.config;
  const id = player?.gender?.genderId;
  return config?.GENDERS?.find(entry => entry.value.id === id)?.value?.label ?? id ?? '';
}

function getPlayerProfession(player) {
  const id = player?.profession?.id;
  return player?.config?.PROFESSION_ABILITIES?.[id]?.label ?? id ?? '';
}

function pushPlayerProxy(L, collector, room, playerId) {
  const player = room.getPlayer(playerId);
  lua.lua_newtable(L);
  lua.lua_pushstring(L, to_luastring(playerId));
  lua.lua_setfield(L, -2, to_luastring('__player_id'));

  lua.lua_pushcfunction(L, () => {
    const value = lauxlib.luaL_checknumber(L, 2);
    collector.push({ type: 'health_change', target: playerId, value });
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('SetHealth'));

  lua.lua_pushcfunction(L, () => {
    const value = lauxlib.luaL_checknumber(L, 2);
    collector.push({ type: 'sanity_change', target: playerId, value });
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('SetSanity'));

  lua.lua_pushcfunction(L, () => {
    const id = lauxlib.luaL_checkstring(L, 2);
    const label = lauxlib.luaL_checkstring(L, 3);
    const stat = lauxlib.luaL_checkstring(L, 4);
    const value = lauxlib.luaL_checknumber(L, 5);
    const months = lauxlib.luaL_checkinteger(L, 6);
    collector.push({
      type: 'add_status',
      target: playerId,
      status_id: to_jsstring(id),
      label: to_jsstring(label),
      stat: to_jsstring(stat),
      value,
      months,
    });
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('SetStatus'));

  lua.lua_pushcfunction(L, () => {
    const statusId = lua.lua_isstring(L, 2) ? lua.lua_tojsstring(L, 2) : undefined;
    collector.push(statusId
      ? { type: 'clear_status', target: playerId, status_id: statusId }
      : { type: 'clear_status', target: playerId, status_type: 'debuff' });
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('ClearStatus'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushinteger(L, player?.vital_status?.health ?? 100);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('GetHealth'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushinteger(L, player?.vital_status?.sanity ?? 100);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('GetSanity'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushstring(L, to_luastring(player?.name ?? ''));
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('GetName'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushstring(L, to_luastring(getPlayerGender(player)));
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('GetGender'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushstring(L, to_luastring(getPlayerProfession(player)));
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('GetProfession'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushinteger(L, player?.gender?.age ?? 0);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('GetAge'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushboolean(L, player?.is_active === true);
    return 1;
  });
  lua.lua_setfield(L, -2, to_luastring('IsActive'));
}

function pushPlayersArray(L, collector, room) {
  lua.lua_newtable(L);
  room.getActivePlayers().forEach((player, index) => {
    pushPlayerProxy(L, collector, room, player.id);
    lua.lua_rawseti(L, -2, index + 1);
  });
}

function pushCtx(L, collector, room, context = {}) {
  lua.lua_newtable(L);
  const ctxIdx = lua.lua_gettop(L);

  for (const [key, value] of Object.entries(context.vars ?? {})) {
    if (value?.kind === 'player') pushPlayerProxy(L, collector, room, value.id);
    else pushJsValue(L, value?.value ?? value);
    lua.lua_setfield(L, ctxIdx, to_luastring(key));
  }

  for (const [key, value] of Object.entries(context.scheduledContext ?? {})) {
    // *_name and *_race_id are metadata for text rendering, not player references.
    if (key.endsWith('_name') || key.endsWith('_race_id')) continue;
    if (key.endsWith('_id') && typeof value === 'string') {
      const role = key.slice(0, -3);
      pushPlayerProxy(L, collector, room, value);
      lua.lua_setfield(L, ctxIdx, to_luastring(role));
    } else {
      pushJsValue(L, value);
      lua.lua_setfield(L, ctxIdx, to_luastring(key));
    }
  }

  if (typeof context.selectedPlayerId === 'string') {
    pushPlayerProxy(L, collector, room, context.selectedPlayerId);
    lua.lua_setfield(L, ctxIdx, to_luastring('selected'));
  }

  lua.lua_pushcfunction(L, () => {
    pushPlayersArray(L, collector, room);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('Players'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushinteger(L, room.food ?? 0);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('GetFood'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushinteger(L, room.currentMonth ?? 0);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('GetMonth'));

  lua.lua_pushcfunction(L, () => {
    lua.lua_pushinteger(L, room.getActivePlayers().length);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('GetPlayerCount'));

  lua.lua_pushcfunction(L, () => {
    const key = lauxlib.luaL_checkstring(L, 2);
    pushJsValue(L, room.flags?.[to_jsstring(key)]);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('GetFlag'));

  lua.lua_pushcfunction(L, () => {
    const key = lauxlib.luaL_checkstring(L, 2);
    const value = readLuaScalar(L, 3);
    collector.push({ type: 'set_flag', key: to_jsstring(key), value });
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('SetFlag'));

  lua.lua_pushcfunction(L, () => {
    const value = lauxlib.luaL_checknumber(L, 2);
    const mode = lua.lua_isstring(L, 3) ? lua.lua_tojsstring(L, 3) : undefined;
    collector.push({ type: 'food_change', value: mode === 'percent' ? -Math.abs(value) : value });
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('SetFood'));

  lua.lua_pushcfunction(L, () => {
    const percent = lauxlib.luaL_checknumber(L, 2);
    lua.lua_pushboolean(L, Math.random() * 100 < percent);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('Chance'));

  lua.lua_pushcfunction(L, () => {
    const key = lauxlib.luaL_checkstring(L, 2);
    getField(L, 1, to_jsstring(key));
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('Get'));

  lua.lua_pushcfunction(L, () => {
    const key = lauxlib.luaL_checkstring(L, 2);
    lua.lua_pushvalue(L, 3);
    lua.lua_setfield(L, 1, key);
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('Set'));

  lua.lua_pushcfunction(L, () => {
    const eventId = lauxlib.luaL_checkstring(L, 2);
    const delayMonths = lauxlib.luaL_checkinteger(L, 3);
    const effect = { type: 'schedule_event', event_id: to_jsstring(eventId), delay_months: delayMonths };
    if (lua.lua_istable(L, 4)) {
      const contextFromParticipants = {};
      lua.lua_pushnil(L);
      while (lua.lua_next(L, 4) !== 0) {
        if (lua.lua_isstring(L, -2) && lua.lua_isstring(L, -1)) {
          contextFromParticipants[lua.lua_tojsstring(L, -2)] = lua.lua_tojsstring(L, -1);
        }
        lua.lua_pop(L, 1);
      }
      effect.context_from_participants = contextFromParticipants;
    }
    collector.push(effect);
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('Schedule'));

  lua.lua_pushcfunction(L, () => {
    collector.push({ type: 'kill_random_active' });
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('KillRandom'));

  lua.lua_pushcfunction(L, () => {
    collector.push({ type: 'add_room' });
    lua.lua_pushvalue(L, 1);
    return 1;
  });
  lua.lua_setfield(L, ctxIdx, to_luastring('AddRoom'));

  return ctxIdx;
}

function callEventFunction(L, eventRef, key, ctxIdx, nresults = 0) {
  lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, eventRef);
  getField(L, -1, key);
  lua.lua_remove(L, -2);
  if (!lua.lua_isfunction(L, -1)) {
    lua.lua_pop(L, 1);
    return undefined;
  }
  lua.lua_pushvalue(L, ctxIdx);
  if (lua.lua_pcall(L, 1, nresults, 0) !== lua.LUA_OK) throw new Error(luaError(L));
  if (nresults === 1) {
    const value = lua.lua_isboolean(L, -1) ? Boolean(lua.lua_toboolean(L, -1)) : readLuaScalar(L, -1);
    lua.lua_pop(L, 1);
    return value;
  }
  return undefined;
}

function extractCtxVars(L, ctxIdx) {
  const vars = {};
  lua.lua_pushnil(L);
  while (lua.lua_next(L, ctxIdx) !== 0) {
    if (lua.lua_isstring(L, -2)) {
      const key = lua.lua_tojsstring(L, -2);
      if (!/^[A-Z]/.test(key)) {
        getField(L, -1, '__player_id');
        if (lua.lua_isstring(L, -1)) {
          vars[key] = { kind: 'player', id: lua.lua_tojsstring(L, -1) };
        } else {
          vars[key] = { kind: 'value', value: readLuaScalar(L, -2) };
        }
        lua.lua_pop(L, 1);
      }
    }
    lua.lua_pop(L, 1);
  }
  return vars;
}

function prepareLuaEvent(event, room) {
  const L = lauxlib.luaL_newstate();
  openSafeLibs(L);
  let localEventRef = lua.LUA_NOREF;
  lua.lua_pushcfunction(L, () => {
    lauxlib.luaL_checktype(L, 1, lua.LUA_TTABLE);
    const id = readStringField(L, 1, 'Id');
    if (id === event.id) {
      lua.lua_pushvalue(L, 1);
      localEventRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
    }
    return 0;
  });
  lua.lua_setglobal(L, to_luastring('Event'));
  const source = fs.readFileSync(event.__lua_file, 'utf8');
  const status = lauxlib.luaL_loadstring(L, to_luastring(source)) || lua.lua_pcall(L, 0, 0, 0);
  if (status !== lua.LUA_OK) throw new Error(`${path.basename(event.__lua_file)}: ${luaError(L)}`);
  if (localEventRef === lua.LUA_NOREF) throw new Error(`${path.basename(event.__lua_file)}: event "${event.id}" not found`);

  const collector = [];
  const ctxIdx = pushCtx(L, collector, room, {});
  const canInvoke = callEventFunction(L, localEventRef, 'CanInvoke', ctxIdx, 1);
  if (canInvoke === false) return null;
  const initResult = callEventFunction(L, localEventRef, 'Init', ctxIdx, 1);
  if (initResult === false) return null;

  const vars = extractCtxVars(L, ctxIdx);
  const participants = Object.entries(vars)
    .filter(([, value]) => value.kind === 'player')
    .map(([role, value]) => {
      const player = room.getPlayer(value.id);
      return player?.is_active ? { role, player } : null;
    })
    .filter(Boolean);

  // Passive/global events are valid without participant variables.
  return {
    event: {
      ...event,
      __lua_context: { vars },
    },
    participants,
  };
}

function runLuaEventHandler(filePath, eventId, handlerKey, runtime) {
  const L = lauxlib.luaL_newstate();
  openSafeLibs(L);
  let eventRef = lua.LUA_NOREF;
  lua.lua_pushcfunction(L, () => {
    lauxlib.luaL_checktype(L, 1, lua.LUA_TTABLE);
    const id = readStringField(L, 1, 'Id');
    if (id === eventId) {
      lua.lua_pushvalue(L, 1);
      eventRef = lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
    }
    return 0;
  });
  lua.lua_setglobal(L, to_luastring('Event'));
  const source = fs.readFileSync(filePath, 'utf8');
  const status = lauxlib.luaL_loadstring(L, to_luastring(source)) || lua.lua_pcall(L, 0, 0, 0);
  if (status !== lua.LUA_OK) throw new Error(`${path.basename(filePath)}: ${luaError(L)}`);
  if (eventRef === lua.LUA_NOREF) throw new Error(`${path.basename(filePath)}: event "${eventId}" not found`);

  const effects = [];
  const ctxIdx = pushCtx(L, effects, runtime.room, {
    ...(runtime.eventContext ?? {}),
    scheduledContext: runtime.context?.scheduledContext,
    selectedPlayerId: runtime.context?.selectedPlayerId,
  });
  const key = handlerKey === 'run' ? 'Run' : handlerKey === 'success' ? 'Success' : handlerKey === 'failure' ? 'Failure' : handlerKey;
  callEventFunction(L, eventRef, key, ctxIdx, 0);
  return effects;
}

module.exports = { loadLuaEventFile, readLuaEventsDirectory, prepareLuaEvent, runLuaEventHandler };
