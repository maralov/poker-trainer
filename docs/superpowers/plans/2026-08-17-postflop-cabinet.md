# post-5 · Кабінет Етапу 2 — план реалізації

> **Для агентів:** виконувати крок за кроком (`superpowers:executing-plans`),
> кожна задача — окремий коміт `post-5: ...`.

**Мета:** Етап 2 отримує власні вкладки — «Схема рішень» (усі матриці §5 у
людському вигляді), «Статистика» (зрізи, які вже збираються, але ніде не
показані) і «Розбір» (патерни постфлоп-помилок + розгортання роздачі за
`episode_id`).

**Архітектура:** таблиці правил **генеруються з самих матриць** — перебираємо
всі комбінації вимірів, кличемо `decideBet`/`decideDefend`, зводимо однакові
клітинки в рядки. Тому екран правил не може розійтися з кодом, а тексти «чому» —
ті самі, що бачить учень у вердикті. Діагностика помилок живе в
`engine/postflop/postReview.ts` (правило 4 CLAUDE.md: SQL лише рахує), сторінки
рендерять готові дані.

**Стек:** TypeScript strict, vitest, React 19, Postgres (одна міграція).

**Рішення цієї фази** (2026-08-17): обсяг — весь кабінет разом із переглядом
роздачі; таблиці правил — генеровані, не рукописні.

---

## Файли

| Файл | Відповідальність |
|---|---|
| `web/src/engine/postflop/postRules.ts` | генератор таблиць правил із матриць §5 |
| `web/src/engine/postflop/postReview.ts` | класифікація постфлоп-помилок, звіт |
| `web/src/pages/PostRules.tsx` | вкладка «Схема рішень» |
| `web/src/pages/PostStats.tsx` | вкладка «Статистика» Етапу 2 |
| `web/src/pages/PostReview.tsx` | вкладка «Розбір» Етапу 2 |
| `web/src/App.tsx` | смужка вкладок Етапу 2, звуження хоткеїв |
| `web/src/engine/postflop/postProgress.ts` | лог помилок носить `ep`/`board`/`hand` |
| `supabase/migrations/*_postflop_review.sql` | `postflop_mistakes` + episode/board/hand, нова `postflop_episode` |
| `web/src/api/serverPostProgress.ts` | мапить нові колонки, тягне роздачу |

---

### Task 1: генератор таблиць правил

Ключова ідея: рядок таблиці ніколи не пишеться руками. Для кожної таблиці
перебираємо **повний** простір вимірів контексту, групуємо за оголошеними
вимірами, і для кожної категорії руки залишаємо лише ті виміри, які реально
змінюють рішення. Якщо матриця почне залежати від виміру, якого таблиця не
оголосила, тест повноти впаде — і це єдиний спосіб не дати екрану збрехати.

**Файли:**
- Create: `web/src/engine/postflop/postRules.ts`
- Test: `web/src/engine/postflop/postRules.test.ts`
- Modify: `web/src/engine/postflop/index.ts` (реекспорт)

- [ ] **Крок 1: тест, що падає**

