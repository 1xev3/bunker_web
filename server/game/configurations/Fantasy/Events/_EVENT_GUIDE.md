# События (YAML)

Одно событие = один `.yaml`-файл в этой папке. Файлы, начинающиеся с `_`
(например `_settings.yaml`), событиями не считаются.

Каждый месяц с шансом `EVENT_SETTINGS.bunker_event_chance` движок выбирает одно
подходящее событие: проверяет `when`, набирает `participants` и взвешивает по `weight`.

## Поля события

```yaml
id: unique_id            # обязательно, уникально среди всех событий
type: flavor | choice    # flavor — текст + эффекты; choice — варианты с голосованием
weight: 2                # относительная частота (по умолчанию 1)
scheduled_only: true     # появляется только как follow-up из schedule
when:                    # условия появления (все И)
  min_month: 2
  max_month: 10
  min_players: 2
  max_players: 8
  flag_set: [some_flag]
  flag_unset: [other_flag]
participants:            # роли подбираются из активных игроков (всегда разные люди)
  victim: {}                              # любой активный
  man: { gender: Мужчина, min_age: 18 }   # фильтры: gender, profession, min_age, max_age
title: Заголовок
text: Текст с плейсхолдерами {victim}, {man.profession}, {participants}
effects: [ ... ]         # для flavor
options: [ ... ]         # для choice
schedule: [ ... ]        # отложенные follow-up события
select: { kind: player, prompt: "..." }   # для choice: показать выбор цели (роль chosen) или предмета
```

Если какую-то роль из `participants` нельзя заполнить — событие пропускается.

## Эффекты

Цель задаётся в `on`: имя роли, `chosen` (из `select`), `all`, `others`
(все, кроме участников), `random`.

```yaml
- { on: victim, health: -16 }
- { on: victim, sanity: 4 }
- { on: victim, status: { id: infection, label: Воспаление, stat: health, value: -6, months: 2 } }
- { on: victim, clear_status: infection }   # или clear_status: debuffs
- { food: 180 }                             # положительное число — добавить
- { food: "10%" }                           # строка "N%" — потерять процент запаса
- { flag: { some_flag: true } }
- { on: chosen, kill: true }
- { kill_random: true }                     # случайный, кроме участников
- { add_room: true }
```

В одном объекте можно совмещать операции: `{ on: victim, health: -5, sanity: -5 }`.

## Варианты (choice)

Игроки голосуют за вариант; победитель применяет свои эффекты. Вариант — либо
детерминированные `effects`, либо взвешенные `outcomes` (исход без `chance` —
остаток вероятности).

```yaml
options:
  - id: medicate
    label: Потратить лекарство
    consume_items: true        # израсходовать выбранные в пикере предметы
    effects:
      - { on: patient, health: 16, clear_status: debuffs }
  - id: wait
    label: Переждать
    outcomes:
      - chance: 40
        text: Жар отступил сам собой.
        effects: [{ on: patient, health: 4 }]
      - text: Стало хуже.
        effects: [{ on: patient, health: -16 }]
```

## Цепочки (schedule)

`carry` проносит роли в follow-up; там они доступны как обычные роли.

```yaml
schedule:
  - { event: morning_rumors, in: 1, carry: [man, woman] }
```

Целевое событие обычно помечают `scheduled_only: true`, чтобы оно не выпадало само.
