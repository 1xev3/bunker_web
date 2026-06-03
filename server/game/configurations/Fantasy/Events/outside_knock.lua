Event {
  Id = "outside_knock",
  Type = "interactive",
  Title = "Стук снаружи",
  Description = "За внешней дверью кто-то стучит короткими сериями и называет имя одного из выживших. Можно отправить человека к смотровому люку, чтобы проверить сигнал, но он будет первым, кто увидит то, что стоит у входа.",
  RequiresPlayerSelection = true,
  BaseChance = 25,

  CanInvoke = function(ctx)
    return ctx:GetPlayerCount() > 0 and not ctx:GetFlag("outside_signal_checked")
  end,

  Success = function(ctx)
    ctx.selected:SetSanity(10)
    ctx:SetFood(120)
    ctx:SetFlag("outside_signal_checked", true)
  end,

  Failure = function(ctx)
    ctx.selected:SetSanity(-24)
    ctx.selected:SetStatus("haunted_by_voice", "Слышит голоса", "sanity", -6, 3)
    ctx:SetFlag("outside_signal_checked", true)
  end,
}