```ts
import { describe, expect, it } from 'vitest'

import { decideBet } from './matrixBet'
import { decideDefend } from './matrixDefend'
import { RULE_TABLES, allBetContexts, allDefendContexts, betRowFor, defendRowFor } from './postRules'

describe('таблиці правил', () => {
  it('кожна таблиця має заголовок, посилання на джерело і рядки', () => {
    expect(RULE_TABLES.length).toBeGreaterThan(6)
    for (const t of RULE_TABLES) {
      expect(t.title.length, t.title).toBeGreaterThan(5)
      expect(t.source, t.title).toMatch(/§5/)
      expect(t.rows.length, t.title).toBeGreaterThan(0)
      for (const r of t.rows) {
        expect(r.action.length, `${t.title}/${r.cat}`).toBeGreaterThan(2)
        expect(r.why.length, `${t.title}/${r.cat}`).toBeGreaterThan(20)
      }
    }
  })

  // Головний тест фази: те, що показано на екрані, дорівнює тому, що вирішує
  // матриця — для КОЖНОГО контексту, а не для вибраних прикладів.
  it('дія в таблиці збігається з рішенням матриці для кожного контексту', () => {
    for (const t of RULE_TABLES) {
      if (t.kind === 'bet') {
        for (const c of allBetContexts(t)) {
          const row = betRowFor(t, c)
          expect(row, `${t.title}: нема рядка для ${JSON.stringify(c)}`).toBeDefined()
          expect(row?.action, t.title).toBe(ACT_LABEL[decideBet(c).action])
          expect(row?.why, t.title).toBe(decideBet(c).why)
        }
      } else {
        for (const c of allDefendContexts(t)) {
          const row = defendRowFor(t, c)
          expect(row, `${t.title}: нема рядка для ${JSON.stringify(c)}`).toBeDefined()
          expect(row?.action, t.title).toBe(ACT_LABEL[decideDefend(c).action])
          expect(row?.why, t.title).toBe(decideDefend(c).why)
        }
      }
    }
  })

  it('§5.1а: колер у позиції грає ту саму матрицю, що агресор', () => {
    // Тому окремої таблиці для нього немає — примітка на екрані каже правду.
    for (const cat of POST_CATEGORIES) {
      for (const texture of ['DRY', 'WET', 'PAIRED'] as Texture[]) {
        const base = { street: 'flop', cat, texture, events: QUIET, nOpps: 1, ip: true, delayed: false, madeFlush: false } as const
        expect(decideBet({ ...base, line: 'caller' })).toEqual(decideBet({ ...base, line: 'aggressor' }))
      }
    }
  })

  it('рядків не більше, ніж комбінацій — зведення справді зводить', () => {
    const flop = RULE_TABLES.find((t) => t.id === 'flop-hu')
    expect(flop).toBeDefined()
    // 7 категорій × 3 текстури × 2 позиції = 42 комбінації; людська таблиця
    // мусить бути помітно коротшою.
    expect(flop!.rows.length).toBeLessThan(14)
  })
})
```

(`ACT_LABEL` = `POST_ACT_LABEL`, `QUIET` — події борду без прапорців; імпорти з
`./types`.)

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/engine/postflop/postRules.test.ts`
Expected: FAIL — модуля `postRules` немає.

- [ ] **Крок 3: реалізація**

`postRules.ts`:

```ts
/**
 * Таблиці правил для екрана «Схема рішень».
 *
 * Рядки НЕ пишуться руками: для кожної таблиці перебирається повний простір
 * контекстів, дія і пояснення беруться з матриць §5. Тому екран не може
 * розійтися з рушієм — а якби матриця почала залежати від виміру, якого
 * таблиця не оголосила, це зловив би тест повноти (postRules.test.ts).
 */
```

Типи:

```ts
export type BetDim = 'texture' | 'ip' | 'delayed' | 'flush' | 'overcard'
export type DefendDim = 'street' | 'facing' | 'repeat'

export interface RuleRow {
  readonly cat: string
  readonly situation: string
  readonly action: string
  readonly why: string
}

interface TableBase {
  readonly id: string
  readonly title: string
  /** Розділ спеки — щоб на екрані було видно, звідки правило. */
  readonly source: string
  readonly rows: readonly RuleRow[]
}

export interface BetTable extends TableBase {
  readonly kind: 'bet'
  readonly street: Street
  readonly line: PostLine
  readonly nOpps: number
  readonly dims: readonly BetDim[]
}

export interface DefendTable extends TableBase {
  readonly kind: 'defend'
  readonly streets: readonly Street[]
  readonly facings: readonly Facing[]
  readonly nOpps: number
  readonly vsCbet: boolean
  readonly dims: readonly DefendDim[]
}

export type RuleTable = BetTable | DefendTable
```

Виміри — значення плюс людська підпис:

```ts
const BET_DIM: Readonly<Record<BetDim, (c: BetContext) => string>> = {
  texture: (c) => TEX_LABEL[c.texture],
  ip: (c) => (c.ip ? 'у позиції' : 'поза позицією'),
  delayed: (c) => (c.delayed ? 'після чек-чеку' : 'після ставки на попередній вулиці'),
  flush: (c) => (c.events.flushClosed && !c.madeFlush ? 'масть закрилась, рука не флеш' : 'масть не зібралась'),
  overcard: (c) => (c.events.overcard ? 'нова карта старша за флоп' : 'карта нічого не змінила'),
}

