# Sabbatical — narrative exploration / visual novel

Спокойная браузерная игра: **карта острова + диалоги по Twine**.
Без сборщика. Без npm. Только HTML / CSS / vanilla ES-modules — кладётся
на GitHub Pages или itch.io «как есть».

Source of truth для движка диалогов и сцены:
[`agents.md`](./agents.md) и [`style.md`](./style.md). Здесь описан
**игровой слой поверх** — карта, перемещение, режимы.

---

## Запуск локально

```bash
# любой статический сервер, например:
python3 -m http.server 8080
# затем открыть http://localhost:8080
```

Файлы напрямую открыть `file://` нельзя: ES-модули и `fetch()` требуют
HTTP(S).

---

## Архитектура

```
index.html
styles.css
README.md
agents.md          ← source of truth: parsing, dialogue, commands
style.md           ← source of truth: scene/panel/portraits/typography

/src
  main.js          ← оркестратор: связывает экраны и системы
  state.js         ← centralized state + localStorage save
  localization.js  ← UI dict + story loader, hot language switch
  transitions.js   ← fade/screen helpers (no business logic)
  commands.js      ← обработчик //... директив (фон, показать, ...)
  twineLoader.js   ← Twine JSON → внутренний граф {steps, choices}
  twinePassages.js ← пассажи Day N и привязка к календарному дню
  dialogue.js      ← движок диалога (typewriter, speaker, choices)
  scene.js         ← фон + слоты персонажей (DOM-слой, по style.md)
  map.js           ← карта: marks, player, layout
  movement.js      ← анимация по именованному SVG-пути

/data
  locations.json   ← все локации, пути, координаты
  gameState.json   ← шаблон начального состояния (документация)

/assets
  /backgrounds     ← интерьеры/экстерьеры локаций (имя = id ассета)
  /characters      ← портреты (имя = идентификатор в реплике)
  /intro           ← intro1.png (заставка, опционально)
  /map             ← map.png, path2.svg, mark.png, player.png, dot1.png
  /lang            ← ru.json, en.json — UI dictionary
  /twine           ← ru.json, en.json — экспорт Twine, одна и та же
                     схема пассажей в обоих языках
```

### Separation of concerns

| Система       | Файлы                              | Не знает про              |
| ------------- | ---------------------------------- | ------------------------- |
| Map           | `map.js`, `movement.js`            | диалоги, Twine            |
| Dialogue      | `dialogue.js`, `twineLoader.js`, `commands.js` | карту, координаты |
| Scene         | `scene.js`                         | пассажи, выбор, состояние |
| State         | `state.js`                         | DOM                       |
| UI/i18n       | `localization.js`, `transitions.js`| сюжет                     |

`main.js` — единственное место, где модули собираются вместе.

---

## State machine

```
gameState.screen ∈ { splash | intro | modeSelect | map | location }
gameState.mode   ∈ { story  | free }
```

Поток:

```
BOOT
  ↓
SPLASH (язык, Continue если есть save)
  ↓
INTRO (intro1.png + текст)
  ↓
MODE SELECT (story / free)
  ↓
MAP                          ←──────────┐
  ↓                                     │
WALK ALONG SVG PATH                     │
  ↓                                     │
LOCATION (background + chars + dialog)  │
  ↓                                     │
LEAVE  ─────────────────────────────────┘
```

Сохраняется автоматически (debounced) в `localStorage`
ключом `sabbatical_save_v1`.

---

## Twine integration

Диалоги авторятся в Twine, экспортируются «Twine to JSON»:

```json
{
  "passages": [
    {
      "name": "yellowhouse_intro",
      "text": "//фон houseyellowinside\n//показать msyellow\nmsyellow: Заходи…",
      "links": [{ "name": "Спросить про синий дом", "link": "yellowhouse_about_blue" }]
    }
  ]
}
```

Правила тела пассажа (`agents.md`):

1. **`alien1: реплика`** — реплика говорящего `alien1`.
   Префикс становится `data-speaker` на DOM-строке и ключом для
   `assets/characters/alien1.png|jpg`.
2. **`//что сделать`** — команда движку. Не печатается. См. ниже.
3. Строка без `id:` — рассказчик.
4. Одна реплика на экран; кнопка «Дальше» появляется, если в пассаже
   есть ещё строки.
