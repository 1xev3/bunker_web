# Handoff: рефакторинг интерфейса на shadcn/ui + Radix

Актуально на 18 сентября 2026 года. Документ предназначен для агента, который продолжит работу без истории предыдущего диалога.

## Исходная задача и ограничения

Нужно полностью унифицировать `client/` в индустриально-бункерном стиле на shadcn/ui/Radix, сохранив React 19, Vite, Tailwind CSS 4, текущие HTTP/WebSocket-протоколы, русские тексты, восстановление сессии и игровую логику. Серверные правила менять нельзя. Светлая тема, звуки и React Router не нужны.

Финальное состояние должно не содержать в feature-компонентах прямых `<button>`, `<input>`, `<select>`, самодельных модальных overlay и старых `btn-*`/`card`-классов. Опасные подтверждения должны использовать AlertDialog, мобильные панели — Sheet, обычные модальные окна — Dialog.

Полный исходный план был передан пользователем в предыдущем запросе. Этот handoff фиксирует фактическое состояние реализации: работа начата, но ещё не завершена.

## Что уже сделано

### Зависимости и конфигурация

- В `client/package.json` и lock-файл добавлены Radix-пакеты для Dialog, AlertDialog, Checkbox, DropdownMenu, Progress, ScrollArea, Select, Separator, Slider, Slot, Switch, Tabs и Tooltip.
- Добавлены `class-variance-authority`, `clsx`, `tailwind-merge`.
- Добавлены Vitest, jsdom, React Testing Library, user-event, jest-dom и coverage-пакет.
- Добавлен клиентский script `npm test` (`vitest run`).
- Vitest настроен в `client/vite.config.ts`, setup находится в `client/src/vitest.setup.ts`.
- В `client/tsconfig.app.json` добавлены типы Vitest/jest-dom.
- Для файлов примитивов отключено только правило `react-refresh/only-export-components` в `client/eslint.config.js`, поскольку shadcn-подобные модули экспортируют компоненты и варианты рядом.

### Базовая UI-система

Созданы или обновлены:

- `client/src/lib/utils.ts` — `cn()` на clsx + tailwind-merge.
- `components/ui/Button.tsx` — варианты `primary`, `secondary`, `danger`, `ghost`; размеры `sm`, `md`, `lg`, `icon`; `loading`, `disabled`, `asChild`, `className`.
- `Input.tsx`, `Textarea.tsx`.
- `Card.tsx`, `Badge.tsx`.
- `Checkbox.tsx`, Radix-версия `ToggleSwitch.tsx`, `Slider.tsx`.
- `Progress.tsx`, `Tabs.tsx`, `Separator.tsx`, `ScrollArea.tsx`.
- `Tooltip.tsx`, `DropdownMenu.tsx`.
- `Dialog.tsx`, `AlertDialog.tsx`, `Sheet.tsx`.

`main.tsx` оборачивает приложение в `TooltipProvider`.

Старый `components/ui/Modal.tsx` теперь является совместимым адаптером поверх Radix Dialog. Благодаря этому существующие админские модалки получили Portal, focus trap, Escape, блокировку внешнего фокуса и восстановление фокуса без изменения их публичного API.

`SecretGoalModal.tsx` переведён на новые Dialog и Button.

### Тема и доступность

В `index.css` добавлены семантические переменные `background`, `surface`, `surface-raised`, `border`, `foreground`, `muted`, `danger`, `success`, `warning`. Динамические `--accent` и `--accent-rgb` сохранены.

Основной шрифт переключён на системный читаемый sans-serif. JetBrains Mono оставлен для `.font-mono`, `code`, `kbd`, `samp`, `pre` и служебных значений.

Добавлен глобальный `prefers-reduced-motion: reduce`, практически отключающий анимации и transitions.

### Навигация

Ручной двухмаршрутный роутинг вынесен из `App.tsx` в `client/src/lib/navigation.ts`. Семантика URL не изменена; React Router не добавлялся.

### Тесты

`client/src/components/ui/ui.test.tsx` содержит 5 тестов:

- loading/disabled/aria-busy у Button;
- закрытие Dialog по Escape и восстановление фокуса;
- доступное имя и отмена AlertDialog;
- открытие Sheet;
- управление Switch с клавиатуры.

## Что проверено

На момент создания handoff успешно проходили:

