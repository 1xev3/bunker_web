# Гайд по созданию эвентов

Каждый эвент — YAML-файл (или несколько эвентов в одном файле через `- id:`) в папке `Events/`.

---

## Типы эвентов (`event_type`)

| Тип | Когда срабатывает | Логика |
|---|---|---|
| _(не указан)_ | автоопределение | если есть `base_chance` — `interactive`; иначе `passive` |
| `interactive` | игрок принимает решение | группа выбирает профессии/предметы → успех/провал по шансу |
| `passive` | автоматически | сразу применяются `success_effects`, без выбора |
| `narrative` | цепочка после другого эвента | текст + эффекты, кнопка «Продолжить» |
| `food_replenish` | зарезервирован системой | особый тип для события голода |

---

## Все поля

### Идентификация

```yaml
id: my_event              # обязательно, уникальный строковой ID
event_type: passive       # опционально; см. таблицу выше
```

### Текст

```yaml
title: Название           # строка или список строк (выбирается случайно)
title:
  - Вариант А
  - Вариант Б

description: Текст        # строка или список строк (выбирается случайно)
```

**Вставка переменных в текст:**

| Шаблон | Что подставляется |
|---|---|
| `{role}` | имя участника с ролью `role` |
| `{role.attribute}` | атрибут участника (`profession`, `health`, `gender`, `hobby`, `phobia`, `trait`, `race`, `body`, `age`, `name`, `profession_level`, `hobby_level`) |
| `{participants}` | список всех участников через запятую |
| `{alt.key}` | случайное значение из `alt[].key` |
| `{context.key}` | значение из контекста запланированного эвента (для `schedule_event`) |

### Альтернативные фрагменты текста (`alt`)

Список объектов. Каждый объект — набор ключей, из которых случайно выбирается **один объект целиком**, и его поля используются в `{alt.key}`.

```yaml
alt:
  - cause:
      - делёжки припасов
      - старых обид
    symptom:
      - слабость
      - тошноту
```

Если `description` использует `{alt.cause}` и `{alt.symptom}`, оба значения берутся из **одного и того же** выбранного объекта.

---

### Участники

#### Вариант 1 — именованные роли (новый, рекомендуемый)

```yaml
participants:
  - role: doctor           # имя роли для использования в тексте
    filter:                # фильтр (опционально)
      scripted: medic
  - role: patient
    optional: true         # если не найден — слот пропускается, не блокирует эвент
```

#### Вариант 2 — шаблоны (legacy)

```yaml
participants_template: random_group   # couple | random_one | random_group
participants_min: 2                   # только для random_group
participants_max: 4
```

---

### Фильтры участников

Фильтры — рекурсивное булево дерево.

#### Листья (простые условия)

```yaml
filter:
  profession: Врач          # по названию или ID профессии
  health: Здоров
  gender: male              # алиасы: male → Мужчина, female → Женщина
  hobby: Чтение
  phobia: Огонь
  trait: Храбрый
  race: Человек
  body: Атлетическое
```

Значение может быть строкой или **списком** (любое из):
```yaml
filter:
  profession: [Врач, Целитель]
```

#### Группы (по тегу groups из конфига)

```yaml
filter:
  profession_group: medic           # строка или список
  health_group: [injured, disease]
  hobby_group: creative
```

#### Булевые операторы

```yaml
filter:
  all:
    - profession_group: fighter
    - not:
        health_group: injured

filter:
  any:
    - gender: male
    - profession_group: medic

filter:
  not:
    health: Здоров
```

#### Скриптованные фильтры

Переиспользуемые фильтры из `_scripted_filters.yaml`:

```yaml
filter:
  scripted: medic        # имя фильтра из SCRIPTED_FILTERS
```

---

### Вес эвента

```yaml
weight: 2.0              # относительный вес в пуле выбора (по умолчанию 1.0)
```

Чем выше вес — тем чаще эвент выпадает. Значения относительные: эвент с `weight: 2.0` выпадает вдвое чаще, чем с `weight: 1.0`.

### Шансы

```yaml
base_chance: 0.10        # шанс успеха без ресурсов (0.0–1.0)
                         # если не указан — эвент passive (нет выбора игрока)
```

Шансы с ресурсами (1/2/3+ профессий или предметов) берутся из `_settings.yaml`.

---

### Лейблы выбора (вместо шанса)

Заменяет `base_chance`. Игроки голосуют кнопками, большинство побеждает.

```yaml
choice_labels:
  success: Впустить       # текст кнопки «успех»
  failure: Отказать       # текст кнопки «провал»
```

---

### Эффекты

```yaml
success_effects:         # применяются при успехе (или для passive/narrative)
  - ...
failure_effects:         # применяются при провале
  - ...
```

