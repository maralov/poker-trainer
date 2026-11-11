# 6-max поруч з 9-max

Дата: 2026-11-11. Статус: узгоджено в брейнштормі, діапазони 6-max — чернетка
на рев'ю користувача.

## Мета

Тренажер уміє грати другий формат столу — 6-max кеш, 100bb. 9-max лишається
як є, гравець перемикає формат у шапці. Префлоп (усі чотири сценарії) і
постфлоп Етапу 2 працюють в обох форматах. Історія, ворота, Stats, Review і
drill рахуються окремо для кожного формату.

**Поза скоупом.** Хедзап. Префлоп HU — окремий наступний проект (третій
`TableConfig`). Постфлоп HU — ні: матриці «можу ставити» і профіль опонента
відкалібровані під вузькі діапазони; у HU (SB відкриває ~80%, BB захищає ~60%)
той самий `evaluate` радив би хибно. Це окрема перебудова матриць.

## Рішення

| # | Питання | Рішення |
|---|---|---|
| 1 | Як виразити формат в engine | `TableConfig` на формат, передається явним параметром. Не копія engine (два джерела істини), не глобальний стан (ламає чистоту engine) |
| 2 | Позиції 6-max | UTG, HJ, CO, BTN, SB, BB — підмножина наявного `Position`. Тип і check `hero_pos` у базі не змінюються |
| 3 | Ворота | `posCount` у конфігу: 9-max — 8 з 9, 6-max — 5 з 6. Решта порогів спільна. Вікно 150 рук окреме на формат |
| 4 | Дані | Колонка `table_size` в `attempts` і `postflop_attempts`, `default '9max'`. Усі стат-функції приймають `target_table` |
| 5 | Скидання | Окремо на формат: таблиця `user_reset (user_id, table_size)`. `delete_all_progress()` лишається глобальним |
| 6 | UI | Один перемикач у шапці, діє на всі сторінки, зберігається в localStorage пристрою, дефолт 9-max |
| 7 | Етап 2 | Відкривається воротами свого формату: пройдені ворота 9-max не відкривають постфлоп 6-max |
| 8 | Формат події | Спот і постфлоп-роздача несуть `table` — подія пишеться з форматом, у якому спот побудовано, а не з поточним станом перемикача |

## Engine

### `TableConfig` (`engine/tables.ts`)

```ts
type TableId = '9max' | '6max'
interface TableConfig {
  id: TableId
  label: string                 // '9-max' | '6-max'
  seats: readonly Position[]    // порядок дій префлопу
  openOrder: readonly Position[]
  isoOrder: readonly IsoPosition[]
  rfi: Record<string, ReadonlySet<Hand>>
  iso: Record<string, ReadonlySet<Hand>>
  tighter2: Partial<Record<Position, Position>>
  bucket: (p: Position) => RaiserBucket
  vsRaise: Record<RaiserBucket, VsRaiseDef>
  vs3bet: { raise; call; note }
  notes: Partial<Record<Position, string>>
  posCount: number              // для воріт
}
export const TABLES: Record<TableId, TableConfig>
```

`TABLES['9max']` збирається з наявних констант без зміни жодної руки:
фікстури `ref-spots-core.js` і `ref-postflop.json` лишаються регресійним
захистом. Старі експорти (`RFI`, `ISO`, `VS_RAISE`, …) лишаються як 9-max —
на них спираються тести референсу.

`disjoint` («колл = колл мінус рейз») застосовується до `vsRaise` обох форматів.

### Побудова спотів

`buildSpot({ table, … })`, `drillSpot(progress, scen, table, rng)`,
`buildPostSpot(table, …)` — `table` обовʼязковий. Індекси узагальнюються через
`n = table.seats.length`, так що для `n = 9` послідовність викликів `rng()`
збігається з поточною байт-у-байт:

| Сценарій | Зараз (9-max) | Узагальнено |
|---|---|---|
| rfi | `pick(ACTION_ORDER.slice(0, 8))` | `pick(seats.slice(0, n-1))` |
| iso | `hi = 1 + ⌊r·7⌋`, force: `min(7, max(1, i))` | `1 + ⌊r·(n-2)⌋`, `min(n-2, …)` |
| vsraise | `ri = ⌊r·7⌋`, `hi = ri+1+⌊r·(8-ri)⌋` | `⌊r·(n-2)⌋`, `ri+1+⌊r·(n-1-ri)⌋` |
| vs3bet | `hi = ⌊r·7⌋`, force `min(6, i)`, `ti = hi+1+⌊r·(8-hi)⌋` | `⌊r·(n-2)⌋`, `min(n-3, i)`, `hi+1+⌊r·(n-1-hi)⌋` |

`Spot.seats` лишається `Record<Position, …>`; позиції, яких за столом немає,
мають `null`. `Spot.table: TableId` — нове поле.

### Ворота, drill, review

- `gateStatus(recent, total, table)` — `table.posCount` замість `GATE.posCount`.
- `drillPool` фільтрує позиції за `table.seats`.
- `reviewScenario` і `buildReport` ітерують `table.seats`.

## Діапазони 6-max (чернетка)

Кумулятивно, як у 9-max. Частки комбо: UTG 15.1%, HJ 18.7%, CO 27.0%,
BTN 43.3%, SB 38.8%. Межі фіксує `engine/tables.test.ts`.

**RFI — що додається на кожній позиції**

| Позиція | Додається |
|---|---|
| UTG | `55+ A2s+ K9s+ Q9s+ J9s+ T9s 98s AJo+ KQo` |
| HJ | `44 33 K8s T8s 87s ATo KJo` |
| CO | `22 K5s-K7s Q8s J8s 97s 76s 65s A8o-A9o KTo QJo QTo JTo` |
| BTN | `K2s-K4s Q2s-Q7s J6s-J7s T6s-T7s 96s 86s 75s 64s 54s A2o-A7o K8o-K9o Q9o J9o T9o 98o` |
| SB | BTN мінус `A2o-A3o K8o 98o 64s Q2s-Q3s` (рейз або фолд) |

**ISO** = RFI мінус `WEAK_O` (як у 9-max). **TIGHTER2** (два лімпери — на дві
позиції тугіше): HJ→UTG, CO→UTG, BTN→HJ, SB→CO.

**Проти рейзу.** `EARLY` = UTG, `MID` = HJ і CO, `LATE` = BTN і SB.

| Опенер | 3-бет | Колл у позиції | Колл з SB | Колл з BB |
|---|---|---|---|---|
| EARLY | `QQ+ AKs AKo AQs` | `22-JJ ATs-AJs KJs-KQs QJs JTs T9s AQo` | `99-JJ AJs KQs` | `22-JJ A2s-AJs KTs+ QTs+ JTs T9s 98s 87s 76s AJo-AQo KQo` |
| MID | `JJ+ AQs+ AQo+ A4s-A5s` | `22-TT ATs-AJs KTs+ QTs+ JTs T9s 98s AJo KQo` | `88-TT AJs KQs` | `22-TT A2s-AJs K8s+ Q9s+ J9s+ T8s+ 97s+ 86s+ 76s 65s A9o-AJo KTo+ QTo+ JTo` |
| LATE | `99+ ATs+ KJs+ AJo+ A2s-A5s` | `22-88 A6s-A9s KTs QTs+ JTs T9s 98s ATo KQo KJo` | `66-88 A9s` | `22-88 A2s-A9s K5s+ Q7s+ J7s+ T7s+ 96s+ 85s+ 74s+ 64s+ 53s+ A2o-ATo K9o+ Q9o+ J9o+ T9o 98o` |

Колл описаний широкими токенами і перекривається з рейзом — `disjoint` знімає
перетин, як у 9-max.