```bash
rtk npm test                              # корень: 59 server-тестов
rtk npm test                              # client/: 5 UI-тестов
rtk npm run lint                          # client/
rtk npm run build                         # client/
```

Последняя сборка Vite успешна. Серверные тесты выводят ожидаемые сообщения об ошибочных ответах AI в тестах fallback, но завершаются с 59/59.

Важно: `node --test` автоматически подхватывает файлы внутри каталога с именем `test`, поэтому Vitest setup был намеренно перенесён из `client/src/test/setup.ts` в `client/src/vitest.setup.ts`. Не возвращать его в каталог `test`, иначе корневой `npm test` упадёт из-за отсутствующего `window`.

## Что осталось сделать

### 1. Закончить миграцию всех feature-компонентов

Прямые controls всё ещё есть как минимум в:

- `lobby/WelcomeScreen.tsx`, `lobby/GameLobby.tsx`;
- `PackEditorPage.tsx`;
- `game/GameRoom.tsx`, `CharacterCard.tsx`, `CharacterDossiers.tsx`;
- `admin/AdminPanel.tsx`;
- `bunker/BunkerIntroScreen.tsx`, `BunkerInfo.tsx`, `BunkerEndScreen.tsx`;
- `bunkerLife/BunkerLifeScreen.tsx`, `EventOutcomeModal.tsx`;
- `event/ChoiceEventCard.tsx`, `FoodReplenishCard.tsx`, `PassiveEventCard.tsx`, `EventHelpPanel.tsx`.

Перед завершением проверить:

```bash
rtk rg -n '<(button|input|select|textarea)' client/src --glob '*.tsx'
```

Внутри самих UI-примитивов и тестов нативные элементы допустимы. В feature-компонентах заменить их на Button/Input/Textarea/Checkbox/Switch и Radix Select. Текущий `components/ui/Select.tsx` всё ещё является стилизованным нативным `<select>` и должен быть заменён полноценным Radix Select API; после этого мигрировать всех его потребителей.

### 2. Перевести оставшиеся overlays

Несколько событийных экранов всё ещё создают собственные `fixed inset-0` оболочки:

- `event/PassiveEventCard.tsx`;
- `event/FoodReplenishCard.tsx`;
- `event/ChoiceEventCard.tsx`;
- `bunkerLife/EventOutcomeModal.tsx`.

Их нужно перевести на Dialog. Мобильную часть `AdminPanel.tsx` — на Sheet. Подтверждения через `window.confirm` находятся в `AdminPanel.tsx` и `game/VotingModal.tsx`; заменить на AlertDialog. Инлайн-подтверждение окончания игры в AdminPanel тоже лучше унифицировать через AlertDialog.

### 3. Удалить legacy CSS только после миграции потребителей

В `index.css` пока намеренно остались:

- `.btn-primary`, `.btn-danger`;
- `.card`;
- `.connection-overlay*`;
- старые `.toggle-switch*` правила, которые после Radix-миграции, вероятно, уже не используются;
- ряд feature-specific классов.

Сначала заменить потребителей, затем выполнить поиск и удалить мёртвые правила:

```bash
rtk rg -n 'btn-|className="card|connection-overlay|toggle-switch' client/src
```

Connection-lost overlay в `GameApp.tsx` следует сделать через недисмиссируемый Dialog или отдельный доступный status-overlay, сохранив `role="alert"`/`aria-live`.

### 4. Декомпозировать `GameApp`

`client/src/GameApp.tsx` остаётся примерно 500-строчным application-controller. В нём одновременно находятся:

- WebSocket lifecycle;
- heartbeat/reconnect;
- rejoin/spectator session и localStorage;
- URL/history и leave с `window.location.reload()`;
- transient UI: voting result, winner, event outcome, monthly notice, connection lost, bunker intro, secret goal;
- выбор текущего экрана.

Нужно выделить типизированный `useGameSession`/`useWebSocketSession`, который предоставляет как минимум `connect`, `send`, `leave`, статус соединения, `myPlayerId`, spectator/session data. Авторитетный reducer в `hooks/useGameState.ts` сохранить. Отдельно вынести локальное flow/UI-состояние или shell, не добавляя глобальный state manager.

Особенно сохранить текущую семантику:

- heartbeat 10 секунд и timeout 15 секунд;
- reconnect через 2 секунды;
- rejoin по `bunker_token`;
- spectator reconnect по `bunker_spectate_room`;
- очистку storage при expired token/kick/leave;
- pushState с `?room=` и обработку Back;
- восстановление missed event outcome из `roomState.pending_outcome`;
- одноразовые bunker intro и secret goal через sessionStorage.