const DEFEND_DIM: Readonly<Record<DefendDim, (c: DefendContext) => string>> = {
  street: (c) => STREET_LABEL[c.street],
  facing: (c) => FACING_LABEL[c.facing],
  repeat: (c) => (c.repeatAggro ? 'друга куля опонента' : 'перша агресія в руці'),
}
```

`FACING_LABEL` (новий експорт `types.ts`, бо потрібен і Розбору):
`none: 'ніхто не ставив'`, `small_bet: 'мала ставка (≤40% банку)'`,
`big_bet: 'велика ставка (>40%)'`, `raise: 'рейз'`.

Повний перебір (усі виміри, навіть неоголошені — саме тому таблиця не може
проґавити залежність):

```ts
export function allBetContexts(t: BetTable): BetContext[] {
  const out: BetContext[] = []
  for (const cat of POST_CATEGORIES)
    for (const texture of TEXTURES)
      for (const ip of [true, false])
        for (const delayed of [true, false])
          for (const madeFlush of [true, false])
            for (const flushClosed of [true, false])
              for (const boardPaired of [true, false])
                for (const overcard of [true, false])
                  out.push({
                    street: t.street, line: t.line, cat, texture, nOpps: t.nOpps, ip, delayed,
                    madeFlush, events: { flushClosed, boardPaired, overcard },
                  })
  return out
}

export function allDefendContexts(t: DefendTable): DefendContext[] {
  const out: DefendContext[] = []
  for (const street of t.streets)
    for (const facing of t.facings)
      for (const cat of POST_CATEGORIES)
        for (const repeatAggro of [true, false])
          out.push({ street, facing, cat, nOpps: t.nOpps, repeatAggro, vsCbet: t.vsCbet })
  return out
}
```

Зведення (спільне для обох видів таблиць):

```ts
interface Cell {
  readonly cat: PostCategory
  readonly labels: readonly string[]
  readonly action: PostAction
  readonly why: string
}

/**
 * Залишає лише ті виміри, які справді змінюють рішення цієї категорії:
 * жадібно пробує викинути кожен вимір і перевіряє, чи групи лишились
 * однорідними. Саме це перетворює 42 комбінації на людські 8 рядків.
 */
