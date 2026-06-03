# Lua events

Events are declared with `Event { ... }`. Scripts run in a sandbox: no `require`,
`io`, `os`, `package`, `debug`, filesystem, or network access.

Lua decides whether an event can appear and can store event-local variables in
`ctx`. Those variables survive from `Init(ctx)` to `Run/Success/Failure`.

```lua
Event {
  Id = "fever_choice",
  Type = "interactive",
  Title = "Ночная лихорадка",
  Description = "Выберите пациента и ресурс для лечения.",
  RequiresPlayerSelection = true,
  BaseChance = 40,

  CanInvoke = function(ctx)
    return ctx:GetPlayerCount() > 0
  end,

  Success = function(ctx)
    ctx.selected:SetHealth(16)
    ctx.selected:SetSanity(4)
    ctx.selected:ClearStatus()
  end,

  Failure = function(ctx)
    ctx.selected:SetHealth(-16)
    ctx.selected:SetStatus("infection", "Воспаление", "health", -6, 2)
  end,
}
```

## Event Fields

- `Id`: unique event id.
- `Type`: `interactive`, `passive`, or `narrative`.
- `Title`, `Description`: text shown to players.
- `RequiresPlayerSelection`: show target picker and require `ctx.selected`.
- `BaseChance`: percent for interactive events without resources.
- `Choice`: `{ Success = "...", Failure = "..." }` for vote events.
- `ScheduledOnly`: `true` if the event must only be called by `ctx:Schedule`.

There is no `Weight`. Random selection shuffles events and asks each event:
`CanInvoke(ctx)` and then `Init(ctx)`. If either returns `false`, the engine tries
the next event.

## Lifecycle

- `CanInvoke(ctx)`: cheap condition check. Return `false` to skip the event.
- `Init(ctx)`: choose participants and write variables, e.g. `ctx.victim = player`.
- `Run(ctx)`: passive/narrative event effects.
- `Success(ctx)`: successful interactive/vote effects.
- `Failure(ctx)`: failed interactive/vote effects.

## Context Getters

- `ctx:GetFood()`
- `ctx:GetMonth()`
- `ctx:GetPlayerCount()`
- `ctx:GetFlag("flag_id")`
- `ctx:Chance(30)`
- `ctx:Get("key")`

## Context Setters / Actions

- `ctx:Set("key", value)`
- `ctx:SetFood(120)`
- `ctx:SetFood(-10, "percent")`
- `ctx:SetFlag("witch_angered", true)`
- `ctx:Schedule("witch_revenge", 2)`
- `ctx:Schedule("intimacy_rumors", 1, { male = "male", female = "female" })`
- `ctx:KillRandom()`
- `ctx:AddRoom()`

## Players

```lua
for _, player in ipairs(ctx:Players()) do
  if player:GetGender() == "Мужчина" and player:GetAge() >= 18 then
    ctx.male = player
  end
end
```

Player getters:

- `player:GetName()`
- `player:GetGender()`
- `player:GetAge()`
- `player:GetProfession()`
- `player:GetHealth()`
- `player:GetSanity()`
- `player:IsActive()`

Player setters:

- `player:SetHealth(-10)`
- `player:SetSanity(5)`
- `player:SetStatus("infection", "Воспаление", "health", -6, 2)`
- `player:ClearStatus("infection")`
- `player:ClearStatus()` clears debuffs.

Variables written into `ctx` are event-local. If a variable contains a player,
the engine can use it in text placeholders such as `{victim}`, `{male}` and keep
it for scheduled follow-up events.