5. После последней строки — выборы из `links` либо «конец ветки».

### Поддерживаемые команды

| Глагол                 | Что делает                            | Пример              |
| ---------------------- | ------------------------------------- | ------------------- |
| `фон` / `background`   | меняет фон сцены                      | `//фон houseyellowinside` |
| `показать` / `show`    | вводит персонажа на сцену             | `//показать msyellow` |
| `скрыть` / `hide`      | убирает персонажа                     | `//скрыть msyellow` |
| `clear`                | очищает сцену                         | `//clear`           |
| `флаг` / `flag` / `set`| ставит произвольный флаг              | `//флаг metBlue`    |

Неизвестная команда — `console.warn`, игра не падает.

### Смена языка на лету

`assets/twine/ru.json` и `assets/twine/en.json` должны иметь **одинаковые
имена пассажей** — переводится только `text` и подписи `links.name`.
При смене языка движок перезагружает story-граф и перерисовывает текущий
пассаж по имени.

### Пассажи по дням и порядку события (`day N.M. <локация>`)

Сюжетные сцены на 2-й, 3-й и следующие дни — **отдельные пассажи** в Twine.
Имя — `day N.M. <локация>`, где **`N`** — номер календарного дня,
**`M`** — очередность события для прохождения в «Истории» (разделители —
пробел или точка, регистр не важен):

| Имя в Twine       | Что значит                          |
| ----------------- | ----------------------------------- |
| `Blue house`      | сцена по умолчанию (день 1, повторы)|
| `day 2.1. blue`   | день 2, **первое** событие          |
| `day 2.2 green`   | день 2, **второе** событие          |
| `day 3.1. green`  | день 3, первое событие              |

**Последовательность — своя на локацию (свободный режим).** Движок
хранит прогресс по локации (`locationSceneProgress`: сколько её сцен
сыграно) и при входе показывает **следующую ещё не виденную** сцену.
Пропуск сцены в «свой» день её не сжигает: не зашёл к Синему в 1-й день
→ при первом визите всё равно сыграет сцену 1-го дня, при следующем
визите — сцену 2-го дня, и т.д. Когда очередь кончилась, повторные
визиты показывают последнюю сцену. В режиме **«История»** сохраняется
привязка к календарному дню и маршруту.

Очередь сцен локации = `twinePassage` + значения `twinePassageByDay`
по возрастанию дня. В `data/locations.json`:

```json
"twinePassage": "Blue house",
"twinePassageByDay": { "2": "day 2.1. blue" }
```

Маршрут режима «История» на день N: `storyOrder` (день 1),
`storyOrderDay2`, `storyOrderDay3`, … порядок сцен внутри дня — число `M`.
Очередь сцен — `src/twinePassages.js` (`getLocationSceneSequence`),
выбор пассажа — `src/main.js` (`resolveTwinePassage`), маршрут по дням —
`src/storyMode.js`, прогресс по локации — `locationSceneProgress` в `src/state.js`.

---

## Map system

### Координаты

Все позиции хранятся в `data/locations.json` в координатах исходной
картинки (`mapSize.width × mapSize.height`, по умолчанию 1402×1122 — как
у `assets/map/map.png`). На экран они проецируются через `getMapMetrics()`
(учитывает `object-fit: contain`), так что в DOM никаких пикселей не
хардкодится.

### Пути

Перемещение — поверх **именованных SVG paths** в `assets/map/path2.svg`.
SVG имеет тот же viewBox, что и `map.png`. Для каждого ребра графа в
`locations.json` указан `svgPathId`:

```json
{ "from": "yellowhouse", "to": "bluehouse", "svgPathId": "path_yellowhouse_bluehouse" }
```

Алгоритм движения (`movement.js`):

1. Загрузить `path2.svg` в скрытый контейнер DOM.
2. У нужного `<path>` взять `getTotalLength()` и насэмплировать точки
   через `getPointAtLength()` — координаты возвращаются в viewBox.
3. Если ближайший конец пути — это **«куда»**, развернуть массив
   (мы всегда движемся **от** `fromCoord` **к** `toCoord`).
4. Кадр за кадром линейно интерполировать между сэмплами,
   `easeInOutSine`, длительность пропорциональна длине пути.
