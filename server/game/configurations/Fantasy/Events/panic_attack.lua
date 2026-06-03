Event {
  Id = "panic_attack",
  Type = "passive",
  Title = "Паническая атака",
  Description = "{victim} сорвался среди ночи: стучал по двери, требовал воздуха и не узнавал тех, кто пытался его удержать.",

  CanInvoke = function(ctx)
    return ctx:GetPlayerCount() > 0
  end,

  Init = function(ctx)
    local players = ctx:Players()
    ctx.victim = players[math.random(#players)]
    return ctx.victim ~= nil
  end,

  Run = function(ctx)
    ctx.victim:SetSanity(-18)
    ctx.victim:SetHealth(-5)
    ctx.victim:SetStatus("panic_echo", "Эхо паники", "sanity", -4, 2)
  end,
}
