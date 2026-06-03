Event {
  Id = "supply_cache",
  Type = "passive",
  Title = "Забытый ящик",
  Description = "За фальшпанелью нашли старый аварийный ящик. Еды мало, но сам факт находки на несколько часов вернул людям ощущение контроля.",

  CanInvoke = function(ctx)
    return not ctx:GetFlag("supply_cache_found")
  end,

  Init = function(ctx)
    local players = ctx:Players()
    ctx.finder = players[math.random(#players)]
    return ctx.finder ~= nil
  end,

  Run = function(ctx)
    ctx:SetFood(180)
    ctx.finder:SetSanity(8)
    ctx:SetFlag("supply_cache_found", true)
  end,
}