5. По мере движения раскладывать `dot1.png` поверх пройденного отрезка.

Pathfinding нет — пути авторские и заранее заданы.

### Режимы доступности

`map.js → isMarkVisible / canTravelTo`:

- **story** — видны только `unlockedLocations` ∪ `visitedLocations`.
- **free** — видны все локации с `availableInStoryMode !== false`.

Двинуться можно только в **соседнюю** локацию (по `connectedLocations`)
и только если она доступна в текущем режиме.

---

## Добавить новую локацию

1. Положи ассеты:
   `assets/backgrounds/houseFOO[inside|out].png` (см. конвенцию ниже).
2. В `data/locations.json` добавь запись:
   ```json
   {
     "id": "foo",
     "title": { "ru": "…", "en": "…" },
     "mapPosition": { "x": 900, "y": 400 },
     "id": "foohouse",
     "connectedLocations": ["yellowhouse"],
     "availableInStoryMode": true,
     "characters": ["mrfoo"],
     "twinePassage": "foo_intro"
   }
   ```
   Для сюжета на день 2+ добавь `"twinePassageByDay": { "2": "day 2.1. foo" }`
   и пассаж в Twine с именем `day N.M. …` (см. раздел «Пассажи по дням»).
3. Добавь обратную связь в `connectedLocations` соседа.
4. В `assets/map/path2.svg` добавь `<path id="path_yellowhouse_foo" …/>`
   с реальной геометрией (можно нарисовать в Figma/Inkscape, сохранить).
5. В `data/locations.json → paths` опиши ребро:
   ```json
   { "from": "yellowhouse", "to": "foo", "svgPathId": "path_yellowhouse_foo" }
   ```
6. В `assets/twine/ru.json` и `…/en.json` добавь пассаж `foo_intro`.

### id локации и фоны

**id** в `data/locations.json` совпадает с цветом/типом места; файлы фона подставляются в `src/locationAssets.js`:

| id | Файл снаружи | Внутри (при входе) |
| --- | --- | --- |
| `{color}house` | `house{color}out.png` | `house{color}inside.png` |
| `beach`, `bar`, `lighthouse` | `{id}.png` | — |
| `forest`, `thicket` | `forrest.png` | — |

Примеры: `bluehouse` → `houseblueout` / `houseblueinside`, `redhouse` → `houseredout` / `houseredinside`.

Подписи на карте (ru) могут не совпадать с id — это задумано. Старт сюжета: `redhouse` (Красный дом на карте).

Команда `//фон …` в Twine переопределяет фон в диалоге. Старые сохранения (v1) после смены id лучше сбросить («Новая игра»).

### Конвенция имён ассетов

| Слой        | Где             | Имя файла                       |
| ----------- | --------------- | ------------------------------- |
| персонажи   | `assets/characters/` | `{id}.png` (или `.jpg`)    |
| локации     | `assets/backgrounds/` | `house{color}{out\|inside}.png`, `beach`, `forrest`, `bar`, `lighthouse` |
| карта       | `assets/map/`   | `map.png`, `path2.svg`, `mark.png`, `player.png`, `dot1.png` |
| интро       | `assets/intro/` | `intro1.png` (опционально)      |

Если файла нет — `console.warn` + placeholder, игра не падает.

---

## Добавить нового персонажа

1. Положи `assets/characters/{id}.png` (или `.jpg`).
2. Используй `{id}` как префикс реплики в Twine: `{id}: текст`.
3. В `styles.css` можно добавить свою цветную полоску слева от строки:
   ```css
   .panel__line[data-speaker="{id}"] { border-left-color: #abc; }
   ```
4. Чтобы персонаж появился на сцене явно — `//показать {id}` в пассаже.

---

## Локализация

`assets/lang/{ru,en}.json` — словарь UI. Все строки в HTML, у которых
есть `data-i18n="some.key"`, заменяются в `applyDomI18n()`.
Никаких сюжетных строк в локалях быть не должно.

Переключение языка на лету:

```js
import { setLanguage } from './src/localization.js';
await setLanguage('en');
```

Слушатель в `main.js` перезагрузит story-граф и перерисует текущий
пассаж/карту.

---

