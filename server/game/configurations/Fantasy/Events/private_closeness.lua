Event {
  Id = "private_closeness",
  Type = "passive",
  Title = "Секс в кладовой",
  Description = "{male} и {female} уединились в кладовой, пока остальные делали вид, что ничего не слышат. На одну ночь бункер стал менее похож на могилу, но секреты здесь долго не живут.",

  CanInvoke = function(ctx)
    return ctx:GetPlayerCount() >= 2
  end,

  Init = function(ctx)
    local males = {}
    local females = {}

    for _, player in ipairs(ctx:Players()) do
      if player:GetAge() >= 18 and player:GetGender() == "Мужчина" then
        table.insert(males, player)
      end
      if player:GetAge() >= 18 and player:GetGender() == "Женщина" then
        table.insert(females, player)
      end
    end

    if #males == 0 or #females == 0 then
      return false
    end

    ctx.male = males[math.random(#males)]
    ctx.female = females[math.random(#females)]
    return true
  end,

  Run = function(ctx)
    ctx.male:SetSanity(12)
    ctx.female:SetSanity(12)
    ctx.male:SetStatus("distracted", "Рассеянность", "sanity", -3, 2)
    ctx.female:SetStatus("distracted", "Рассеянность", "sanity", -3, 2)
    ctx:Schedule("intimacy_rumors", 1, {
      male = "male",
      female = "female",
    })
  end,
}