**Проти 3-бету.** Замінено: група опенера × IP/OOP — див.
`2026-11-11-vs3bet-defense-design.md`. (Було: 4-бет `QQ+ AKs AKo A5s`,
колл `99-JJ AQs AJs KQs AQo` для будь-якого споту.)

**Підказки позицій** — свої тексти для 6-max (у 9-max «девʼять гравців за
спиною» тут хибне).

## Дані

### Міграція `six_max`

1. `attempts.table_size` і `postflop_attempts.table_size`:
   `text not null default '9max' check (table_size in ('9max','6max'))`.
   Наявні рядки стають 9-max через `default` — UPDATE-політики не потрібні.
2. Check: у 6-max `hero_pos` і `villain_pos` (та `postflop_attempts.hero_pos`)
   належать `{UTG, HJ, CO, BTN, SB, BB}`.
3. `user_reset (user_id, table_size, reset_at)`, PK `(user_id, table_size)`,
   RLS select/insert/update — лише своє, GRANT для `authenticated`.
   Наявна `user_settings.reset_at` переноситься як мітка `'9max'`; колонка
   лишається (не ламаємо старий клієнт до деплою), але більше не читається.
4. `current_reset_at(target_table)`, `reset_progress(target_table)` і всі
   стат-функції — `stats_totals`, `recent_attempts`, `mistakes`, `stats_summary`,
   `postflop_totals`, `postflop_summary`, `postflop_mistakes`,
   `postflop_drill_tail` — отримують `target_table text` і фільтрують по ньому.
   Старі сигнатури видаляються. `postflop_episode(id)` і `delete_all_progress()`
   не змінюються.

Після міграції — `npm run db:types`. Інтеграційні тести (`rls`, `reset`,
`sync`, `postflop`) розширюються: ізоляція форматів і відмова 6-max з `LJ`.

### Клієнт

- Подія в черзі несе `table_size`. Подія без поля (лежала в localStorage до
  оновлення) при відправці доповнюється `'9max'`.
- `fetchServerProgress(table)`, `fetchServerPostProgress(table)`,
  `resetServerProgress(table)`. Серверний кеш статистики памʼятає, для якого
  формату завантажений; при перемиканні — перечитується. Злиття з чергою бере
  лише події свого формату.
- `migrateLocalHistory` переносить журнал кожного формату зі своїм `table_size`.

## Стор

`progressStore` (persist `version: 4`):

```ts
tables: Record<TableId, { pre, post, postUnlocked, postSeen }>
```

Міграція v3→v4 кладе наявний стан у `tables['9max']`, `'6max'` — порожній.
Дії приймають формат: `answer(table, …)`, `reset(table)`, `resetPost(table)`.
`importLegacy` пише в `'9max'`.

`tableStore` (persist, ключ `poker_trainer_table`): `table: TableId`, дефолт
`'9max'`. Зміна формату скидає поточну сесію (спот і постфлоп-роздачу) без
запису відповіді.

## UI

- `TableSwitch` у шапці поруч з `AccountBar`.
- `PokerTable` садить `table.seats.length` місць; окрема CSS-розкладка для 6.
- Ranges, Stats, Review, GateLock, PostStats, PostReview читають поточний формат.
- Скидання прогресу в Stats скидає поточний формат (підпис кнопки називає
  формат).

## Тести

- Регресія 9-max: наявні тести діапазонів, спотів і постфлопу проходять без
  зміни очікувань; фікстури референсу збігаються.
- 6-max: відсотки RFI в межах цілей; рейз і колл не перетинаються; кожен спот
  кожного сценарію садить лише позиції 6-max і має непорожній діапазон;
  ворота відкриваються з 5 позиціями.
- Стор: міграція v3→v4 не губить прогрес; відповідь у 6-max не чіпає 9-max.
- База: ізоляція форматів у стат-функціях і скиданні; check відкидає 6-max з LJ.