## Сохранения

`state.js` дебаунсит `localStorage.setItem(SAVE_KEY, JSON.stringify(state))`.
Кнопка **Continue** на splash активна, если в `localStorage` есть запись.
Кнопка **New Game** (в меню) — `clearSave()` + сброс состояния.

---

## Доступность

- `prefers-reduced-motion: reduce` — выключает typewriter (мгновенная
  печать), убирает «fade» переходы.
- Все интерактивные элементы — `<button>`, фокус-кольца браузера не
  отключены.
- Esc — открыть/закрыть меню на `map` и `location`.

---

## Что в этом vertical slice уже работает

- 2 сюжетные точки (`beach`, `redhouse`) и авто-фоны по id
- 1 SVG-путь между ними
- Полный цикл: splash → intro → mode select → map → walk → location
  → диалог с выборами → leave → map
- 2 говорящих персонажа (`msyellow`, `mrblue`)
- Story mode и Free mode
- Сохранение/загрузка/новая игра
- Смена языка RU/EN на любом экране, включая середину диалога

Дальше расширяется без переписывания: добавляешь локации в
`locations.json`, пути в `path2.svg`, пассажи в `twine/{lang}.json`.

---

## Сбор email (форма вейтлиста в конце демо)

Форма в конце демо отправляет введённый email на **endpoint**, который ты
укажешь в одной константе:

```js
// src/devEnd.js
const WAITLIST_ENDPOINT = "";  // ← вставь сюда URL своего сервиса
```

Пока строка пустая — email только сохраняется локально в браузере игрока
(`localStorage`, ключ `sabbatical_waitlist_email`) и никуда не уходит. Как
только вставишь URL, письма начнут приходить в выбранный сервис. Сайт
статический (GitHub Pages), поэтому backend не нужен — используем готовый
сервис форм или бесплатный Google-скрипт. Формат отправки:

```
POST <endpoint>
Content-Type: application/json
{ "email": "...", "source": "sabbatical-demo", "ts": "2026-01-01T..." }
```

Выбери **один** из вариантов ниже.

### Вариант A — Formspree (проще всего, 5 минут)

1. Зарегистрируйся на <https://formspree.io> (бесплатный тариф — до 50
   писем/мес).
2. Создай новую форму (**New form**) → скопируй её endpoint вида
   `https://formspree.io/f/abcdwxyz`.
3. Вставь его в `src/devEnd.js`:
   ```js
   const WAITLIST_ENDPOINT = "https://formspree.io/f/abcdwxyz";
   ```
4. Задеплой сайт (обычный `git push` на GitHub Pages). Отправь тестовый
   email — он появится в разделе **Submissions** в панели Formspree и
   продублируется тебе на почту.

Аналогично работают **Getform**, **Basin**, **Formcarry**, **Formspark** —
просто вставь их endpoint в ту же константу (все принимают JSON выше).

### Вариант B — Google Apps Script + Google Таблица (бесплатно, данные у тебя)

Так письма складываются в твою Google-таблицу без сторонних сервисов.

1. Создай Google-таблицу. В первой строке колонки: `timestamp`, `email`,
   `source`.
2. В таблице: **Расширения → Apps Script**. Вставь код и сохрани:

   ```js
   function doPost(e) {
     var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
     var data = {};
     try { data = JSON.parse(e.postData.contents); } catch (err) {}
     sheet.appendRow([new Date(), data.email || "", data.source || ""]);
     return ContentService
       .createTextOutput(JSON.stringify({ ok: true }))
       .setMimeType(ContentService.MimeType.JSON);
   }
   ```

3. **Развернуть → Новое развёртывание → тип «Веб-приложение»**.
   - «Выполнять от имени»: *Я*.
   - «У кого есть доступ»: *Все* (`Anyone`).
   - Скопируй URL вида
     `https://script.google.com/macros/s/AKfy.../exec`.
4. Вставь URL в `src/devEnd.js`:
   ```js
   const WAITLIST_ENDPOINT = "https://script.google.com/macros/s/AKfy.../exec";
   ```