`WS_DEBUG` сейчас равен `true`; при рефакторинге сделать dev-only или выключить для production.

### 5. Декомпозировать крупные экраны

Основные кандидаты:

- `WelcomeScreen.tsx`: landing/create/join/invite/list rooms и polling;
- `GameLobby.tsx`: настройки ведущего, capabilities, игроки и tabs;
- `BunkerIntroScreen.tsx`: staged cinematic и таймеры;
- `ChoiceEventCard.tsx`: выборы, расчёты, голоса и сложная разметка;
- `BunkerLifeScreen.tsx`: dashboard, события, outcome и notices.

Выносить feature-local секции и вычисления, не менять сетевые типы/команды.

### 6. Расширить тестирование

Текущие 5 тестов покрывают только примитивы. По исходному плану ещё нужны сценарии:

- вход, создание и подключение к комнате;
- настройки лобби;
- голосование и отмена;
- выбор в событии;
- подтверждение результата;
- потеря соединения/reconnect с fake WebSocket;
- loading/disabled/error;
- reduced-motion;
- focus/keyboard для каждой мигрированной модалки и Sheet.

Следует добавить mock WebSocket, localStorage/sessionStorage reset в setup и component/integration harness вокруг `GameApp` или выделенного session hook.

### 7. Визуальная проверка

Автоматическая визуальная проверка ещё не выполнялась. Проверить минимум 390, 768 и 1440 px: длинные имена, пустые списки, переполнение, mobile Sheet, все игровые фазы и паки с разными accent-цветами.

## Архитектурные риски

- Не переносить игровую логику на клиент: outcomes остаются серверными.
- Не менять `ClientMessage`, `ServerMessage`, `RoomState`, `Player` или форму WS-команд без реальной несовместимости.
- `GameApp.handleLeave()` вызывает reload; бездумное удаление изменит cleanup/rejoin поведение.
- Transient события частично обрабатываются в `GameApp`, а room state — в `useGameState`; при разделении не создать два конкурирующих источника истины.
- Event outcome может восстанавливаться из `pending_outcome` после reconnect — сохранить эту ветку.
- Radix Dialog сам рисует кнопку закрытия в `DialogContent`. `SecretGoalModal` сейчас дополнительно рисует собственную кнопку X, поэтому там визуально могут быть две кнопки закрытия. При следующем проходе либо добавить опцию `showCloseButton` в DialogContent, либо удалить локальную X-кнопку.
- Google Fonts импортирует только JetBrains Mono. Основной sans сейчас системный, поэтому внешняя загрузка Inter не требуется.
- Lock-файл сильно вырос из-за Radix/Vitest; это ожидаемо.

## Текущее состояние git

Изменения не закоммичены. Помимо модифицированных файлов есть новые `components/ui/*`, `client/src/lib/*`, `client/src/vitest.setup.ts` и UI-тест. Не выполнять reset/checkout: это рабочий результат текущего этапа.

Из-за ownership sandbox обычный `git status` может сообщать `dubious ownership`. Для read-only git-команд использовать:

```bash
rtk git -c safe.directory="C:/Users/diman/OneDrive/Рабочий стол/bunker_web" status --short
```

## Рекомендуемый порядок продолжения

1. Исправить двойную close-кнопку Dialog и реализовать полноценный Radix Select.
2. Мигрировать WelcomeScreen, PackEditorPage и GameLobby вместе с тестами.
3. Перевести AdminPanel на DropdownMenu/Sheet/AlertDialog.
4. Мигрировать GameRoom, карточки персонажей и VotingModal.
5. Перевести event/bunker-life overlays на Dialog и обновить тесты.
6. Выделить session hook из GameApp с characterization-тестами до и после переноса.
7. Удалить legacy классы, прогнать поиск прямых controls.
8. Выполнить визуальную проверку 390/768/1440.
9. Финально прогнать server tests, client tests, lint и build.

## Финальный набор команд

```bash
rtk npm test
rtk npm test --prefix client
rtk npm run lint --prefix client
rtk npm run build
rtk rg -n '<(button|input|select|textarea)' client/src --glob '*.tsx'
rtk rg -n 'btn-|className="card|connection-overlay|window\.confirm' client/src
```

