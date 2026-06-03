Event {
  Id = "ventilation_crawl",
  Type = "interactive",
  Title = "Кто полезет в вентиляцию?",
  Description = "Воздух стал тяжелым, фильтр захлебывается пылью. В узкий короб пролезет только один человек: его можно отправить с инструментом или поддержкой специалиста, но если он застрянет, вытаскивать будет поздно.",
  RequiresPlayerSelection = true,
  BaseChance = 30,

  CanInvoke = function(ctx)
    return ctx:GetPlayerCount() > 0
  end,

  Success = function(ctx)
    ctx.selected:SetHealth(-4)
    ctx.selected:SetSanity(8)
    ctx.selected:ClearStatus("stale_air")
    ctx:SetFlag("ventilation_fixed", true)
  end,

  Failure = function(ctx)
    ctx.selected:SetHealth(-22)
    ctx.selected:SetSanity(-10)
    ctx.selected:SetStatus("cramped_chest", "Сдавленная грудь", "health", -5, 2)

    for _, player in ipairs(ctx:Players()) do
      player:SetStatus("stale_air", "Спертый воздух", "health", -3, 2)
    end
  end,
}