> ⚠️ Из-за CORS браузер не сможет прочитать ответ Apps Script, но запись в
> таблицу всё равно произойдёт. Если в консоли видишь ошибку CORS, а строки
> в таблице **добавляются** — всё в порядке. Хочешь убрать ошибку в консоли —
> замени в `submitWaitlistEmail` (`src/devEnd.js`) вызов `fetch` на
> «fire-and-forget»:
> ```js
> await fetch(WAITLIST_ENDPOINT, {
>   method: "POST",
>   mode: "no-cors",
>   headers: { "Content-Type": "text/plain;charset=utf-8" },
>   body: JSON.stringify({ email, source: "sabbatical-demo", ts: new Date().toISOString() }),
> });
> return true; // ответ прочитать нельзя, считаем успехом
> ```

### Проверка

Открой демо, дойди до формы (или временно вызови её), введи email, нажми
«Отправить». Успех — показывается «Спасибо…», письмо появляется в
сервисе/таблице. Ошибка сети — показывается «Не удалось отправить…», форма
остаётся для повтора (строки `devEnd.thanks` / `devEnd.error` в
`assets/lang/{ru,en}.json`).

---

## Аналитика (Google Analytics 4)

Игра отправляет события в GA4 через основной Google Tag в `index.html`.

### Настройка (5 минут)

1. Создай свойство GA4 на [analytics.google.com](https://analytics.google.com/)
   (тип потока: **Веб**).
2. Скопируй **Measurement ID** вида `G-XXXXXXXXXX`.
3. Замени Measurement ID в обоих местах основного тега в `index.html`.
4. Задеплой и проверь в GA4 → **Отчёты → В реальном времени** — нажми
   «Начать приключение» на сайте, событие должно появиться за ~30 секунд.

### Отправляемые события

| Событие | Когда | Параметры |
|---------|-------|-----------|
| `game_session_begin` | Первый запуск игры после открытия страницы | `language`, `engagement_seconds` |
| `start_journey` | Клик «Начать приключение» на заставке | `language`, `engagement_seconds` |
| `mode_select` | Выбор «История» или «Свободное исследование» | `game_mode` (`story` / `free`), `language`, `engagement_seconds` |
| `day_complete` | Завершение календарного дня 1–4 | `day_number` (1–4), `language`, `engagement_seconds` |
| `waitlist_submit` | Успешная отправка email из формы | `language`, `engagement_seconds` |
| `play_session_end` | Уход со вкладки / закрытие (если сессия ≥ 5 с) | `language`, `engagement_seconds` |

Язык интерфейса (`ru` / `en`) передаётся в каждом событии — можно
сегментировать отчёты.

Код событий: `src/gtagEvents.js`. Точки вызова: `src/main.js` (старт, режим, дни),
`src/devEnd.js` (форма).

### Воронка прохождения

В GA4 → **Исследования (Explore)** → шаблон **Воронка**:

1. `start_journey`
2. `mode_select`
3. `day_complete` с фильтром `day_number = 1`
4. `day_complete` с фильтром `day_number = 2`
5. `day_complete` с фильтром `day_number = 3`
6. `day_complete` с фильтром `day_number = 4`
7. `waitlist_submit`

Так видно, на каком шаге игроки отваливаются. Дополнительно можно
построить воронку только для `game_mode = story` или `free` (фильтр на шаге
`mode_select`).

### Время прохождения

- **Среднее время на сайте:** Отчёты → Вовлечённость → Страницы и экраны →
  «Среднее время взаимодействия».
- **Время до конкретного шага:** в Исследованиях создай отчёт **Свободная
  форма** — измерение `Имя события`, метрика `Среднее engagement_seconds`
  (параметр события). Сгруппируй по `day_number` или смотри на
  `waitlist_submit`.
- **`play_session_end`** — суммарное время сессии при уходе со страницы
  (дополняет встроенный учёт GA4).

### Отладка в браузере

1. Установи расширение [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephafjilhbla) или открой DevTools → Network → фильтр `collect`.
2. Убедись, что в основном теге в `index.html` указан реальный `G-…` ID.
3. События уходят на `google-analytics.com/g/collect` — в payload будут
   `en=start_journey`, `en=mode_select` и т.д.

### Конфиденциальность

Аналитика не собирает email из формы, только факт успешной отправки
(`waitlist_submit`). Чтобы отключить аналитику, удали основной Google Tag из
`index.html`.