function reduceDims(cells: readonly Cell[], count: number): number[]
```

Далі: групування за скороченими вимірами, склеювання груп з однаковою
`action`+`why` (мітка — перелік через « / », а якщо груп більше двох — `решта`),
`решта` завжди останній рядок категорії.

Ключ рядка для тестів і рендера:

```ts
/** Рядок, який покриває цей контекст. Тести звіряють його з матрицею. */
export function betRowFor(t: BetTable, c: BetContext): RuleRow | undefined
export function defendRowFor(t: DefendTable, c: DefendContext): RuleRow | undefined
```

Обидві шукають рядок за `cat` + мітками скорочених вимірів (той самий ключ, яким
рядок збудований), тому «нема рядка» означає справжню дірку в покритті.

Список таблиць (`RULE_TABLES`) — саме ті, що в спеці:

| id | Заголовок | source | Виміри |
|---|---|---|---|
| `flop-hu` | Флоп · чекнуто до тебе · хедз-ап | §5.1 · порт із `poker-trainer.html` 1:1 | texture, ip |
| `flop-caller-oop` | Флоп · лінія колера, поза позицією | §5.1а | — |
| `turn` | Терн · чекнуто до тебе | §5.2 | flush, delayed, overcard, ip |
| `river` | Рівер · чекнуто до тебе | §5.3 | — |
| `multi-bet` | Мультипот · чекнуто до тебе | §5.1–5.2 | ip |
| `vs-cbet` | Проти c-bet агресора · флоп | §5.4 | facing |
| `vs-bet` | Проти іншої ставки · флоп і терн | §5.5 | street, facing, repeat |
| `vs-bet-river` | Проти ставки · рівер | §5.5 | facing, repeat |
| `vs-raise` | Проти рейзу | §5.6 | street |
| `multi-defend` | Мультивей проти агресії | §5.5–5.6 | facing, repeat |

- [ ] **Крок 4: тести зелені**

Run: `cd web && npx vitest run src/engine/postflop/postRules.test.ts`
Expected: PASS.

- [ ] **Крок 5: коміт**

```bash
git add web/src/engine/postflop/postRules.ts web/src/engine/postflop/postRules.test.ts web/src/engine/postflop/index.ts web/src/engine/postflop/types.ts
git commit -m "post-5: таблиці правил генеруються з матриць"
```

---

### Task 2: вкладка «Схема рішень» і смужка вкладок Етапу 2

**Файли:**
- Create: `web/src/pages/PostRules.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/pages/PostRules.test.tsx`, `web/src/App.test.tsx` (створити, якщо немає)

- [ ] **Крок 1: тести, що падають**

`PostRules.test.tsx`: рендер показує всі заголовки `RULE_TABLES`, кожна таблиця
має `<table>`, у документі є примітка про межі моделі (шукати текст «межі»).

`App.test.tsx`: після відкриття Етапу 2 (`postUnlocked: true`) видно чотири
вкладки; клік на «Схема рішень» показує таблиці; хоткеї тренування на інших
вкладках не діють — `fireEvent.keyDown(window, { key: '1' })` не змінює
`usePostSessionStore.getState().feedback`.

- [ ] **Крок 2: переконатись, що падають**

Run: `cd web && npx vitest run src/pages/PostRules.test.tsx src/App.test.tsx`
Expected: FAIL — сторінки й вкладок немає.

- [ ] **Крок 3: реалізація**

`PostRules.tsx` — для кожної таблиці `RULE_TABLES`: `<h4>{title}</h4>`,
`<span className="note">{source}</span>`, `<table>` з колонками
«Твоя рука · Ситуація · Дія · Чому» (класи `c`/`b`/`m`, як у референсі).
Наприкінці — дві довідкові таблиці («Як читається рука», «Як читається дошка»)
і примітка про межі моделі: порт тексту з `pfRenderRules` плюс речення про те,
що терн, рівер і захист описані спекою, а не референсом.

`App.tsx`:

```ts
type PostTab = 'train' | 'rules' | 'stats' | 'review'

const POST_TABS: readonly { key: PostTab; label: string }[] = [
  { key: 'train', label: 'Тренування' },
  { key: 'rules', label: 'Схема рішень' },
  { key: 'stats', label: 'Статистика' },
  { key: 'review', label: 'Розбір' },
]
```

Стан `const [postTab, setPostTab] = useState<PostTab>('train')`; смужка
вкладок рендериться в гілці `stage === 'post' && postUnlocked`.

**Важливо:** хоткеї звузити до вкладки тренування —
`usePostTrainHotkeys(stage === 'post' && postUnlocked && postTab === 'train')`.
Без цього натискання «1» на вкладці правил відповідало б за героя.

- [ ] **Крок 4: тести зелені**

Run: `cd web && npx vitest run src/pages src/App.test.tsx`
Expected: PASS.

- [ ] **Крок 5: коміт**

```bash
git add web/src/pages/PostRules.tsx web/src/pages/PostRules.test.tsx web/src/App.tsx web/src/App.test.tsx
git commit -m "post-5: вкладка «Схема рішень» і вкладки Етапу 2"
```

---

### Task 3: вкладка «Статистика» Етапу 2

**Файли:**
- Create: `web/src/pages/PostStats.tsx`
- Modify: `web/src/engine/postflop/postProgress.ts` (порог вибірки)
- Modify: `web/src/App.tsx` (роутинг вкладки)
- Test: `web/src/pages/PostStats.test.tsx`

- [ ] **Крок 1: тест, що падає**

Рендер із заповненим `PostProgress` показує: смужку (рішень / точність /
рекорд / помилок), зрізи по вулицях, категоріях, текстурах, режимах і facing;
порожній прогрес показує запрошення зіграти руки, а не нулі.

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/pages/PostStats.test.tsx`
Expected: FAIL.

- [ ] **Крок 3: реалізація**

У `postProgress.ts`:

```ts
/** Від скількох рішень зріз уже щось означає — нижче підсвітка не фарбується. */
export const POST_SLICE_MIN = 10
```

