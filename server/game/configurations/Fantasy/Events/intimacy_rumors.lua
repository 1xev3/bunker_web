Event {
  Id = "intimacy_rumors",
  Type = "passive",
  ScheduledOnly = true,
  Title = "Слухи после кладовой",
  Description = "История про {context.male_name} и {context.female_name} разошлась по бункеру. Кто-то завидует, кто-то злится, а сами участники теперь ловят на себе слишком много взглядов.",

  Run = function(ctx)
    ctx.male:SetSanity(-8)
    ctx.female:SetSanity(-8)
    ctx.male:SetStatus("whispered_about", "Перешептывания", "sanity", -3, 2)
    ctx.female:SetStatus("whispered_about", "Перешептывания", "sanity", -3, 2)
  end,
}
