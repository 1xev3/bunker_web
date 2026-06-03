Event {
  Id = "ration_theft",
  Type = "interactive",
  Title = "Пропали пайки",
  Description = "Ночью исчезла часть еды. Следы ведут к личным вещам {suspect}. Можно простить и урезать пайки или публично обвинить подозреваемого.",
  Choice = {
    Success = "Простить и урезать пайки",
    Failure = "Публично обвинить",
  },

  CanInvoke = function(ctx)
    return ctx:GetFood() > 0 and ctx:GetPlayerCount() > 1
  end,

  Init = function(ctx)
    local players = ctx:Players()
    ctx.suspect = players[math.random(#players)]
    return ctx.suspect ~= nil
  end,

  Success = function(ctx)
    ctx:SetFood(-10, "percent")
    ctx.suspect:SetSanity(-5)
  end,

  Failure = function(ctx)
    ctx.suspect:SetSanity(-18)
    ctx.suspect:SetStatus("humiliated", "Унижен", "sanity", -5, 2)
  end,
}