`PostStats.tsx` — джерело даних `usePostStatsSource()` (сервер із локальним
фолбеком, уже готовий). Секції через `PerPos`: вулиці (`STREET_LABEL`),
категорії (`POST_CAT_LABEL`), текстури (`TEX_LABEL`), режими (`HU·IP`,
`HU·OOP`, `MULTI·IP`, `MULTI·OOP`), контексти (`FACING_LABEL`).
Примітки: про несинхронізовані відповіді (як у `Stats.tsx`) і про те, що
скидання/видалення прогресу — спільне для двох етапів і живе на вкладці
статистики Етапу 1.

- [ ] **Крок 4: тест зелений**

Run: `cd web && npx vitest run src/pages/PostStats.test.tsx`

- [ ] **Крок 5: коміт**

```bash
git add web/src/pages/PostStats.tsx web/src/pages/PostStats.test.tsx web/src/engine/postflop/postProgress.ts web/src/App.tsx
git commit -m "post-5: вкладка статистики постфлопу"
```

---

### Task 4: діагностика постфлоп-помилок

**Файли:**
- Create: `web/src/engine/postflop/postReview.ts`
- Test: `web/src/engine/postflop/postReview.test.ts`

- [ ] **Крок 1: тест, що падає**

Тест перевіряє класифікацію на конкретних записах логу (по одному на патерн) і
властивості звіту: findings від двох випадків, сортування за частотою, не більше
трьох, порожній лог → порожні findings; `buildPostReport` містить рядки з
кількостями.

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/engine/postflop/postReview.test.ts`
Expected: FAIL.

- [ ] **Крок 3: реалізація**

Патерни (вісім портованих із `PF_FIX` + шість нових; тексти — українською, у
стилі наявних `FIX`):

| Ключ | Коли | Суть тексту |
|---|---|---|
| `bluffMulti` | ставка без руки, `n ≥ 2` | у мультипоті ставиш лише валью |
| `bluffWet` | ставка AIR/WEAKDRAW на мокрій | текстура влучає в опонента |
| `bluffOOP` | те саме поза позицією на сухій | далі граєш наосліп |
| `thinBet` | ставка MEDIUM, треба чек | виганяєш гірше, платиш кращому |
| `weakBet` | ставка WEAK | вбиваєш шоудаун-валью |
| `missValue` | чек/колл там, де ставка/рейз | лузове поле платить частіше, ніж здається |
| `sizeSmall` | b33 замість b66 | даєш дро правильну ціну |
| `sizeBig` | b66 замість b33 | лякаєш гірші руки |
| `barrelNoEquity` | ставка на терні AIR/WEAKDRAW | друга куля без еквіті — «one and done» |
| `riverBluff` | ставка на рівері, треба чек | проти станцій рівер не блефують — ніколи |
| `stackOnePair` | колл/рейз STRONG_PAIR, треба фолд | з однією парою в стек не їдемо |
| `foldStrength` | фолд STRONG_MADE/DRAW проти c-bet | агресор c-betить широко — сила не фолдить |
| `callTooWide` | колл WEAK/MEDIUM/AIR, треба фолд | пасивна агресія = сила |
| `raiseIntoStrength` | рейз, треба колл | рейз проти сили виганяє лише гірше |

```ts
export function classifyPostMistake(e: PostMistakeEntry): PostFixKey
export interface PostReview { played; acc; mistakes; findings; byStreet; byCat; byTex; byMode; byFacing; topMistakes }
export function buildPostReview(progress: PostProgress): PostReview
export function buildPostReport(progress: PostProgress): string
```

`topMistakes` — згруповані за `street|cat|facing|co` з людськими підписами й
кількістю; `board`/`hand`, якщо запис їх має (Task 6).

- [ ] **Крок 4: тести зелені**

Run: `cd web && npx vitest run src/engine/postflop/postReview.test.ts`

- [ ] **Крок 5: коміт**

```bash
git add web/src/engine/postflop/postReview.ts web/src/engine/postflop/postReview.test.ts web/src/engine/postflop/index.ts
git commit -m "post-5: діагностика постфлоп-помилок"
```

---

### Task 5: вкладка «Розбір» Етапу 2

**Файли:**
- Create: `web/src/pages/PostReview.tsx`
- Modify: `web/src/App.tsx`
- Test: `web/src/pages/PostReview.test.tsx`

- [ ] **Крок 1: тест, що падає**

Порожній лог → запрошення зіграти; лог із трьома блефами рівера → finding
«Блеф рівера · 3×»; кнопка «Скопіювати звіт» кладе текст у буфер (мок
`navigator.clipboard`), як у префлопному Review.

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/pages/PostReview.test.tsx`