#### `survival_change` — изменение шанса выживания

```yaml
- type: survival_change
  value: 10              # положительное = рост, отрицательное = падение
```

#### `food_change` — изменение еды

```yaml
- type: food_change
  value: 300             # абсолютное добавление (рационы)
  value: -20             # отрицательное = потеря в процентах от текущего запаса
```

#### `kill_participant` — убить участника

```yaml
- type: kill_participant
  target: patient        # имя роли, или each_participant (все участники)

- type: kill_participant
  target: each_participant
  per_target_chance: 0.5   # вероятность смерти каждого (0.0–1.0)
```

#### `kill_random_active` — убить случайного неучастника

```yaml
- type: kill_random_active
  chance: 0.4            # вероятность срабатывания (опционально)
```

#### `remove_room` / `add_room` — изменить бункер

```yaml
- type: remove_room      # удаляет случайную комнату
- type: add_room         # добавляет новую комнату
```

#### `add_player` — добавить персонажа

```yaml
- type: add_player
  character_type: full   # full (взрослый) или child (ребёнок)
  name_template: "Ребёнок {context.mother_name}"   # опционально
  race_from_context: mother_race_id                 # ключ контекста для расы (только child)
```

#### `schedule_event` — запланировать будущий эвент

```yaml
- type: schedule_event
  event_id: birth        # ID эвента для запуска
  delay_months: 9        # через сколько месяцев
  context_from_participants:     # передать данные участников в контекст
    mother: mother        # ключ контекста: роль участника
    father: father
```

В тексте запланированного эвента доступно `{context.mother_name}`, `{context.father_name}`, `{context.mother_id}` и т.д.

#### `if` — условный эффект

```yaml
- type: if
  condition:
    participant: doctor   # проверяем участника с этой ролью
    filter:
      scripted: medic     # фильтр как обычно
  then:
    - type: survival_change
      value: 20
  else:
    - type: survival_change
      value: 5
```

Условия по состоянию игры:
```yaml
condition:
  game: survival_below
  value: 30              # также: survival_above, food_below, player_count_below
```

---

### Цепочки эвентов

```yaml
chain_success: event_id_on_success   # запускается после успешного разрешения
chain_failure: event_id_on_failure   # запускается после провала
```

Следующий эвент обычно имеет `event_type: narrative`.

---

## Полный пример

Сложный эвент с ролями, фильтром, цепочкой и условным эффектом:

```yaml
# Инфекция — интерактивный эвент с врачом и пострадавшим
- id: infection_spreads
  title:
    - Инфекция в бункере
    - Заражение
    - Болезнь среди выживших
  description:
    - >-
      {patient} слёг с {alt.symptoms}. Без срочного вмешательства болезнь
      перекинется на остальных. У нас есть {alt.window}, чтобы что-то сделать.
    - >-
      Резкое ухудшение состояния {patient} не оставляет времени на раздумья.
      Симптомы — {alt.symptoms}. Что сделает группа прямо сейчас?
  alt:
    - symptoms:
        - сильный жар и судороги
        - кашель с кровью и слабость
        - потеря сознания и высокая температура
      window:
        - несколько часов
        - до следующего утра
        - максимум сутки
  base_chance: 0.08
  participants:
    - role: patient
    - role: doctor
      optional: true
      filter:
        scripted: medic
  success_effects:
    - type: if
      condition:
        participant: doctor
        filter:
          scripted: medic
      then:
        - type: survival_change
          value: 20
      else:
        - type: survival_change
          value: 8
  failure_effects:
    - type: survival_change
      value: -15
    - type: kill_participant
      target: patient
      per_target_chance: 0.6
  chain_success: infection_contained
  chain_failure: infection_fatal

# Нарратив при успехе
- id: infection_contained
  event_type: narrative
  title: Инфекция побеждена
  description: >-
    Благодаря своевременным мерам болезнь остановлена.
    Пострадавший идёт на поправку. Бункер немного выдохнул.
  success_effects:
    - type: survival_change
      value: 3

# Нарратив при провале
- id: infection_fatal
  event_type: narrative
  title: Болезнь победила
  description: >-
    Спасти не удалось. Тело вынесли из жилого отсека,
    а в воздухе повисло мрачное молчание.
  success_effects:
    - type: survival_change
      value: -5
```

---

## Советы

- Один файл может содержать несколько эвентов (список через `- id:`). Удобно для цепочек.
- Если файл содержит один эвент — `id:` пишется без `-` в начале (см. `skill_training.yaml`).
- `chain_*` эвенты не попадают в общий пул — они запускаются только явно через цепочку.
- `passive` эвент не требует взаимодействия: отображается игрокам и автоматически закрывается.
- Для событий без участников просто не указывай `participants` / `participants_template`.
