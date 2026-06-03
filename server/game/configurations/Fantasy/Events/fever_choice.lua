Event {
  Id = "fever_choice",
  Type = "interactive",
  Title = "Ночная лихорадка",
  Description = "У одного из выживших можно попытаться сбить жар остатками медикаментов. Если ошибиться с дозировкой, станет хуже. Выберите пациента и ресурс, который потратите на лечение.",
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