- [ ] **Крок 3: реалізація**

Структура — дзеркало `Review.tsx`: смужка цифр, «Головні патерни» (`.finding`),
зрізи (`PerPos`), «Конкретні споти, які треба закрити» (`.mrow`: рука, борд,
вулиця, правильна дія, `n×`), футер із копіюванням звіту.

- [ ] **Крок 4: тест зелений**

- [ ] **Крок 5: коміт**

```bash
git add web/src/pages/PostReview.tsx web/src/pages/PostReview.test.tsx web/src/App.tsx
git commit -m "post-5: вкладка розбору постфлопу"
```

---

### Task 6: лог помилок носить руку, борд і роздачу

Без цього в розборі видно «STRONG_PAIR на мокрій дошці», але не видно, **яка**
це була рука — і немає за що взятись, щоб розгорнути роздачу.

**Файли:**
- Modify: `web/src/engine/postflop/postProgress.ts`
- Modify: `web/src/store/postSessionStore.ts`, `web/src/store/mergePostProgress.ts`
- Test: `web/src/engine/postflop/postProgress.test.ts`, `web/src/store/mergePostProgress.test.ts`

- [ ] **Крок 1: тести, що падають**

`recordPostAnswer` з `episodeId`/`board`/`hand` кладе їх у запис логу; без них
запис лишається валідним (старі логи з localStorage не мають цих полів);
`mergePostProgress` переносить їх із рядків черги.

- [ ] **Крок 2: переконатись, що падають**

Run: `cd web && npx vitest run src/engine/postflop/postProgress.test.ts src/store/mergePostProgress.test.ts`

- [ ] **Крок 3: реалізація**

```ts
export interface PostMistakeEntry {
  // ...наявні поля...
  /** Роздача (`episode_id`) — ключ для розгортання руки в Розборі. */
  readonly ep?: string
  /** Борд і рука на момент рішення: 'Ks7d2c', 'AKs'. */
  readonly board?: string
  readonly hand?: string
}
```

Поля опційні свідомо: логи, які вже лежать у localStorage, їх не мають, і
ламати їх заради нового екрана не варто.

- [ ] **Крок 4: тести зелені**

- [ ] **Крок 5: коміт**

```bash
git add web/src/engine/postflop/postProgress.ts web/src/engine/postflop/postProgress.test.ts web/src/store/postSessionStore.ts web/src/store/mergePostProgress.ts web/src/store/mergePostProgress.test.ts
git commit -m "post-5: лог помилок носить руку, борд і роздачу"
```

---

### Task 7: сервер віддає роздачу

**Файли:**
- Create: `supabase/migrations/<timestamp>_postflop_review.sql` (через `npm run db:new postflop_review`)
- Modify: `web/src/api/serverPostProgress.ts`, `web/src/api/database.types.ts` (генерується)
- Test: `supabase/tests/postflop.test.ts`

- [ ] **Крок 1: тест, що падає**

У `supabase/tests/postflop.test.ts`:

```ts
describe('postflop_episode', () => {
  it('віддає всі рішення роздачі в порядку вулиць', async () => { /* три рядки одного episode_id */ })
  it('чужу роздачу не віддає', async () => { /* інший актор → 0 рядків */ })
})

describe('postflop_mistakes', () => {
  it('віддає episode_id, борд і руку — інакше розбір не покаже, що це була за рука', async () => {})
})
```

Run: `npm run test:db`
Expected: FAIL — функції немає, у зрізі помилок немає нових колонок.

- [ ] **Крок 2: міграція**

`create or replace function public.postflop_mistakes(...)` — додати до
`returns table` колонки `episode_id uuid`, `board text`, `hand text`,
`line text` і віддавати їх (решта запиту без змін).

`create or replace function public.postflop_episode(episode uuid)` —
`security invoker`, `set search_path = ''`, фільтр
`where user_id = (select auth.uid()) and episode_id = episode`,
порядок `order by answered_at, id`; повертає street/board/hand/hole/category/
texture/facing/repeat_aggro/pot_bb/chosen/correct/is_correct/answered_at.
Мітка скидання тут **не** застосовується: розгортаємо конкретну роздачу на
запит, а не рахуємо статистику.

Коментарі `comment on function` — як у наявних міграціях.

- [ ] **Крок 3: застосувати й перегенерувати типи**

```bash
npm run db:reset && npm run db:types && npm run test:db
```

Expected: усі інтеграційні тести зелені, `database.types.ts` містить
`postflop_episode`.

- [ ] **Крок 4: клієнт**

`serverPostProgress.ts`: у мапінгу `postflop_mistakes` заповнити `ep`, `board`,
`hand`; додати

```ts
export interface EpisodeDecisionRow { street; board; hand; hole; category; texture; facing; repeatAggro; potBB; chosen; correct; ok }
export async function fetchEpisode(episodeId: string): Promise<EpisodeDecisionRow[]>
```

- [ ] **Крок 5: коміт**

```bash
git add supabase/migrations web/src/api/serverPostProgress.ts web/src/api/database.types.ts supabase/tests/postflop.test.ts
git commit -m "post-5: сервер віддає роздачу за episode_id"
```

---

### Task 8: розгортання роздачі в Розборі

**Файли:**
- Modify: `web/src/pages/PostReview.tsx`
- Test: `web/src/pages/PostReview.test.tsx`

- [ ] **Крок 1: тест, що падає**

Мок `fetchEpisode` повертає три рішення → клік «Розгорнути роздачу» показує три
рядки з вулицями й діями; без логіну кнопки немає, замість неї примітка, що
роздача розгортається лише для синхронізованих рук.

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/pages/PostReview.test.tsx`

- [ ] **Крок 3: реалізація**

Кнопка на рядку помилки, що має `ep`, з’являється лише коли
`usePostStatsSource().fromServer`. Розгорнута роздача: борд по вулицях, рука
героя, вибір і правильна дія, підсвітка помилкового рішення.

- [ ] **Крок 4: тест зелений**

- [ ] **Крок 5: коміт**

```bash
git add web/src/pages/PostReview.tsx web/src/pages/PostReview.test.tsx
git commit -m "post-5: розгортання роздачі за episode_id"
```

---

### Task 9: документація і повна перевірка

- [ ] **Крок 1: спека** — §11: позначити post-5 зробленим; §9: уточнити, що
  таблиці правил генеруються з матриць (це сильніше за «порт `pfRenderRules`» —
  фіксуємо як свідоме відхилення від спеки).

- [ ] **Крок 2: CLAUDE.md** — у таблицю «Узгоджені відхилення» рядок:
  «Схема рішень — порт `pfRenderRules` → таблиці генеруються з матриць §5;
  причина: рукописна таблиця розійшлася б із кодом».

- [ ] **Крок 3: README** — згадка про кабінет Етапу 2 (вкладки).

- [ ] **Крок 4: повна перевірка**

```bash
cd web && npm test && npm run typecheck && npm run lint && npm run build
```

```bash
npm run test:db
```

- [ ] **Крок 5: перевірка в браузері** — пройтись усіма чотирма вкладками
  Етапу 2, впевнитись, що хоткеї не стріляють поза тренуванням.

- [ ] **Крок 6: коміт**

```bash
git add docs CLAUDE.md README.md
git commit -m "post-5: документація кабінету Етапу 2"
```

---

## Поза цією фазою

- **Зріз byLine** (точність колера окремо від агресора) — потребує ще однієї
  міграції; вирішується після того, як буде видно, чи бракує його на практиці.
- **Drill по постфлоп-помилках** — контекст відтворення в базі вже є, але це
  окрема продуктова фаза.
- **Еквіті в поясненнях** (`equity.ts`), 3бет-поти, мультивей-захист — §1 спеки.
