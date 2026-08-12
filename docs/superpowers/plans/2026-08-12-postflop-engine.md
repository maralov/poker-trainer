# Постфлоп · фаза post-1 — ядро рушія (лінія агресора)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Зібрати `web/src/engine/postflop/` — чистий рушій, який роздає постфлоп-епізод лінії агресора, веде роздачу від флопу до шоудауну і на кожному рішенні героя каже правильну дію з поясненням.

**Architecture:** Новий підмодуль поруч із префлопним кодом; префлоп не змінюється (правило CLAUDE.md «джерело істини — `poker-trainer.html`» лишається чинним для флоп-ядра). Оцінювач руки й флоп-матриця переносяться з HTML 1:1 і звіряються фікстурами; терн, рівер і захист — за спекою `docs/superpowers/specs/2026-08-11-postflop-stage-design.md`. Жодних імпортів React/zustand/DOM/supabase; уся випадковість через інжектований `Rng`.

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), vitest 4, детермінований `mulberry32` з `web/src/test/rng.ts`.

**Відхилення від §7 спеки.** Спека передбачала один файл `matrix.ts`; тут він розділений на `matrixBet.ts` (контекст «можу ставити») і `matrixDefend.ts` (проти агресії). Причина — різні входи й різні джерела істини: перший наполовину порт референсу і звіряється фікстурою, другий цілком зі спеки. Тримати їх в одному файлі означало б змішати перевірене з новим.

**Межі цієї фази.** UI не змінюється, база не змінюється, черга синку не змінюється. Лінія колера (`§5.4` спеки, матриця проти c-bet) — фаза post-4, її тут немає. Матриці `§5.5` (проти донка/бареля) і `§5.6` (проти рейзу) входять сюди: агресор їх зустрічає вже в post-1, бо профіль опонента вміє донкати й рейзити.

**Усі команди — з каталогу `/Users/maralov/personal/poker-trainer/web`, якщо не вказано інше.**

---

### Task 1: Типи постфлопу

**Files:**
- Create: `web/src/engine/postflop/types.ts`

- [ ] **Step 1: Створити файл типів**

Нових тестів тут немає — це декларації, які перевіряє `tsc`. Тест зʼявиться в Task 2 разом із першим кодом, що ці типи вживає.

```ts
/**
 * Типи Етапу 2. Виділені окремо, щоб решта підмодуля не тягнула одна одну
 * заради одного псевдоніма.
 *
 * Джерело істини: docs/superpowers/specs/2026-08-11-postflop-stage-design.md
 */

export const STREETS = ['flop', 'turn', 'river'] as const
export type Street = (typeof STREETS)[number]

/** Роль героя в роздачі. У post-1 будується лише 'aggressor'. */
export type PostLine = 'aggressor' | 'caller'

/**
 * Категорія руки. STRONG референсу розщеплений надвоє: у контекстах «проти
 * ставки» одна пара і дві пари грають по-різному — з однією парою в стек не
 * їдемо. Там, де дія «можу ставити», обидва підтипи поводяться однаково.
 */
export type PostCategory =
  | 'STRONG_MADE'
  | 'STRONG_PAIR'
  | 'MEDIUM'
  | 'WEAK'
  | 'DRAW'
  | 'WEAKDRAW'
  | 'AIR'

export const POST_CATEGORIES = [
  'STRONG_MADE',
  'STRONG_PAIR',
  'MEDIUM',
  'WEAK',
  'DRAW',
  'WEAKDRAW',
  'AIR',
] as const

export type Texture = 'DRY' | 'WET' | 'PAIRED'

/** Дія на постфлопі. Префлопний Action ('raise'|'call'|'fold') тут не годиться. */
export type PostAction = 'check' | 'b33' | 'b66' | 'fold' | 'call' | 'raise'

/** Що стоїть перед героєм у момент рішення. Ціна: мала ≤40% банку, велика — далі. */
export type Facing = 'none' | 'small_bet' | 'big_bet' | 'raise'

export const isStrong = (c: PostCategory): boolean =>
  c === 'STRONG_MADE' || c === 'STRONG_PAIR'

export const isBet = (a: PostAction): boolean => a === 'b33' || a === 'b66'

/** Події борду поверх флоп-текстури — вхід матриць терну й рівера. */
export interface BoardEvents {
  /** На борді зібралось 3+ карти однієї масті. */
  readonly flushClosed: boolean
  readonly boardPaired: boolean
  /** Остання карта старша за весь флоп. */
  readonly overcard: boolean
}

export interface HandEval {
  readonly cat: PostCategory
  /** Людський опис руки для вердикту: «топ-пара, сильний кікер + гатшот». */
  readonly label: string
  /** Рука вже зібрала флеш — потрібно матриці терну для вибору сайзу. */
  readonly madeFlush: boolean
}

export const POST_CAT_LABEL: Readonly<Record<PostCategory, string>> = {
  STRONG_MADE: 'Сильна рука',
  STRONG_PAIR: 'Сильна пара',
  MEDIUM: 'Середня рука',
  WEAK: 'Слабка пара',
  DRAW: 'Сильне дро',
  WEAKDRAW: 'Слабке дро / оверкарти',
  AIR: 'Порожньо',
}

export const TEX_LABEL: Readonly<Record<Texture, string>> = {
  DRY: 'суха',
  WET: 'мокра',
  PAIRED: 'спарена',
}

export const POST_ACT_LABEL: Readonly<Record<PostAction, string>> = {
  check: 'чек',
  b33: 'ставка 33%',
  b66: 'ставка 66%',
  fold: 'фолд',
  call: 'колл',
  raise: 'рейз',
}

export const STREET_LABEL: Readonly<Record<Street, string>> = {
  flop: 'флоп',
  turn: 'терн',
  river: 'рівер',
}
```

- [ ] **Step 2: Перевірити типи**

Run: `npm run typecheck`
Expected: без помилок (файл ще ніхто не імпортує, але він входить у `include: ["src"]`).

- [ ] **Step 3: Коміт**

```bash
git add web/src/engine/postflop/types.ts && git commit -m "post-1: типи постфлопу"
```

---

### Task 2: Колода з виключеннями

`web/src/engine/cards.ts` роздає лише дві карти під канонічну руку і колоди не веде. Постфлопу потрібна колода, з якої карти зникають.

**Files:**
- Create: `web/src/engine/postflop/deck.ts`
- Test: `web/src/engine/postflop/deck.test.ts`

- [ ] **Step 1: Написати падаючий тест**

```ts
import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { cardCode, drawCards, drawHand, makeDeck } from './deck'

describe('makeDeck', () => {
  it('повна колода — 52 різні карти', () => {
    const deck = makeDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map(cardCode)).size).toBe(52)
  })

  it('масті кодуються shdc за індексом SUITS', () => {
    const deck = makeDeck()
    const ace = deck.filter((c) => c.rk === 'A').map(cardCode).sort()
    expect(ace).toEqual(['Ac', 'Ad', 'Ah', 'As'])
  })
})

describe('drawCards', () => {
  it('витягнуті карти зникають з колоди', () => {
    const deck = makeDeck()
    const drawn = drawCards(deck, 3, mulberry32(1))
    expect(drawn).toHaveLength(3)
    expect(deck).toHaveLength(49)
    for (const c of drawn) {
      expect(deck.some((d) => cardCode(d) === cardCode(c)), `${cardCode(c)} має зникнути`).toBe(
        false,
      )
    }
  })

  it('той самий seed дає ту саму роздачу', () => {
    const a = drawCards(makeDeck(), 5, mulberry32(7)).map(cardCode)
    const b = drawCards(makeDeck(), 5, mulberry32(7)).map(cardCode)
    expect(a).toEqual(b)
  })
})

describe('drawHand', () => {
  it('suited-рука отримує дві карти однієї масті', () => {
    const deck = makeDeck()
    const hole = drawHand(deck, 'AKs', mulberry32(3))
    expect(hole).not.toBeNull()
    expect(hole?.[0]?.s).toBe(hole?.[1]?.s)
    expect(hole?.map((c) => c.rk).sort()).toEqual(['A', 'K'])
    expect(deck).toHaveLength(50)
  })

  it('offsuit-рука отримує різні масті', () => {
    const hole = drawHand(makeDeck(), 'AKo', mulberry32(4))
    expect(hole?.[0]?.s).not.toBe(hole?.[1]?.s)
  })

  it('пара отримує два однакові ранги різних мастей', () => {
    const hole = drawHand(makeDeck(), '77', mulberry32(5))
    expect(hole?.map((c) => c.rk)).toEqual(['7', '7'])
    expect(hole?.[0]?.s).not.toBe(hole?.[1]?.s)
  })

  it('немає потрібних карт у колоді — null, а не виняток', () => {
    const deck = makeDeck().filter((c) => c.rk !== 'A')
    expect(drawHand(deck, 'AKs', mulberry32(6))).toBeNull()
  })
})
```

- [ ] **Step 2: Запустити тест — має впасти**

Run: `npm test -- deck.test`
Expected: FAIL, `Failed to resolve import "./deck"`.

- [ ] **Step 3: Реалізувати**

```ts
/**
 * Колода постфлопу.
 *
 * engine/cards.ts роздає дві карти під канонічну руку і колоди не веде — на
 * префлопі більше не треба. Постфлопу потрібне саме виключення карт: борд не
 * може повторити карту з чиєїсь руки.
 */

import { SUITS, VAL } from '../cards'
import { RANKS, type Card, type Hand, type Rng } from '../types'

/** Коди мастей у порядку SUITS: ♠♥♦♣. Використовуються в записі борду для бази. */
const SUIT_CODES = ['s', 'h', 'd', 'c'] as const

export const cardCode = (c: Card): string => `${c.rk}${SUIT_CODES[c.s] ?? '?'}`

/** Запис борду для журналу: 'Ks7d2c'. */
export const boardCode = (board: readonly Card[]): string => board.map(cardCode).join('')

export function makeDeck(): Card[] {
  const deck: Card[] = []
  for (const rk of RANKS) {
    SUITS.forEach((suit, s) => {
      deck.push({ rk, v: VAL[rk], s, g: suit.g, red: suit.red })
    })
  }
  return deck
}

/** Витягує n випадкових карт, вилучаючи їх із переданої колоди. */
export function drawCards(deck: Card[], n: number, rng: Rng): Card[] {
  const out: Card[] = []
  for (let i = 0; i < n; i++) {
    if (deck.length === 0) break
    const idx = Math.floor(rng() * deck.length)
    const [card] = deck.splice(idx, 1)
    if (card) out.push(card)
  }
  return out
}

/**
 * Порт handToCards із poker-trainer.html: конкретні карти під канонічну руку.
 * Повертає null, якщо потрібних карт у колоді вже немає — викликач перебирає далі.
 */
export function drawHand(deck: Card[], hand: Hand, rng: Rng): readonly Card[] | null {
  const first = hand[0]
  const second = hand[1]
  if (first === undefined || second === undefined) return null
  const suited = hand.length === 3 && hand.endsWith('s')

  const firstPool = deck.filter((c) => c.rk === first)
  if (firstPool.length === 0) return null
  const c1 = firstPool[Math.floor(rng() * firstPool.length)]
  if (c1 === undefined) return null

  const secondPool = deck.filter(
    (c) => c.rk === second && c !== c1 && (suited ? c.s === c1.s : c.s !== c1.s),
  )
  if (secondPool.length === 0) return null
  const c2 = secondPool[Math.floor(rng() * secondPool.length)]
  if (c2 === undefined) return null

  for (const card of [c1, c2]) {
    const i = deck.indexOf(card)
    if (i >= 0) deck.splice(i, 1)
  }
  return [c1, c2]
}
```

- [ ] **Step 4: Запустити тест — має пройти**

Run: `npm test -- deck.test`
Expected: PASS, 7 тестів.

- [ ] **Step 5: Коміт**

```bash
git add web/src/engine/postflop/deck.ts web/src/engine/postflop/deck.test.ts && git commit -m "post-1: колода з виключеннями"
```

---

### Task 3: Фікстура еквівалентності з HTML

Флоп-ядро переноситься 1:1, тож перед портом потрібен еталон — так само, як це зроблено для префлопу (`web/src/engine/__fixtures__/`).

**Files:**
- Create: `web/src/engine/__fixtures__/dump-postflop.mjs`
- Create: `web/src/engine/__fixtures__/ref-postflop.json` (генерується, не пишеться руками)
- Modify: `web/src/engine/__fixtures__/README.md`

- [ ] **Step 1: Написати генератор**

Файл `web/src/engine/__fixtures__/dump-postflop.mjs`:

```js
/**
 * Генератор еталона постфлоп-ядра. Виконує evaluate/texture/decide з
 * poker-trainer.html над детерміновано згенерованими роздачами.
 *
 * Використання:
 *   node dump-postflop.mjs <ref-postflop-core.js> <out.json>
 *
 * Референс працює лише з трикартковим бордом, тому й еталон лише про флоп:
 * терн і рівер джерела в HTML не мають — вони описані спекою.
 */

import fs from 'node:fs'

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const core = fs.readFileSync(process.argv[2], 'utf8')
const mod = new Function(core + '\nreturn {RANKS,VAL,SUITS,evaluate,texture,decide};')()
const { RANKS, VAL, SUITS, evaluate, texture, decide } = mod

const deck = []
for (const rk of RANKS) SUITS.forEach((s, si) => deck.push({ rk, v: VAL[rk], s: si, g: s.g, red: s.red }))

const code = (c) => c.rk + ['s', 'h', 'd', 'c'][c.s]

const out = []
const rng = mulberry32(20260812)
for (let i = 0; i < 4000; i++) {
  const pool = [...deck]
  const take = () => pool.splice(Math.floor(rng() * pool.length), 1)[0]
  const hole = [take(), take()]
  const board = [take(), take(), take()]
  const ev = evaluate(hole, board)
  const tx = texture(board)
  const nOpp = 1 + Math.floor(rng() * 3)
  const ip = rng() < 0.5
  out.push({
    hole: hole.map(code),
    board: board.map(code),
    cat: ev.cat,
    label: ev.label,
    tex: tx.t,
    texLabel: tx.label,
    nOpp,
    ip,
    decide: decide(ev.cat, tx.t, nOpp, ip),
  })
}

fs.writeFileSync(process.argv[3], JSON.stringify(out))
console.log(`${out.length} кейсів → ${process.argv[3]}`)
```

- [ ] **Step 2: Згенерувати еталон**

Вирізання чистих блоків референсу — примітиви карт (рядки 371–397) плюс постфлоп-ядро (рядки 1027–1116). Запускати **з кореня репозиторію**:

```bash
python3 - <<'PY'
import pathlib
lines = pathlib.Path('poker-trainer.html').read_text(encoding='utf-8').split('\n')
pathlib.Path('web/src/engine/__fixtures__/ref-postflop-core.js').write_text(
    '\n'.join(lines[370:397] + lines[1026:1116]), encoding='utf-8')
PY
node web/src/engine/__fixtures__/dump-postflop.mjs \
  web/src/engine/__fixtures__/ref-postflop-core.js \
  web/src/engine/__fixtures__/ref-postflop.json
```

Expected: `4000 кейсів → web/src/engine/__fixtures__/ref-postflop.json`

- [ ] **Step 3: Перевірити, що еталон осмислений**

```bash
node -e "const d=require('./web/src/engine/__fixtures__/ref-postflop.json');const c={};for(const x of d)c[x.cat]=(c[x.cat]||0)+1;console.log(c, d.length)"
```
Expected: усі шість категорій присутні (`STRONG, MEDIUM, WEAK, DRAW, WEAKDRAW, AIR`), сума 4000.

- [ ] **Step 4: Дописати README фікстур**

Додати в кінець `web/src/engine/__fixtures__/README.md`:

```markdown
# ref-postflop.json

Еталон постфлоп-ядра (`evaluate`, `texture`, `decide`) з `poker-trainer.html`.
4000 детерміновано згенерованих роздач із рішенням для кожної. Референс знає
лише флоп, тому й еталон лише про флоп: терн і рівер описані спекою
`docs/superpowers/specs/2026-08-11-postflop-stage-design.md`.

Перегенерувати:

```bash
python3 - <<'PY'
import pathlib
lines = pathlib.Path('poker-trainer.html').read_text(encoding='utf-8').split('\n')
pathlib.Path('web/src/engine/__fixtures__/ref-postflop-core.js').write_text(
    '\n'.join(lines[370:397] + lines[1026:1116]), encoding='utf-8')
PY
node web/src/engine/__fixtures__/dump-postflop.mjs \
  web/src/engine/__fixtures__/ref-postflop-core.js \
  web/src/engine/__fixtures__/ref-postflop.json
```
```

- [ ] **Step 5: Коміт**

```bash
git add web/src/engine/__fixtures__ && git commit -m "post-1: еталон постфлоп-ядра з референсу"
```

---

### Task 4: Оцінювач руки і текстури

**Files:**
- Create: `web/src/engine/postflop/evaluate.ts`
- Test: `web/src/engine/postflop/evaluate.test.ts`

- [ ] **Step 1: Написати падаючий тест еквівалентності**

```ts
/**
 * Флоп-частина оцінювача — порт із poker-trainer.html, тож головний тест тут
 * не про «правильний покер», а про побайтову рівність референсу.
 */

import { describe, expect, it } from 'vitest'

import { RANKS, type Card, type Rank } from '../types'
import { VAL, SUITS } from '../cards'
import refPostflop from '../__fixtures__/ref-postflop.json'
import { boardEvents, evalHand, texture } from './evaluate'
import { isStrong, type PostCategory } from './types'

interface RefCase {
  hole: string[]
  board: string[]
  cat: string
  label: string
  tex: string
  texLabel: string
  nOpp: number
  ip: boolean
  decide: string
}

const fixtures = refPostflop as unknown as RefCase[]

const SUIT_CODES = ['s', 'h', 'd', 'c']

/** 'Ks' → Card. Та сама форма, що у makeDeck. */
function card(code: string): Card {
  const rk = code[0] as Rank
  const s = SUIT_CODES.indexOf(code[1] ?? '')
  const suit = SUITS[s]
  if (!RANKS.includes(rk) || suit === undefined) throw new Error(`невалідна карта ${code}`)
  return { rk, v: VAL[rk], s, g: suit.g, red: suit.red }
}

/** Наша категорія до форми референсу: розщеплення STRONG — наше доповнення. */
const toRef = (c: PostCategory): string => (isStrong(c) ? 'STRONG' : c)

describe('еквівалентність референсу · флоп', () => {
  it('еталон не порожній', () => {
    expect(fixtures.length).toBeGreaterThan(1000)
  })

  it('категорія руки збігається з референсом на всіх кейсах', () => {
    fixtures.forEach((ref, i) => {
      const ev = evalHand(ref.hole.map(card), ref.board.map(card))
      expect(toRef(ev.cat), `кейс ${i}: ${ref.hole.join('')} на ${ref.board.join('')}`).toBe(ref.cat)
    })
  })

  it('опис руки збігається з референсом на всіх кейсах', () => {
    fixtures.forEach((ref, i) => {
      const ev = evalHand(ref.hole.map(card), ref.board.map(card))
      expect(ev.label, `кейс ${i}: ${ref.hole.join('')} на ${ref.board.join('')}`).toBe(ref.label)
    })
  })

  it('текстура збігається з референсом на всіх кейсах', () => {
    fixtures.forEach((ref, i) => {
      const tx = texture(ref.board.map(card))
      expect(tx.t, `кейс ${i}: ${ref.board.join('')}`).toBe(ref.tex)
      expect(tx.label).toBe(ref.texLabel)
    })
  })
})

describe('розщеплення STRONG', () => {
  const ev = (hole: string, board: string): ReturnType<typeof evalHand> =>
    evalHand(
      [card(hole.slice(0, 2)), card(hole.slice(2, 4))],
      board.match(/.{2}/g)?.map(card) ?? [],
    )

  it('дві пари й краще — STRONG_MADE', () => {
    expect(ev('KsQd', 'Kh Qc 2s'.replace(/ /g, '')).cat).toBe('STRONG_MADE')
    expect(ev('7s7d', '7h Kc 2s'.replace(/ /g, '')).cat).toBe('STRONG_MADE')
    expect(ev('AsKs', 'Qs Js Ts'.replace(/ /g, '')).cat).toBe('STRONG_MADE')
  })

  it('оверпара і топ-пара з сильним кікером — STRONG_PAIR', () => {
    expect(ev('AsAd', 'Kh 7c 2s'.replace(/ /g, '')).cat).toBe('STRONG_PAIR')
    expect(ev('AsKd', 'Ah 7c 2s'.replace(/ /g, '')).cat).toBe('STRONG_PAIR')
  })

  it('середня пара з сильним дро теж STRONG_PAIR — у стек з нею не їдемо', () => {
    // Друга пара + флеш-дро: референс дає STRONG, підтип має бути парним.
    const e = ev('Th9h', 'Kh 7h Ts'.replace(/ /g, ''))
    expect(e.cat).toBe('STRONG_PAIR')
  })
})

describe('дро на рівері не існують', () => {
  it('нереалізоване флеш-дро на пʼятикартковому борді — AIR', () => {
    const e = evalHand(
      [card('Ah'), card('9h')],
      [card('Kh'), card('7h'), card('2s'), card('3c'), card('4d')],
    )
    expect(e.cat).toBe('AIR')
    expect(e.label).toBe('нічого')
  })

  it('доїхале флеш-дро — STRONG_MADE із прапорцем madeFlush', () => {
    const e = evalHand(
      [card('Ah'), card('9h')],
      [card('Kh'), card('7h'), card('2s'), card('3h'), card('4d')],
    )
    expect(e.cat).toBe('STRONG_MADE')
    expect(e.madeFlush).toBe(true)
  })
})

describe('boardEvents', () => {
  const b = (codes: string): Card[] => codes.match(/.{2}/g)?.map(card) ?? []

  it('третя карта масті закриває флеш-дро', () => {
    expect(boardEvents(b('KhQh2s7h')).flushClosed).toBe(true)
    expect(boardEvents(b('KhQh2s7c')).flushClosed).toBe(false)
  })

  it('спарений борд і оверкарта', () => {
    expect(boardEvents(b('Kh7s2c7d')).boardPaired).toBe(true)
    expect(boardEvents(b('Kh7s2cAd')).overcard).toBe(true)
    expect(boardEvents(b('Kh7s2c5d')).overcard).toBe(false)
  })

  it('на флопі оверкарти не буває — подія про терн і рівер', () => {
    expect(boardEvents(b('Kh7s2c')).overcard).toBe(false)
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- evaluate.test`
Expected: FAIL, `Failed to resolve import "./evaluate"`.

- [ ] **Step 3: Реалізувати**

```ts
/**
 * Оцінка руки і текстури.
 *
 * evaluate/texture/hasStraight/straightDraw — порт із poker-trainer.html 1:1
 * (звіряється з __fixtures__/ref-postflop.json). Свідомі доповнення, яких у
 * референсі немає, бо він знає лише флоп:
 *   1. STRONG розщеплений на STRONG_MADE / STRONG_PAIR (див. types.ts);
 *   2. на пʼятикартковому борді дро не рахуються — добирати нема чого;
 *   3. boardEvents — прапорці подій борду для матриць терну й рівера.
 */

import type { Card } from '../types'
import type { BoardEvents, HandEval, PostCategory, Texture } from './types'

/**
 * Нижня карта стріту в наборі рангів, 0 — стріту немає.
 * Порт 1:1: цикл іде знизу, тобто повертає НАЙМОЛОДШИЙ стріт. Для evaluate це
 * лише булеве «стріт є», а для straightDraw — вікно, і саме таким воно було
 * в референсі. Не «виправляти».
 */
export function hasStraight(values: readonly number[]): number {
  const s = new Set(values)
  if (s.has(14)) s.add(1)
  for (let lo = 1; lo <= 10; lo++) {
    let ok = true
    for (let k = 0; k < 5; k++) {
      if (!s.has(lo + k)) {
        ok = false
        break
      }
    }
    if (ok) return lo
  }
  return 0
}

/** Скільки рангів добудовують стріт із участю карти героя: 2+ — двосторонній. */
export function straightDraw(
  all: readonly Card[],
  holeValues: readonly number[],
): 'oesd' | 'gutshot' | null {
  const rset = all.map((c) => c.v)
  let outs = 0
  for (let r = 2; r <= 14; r++) {
    if (rset.includes(r)) continue
    const lo = hasStraight([...rset, r])
    if (!lo) continue
    const win: number[] = []
    for (let k = 0; k < 5; k++) win.push(lo + k)
    const hv = holeValues.flatMap((v) => (v === 14 ? [14, 1] : [v]))
    if (hv.some((v) => win.includes(v))) outs++
  }
  return outs >= 2 ? 'oesd' : outs === 1 ? 'gutshot' : null
}

export function evalHand(hole: readonly Card[], board: readonly Card[]): HandEval {
  const all = [...hole, ...board]
  const bv = board.map((c) => c.v).sort((a, b) => b - a)
  const hv = hole.map((c) => c.v).sort((a, b) => b - a)
  const h0 = hv[0] ?? 0
  const h1 = hv[1] ?? 0
  const b0 = bv[0] ?? 0
  const b1 = bv[1] ?? 0

  const cnt = new Map<number, number>()
  const suitCnt = new Map<number, number>()
  for (const c of all) {
    cnt.set(c.v, (cnt.get(c.v) ?? 0) + 1)
    suitCnt.set(c.s, (suitCnt.get(c.s) ?? 0) + 1)
  }
  const holeSuits = hole.map((c) => c.s)

  const flushMade = [...suitCnt.values()].some((n) => n >= 5)
  const straightMade = hasStraight(all.map((c) => c.v)) > 0
  const isPocket = h0 === h1

  let made: 'STRONG' | 'MEDIUM' | 'WEAK' | null = null
  /** Дві пари й краще — саме це відрізняє STRONG_MADE від STRONG_PAIR. */
  let big = false
  let label = ''

  if (flushMade) {
    made = 'STRONG'
    big = true
    label = 'флеш'
  } else if (straightMade) {
    made = 'STRONG'
    big = true
    label = 'стріт'
  } else if (isPocket && bv.includes(h0)) {
    made = 'STRONG'
    big = true
    label = 'сет'
  } else if (!isPocket && (cnt.get(h0) === 3 || cnt.get(h1) === 3)) {
    made = 'STRONG'
    big = true
    label = 'трипс'
  } else if (!isPocket && bv.includes(h0) && bv.includes(h1)) {
    made = 'STRONG'
    big = true
    label = 'дві пари'
  } else if (isPocket) {
    if (h0 > b0) {
      made = 'STRONG'
      label = 'оверпара'
    } else if (h0 > b1) {
      made = 'MEDIUM'
      label = 'середня кишенькова пара'
    } else {
      made = 'WEAK'
      label = 'андерпара'
    }
  } else {
    const m = bv.includes(h0) ? h0 : bv.includes(h1) ? h1 : null
    if (m === null) {
      label = 'без пари'
    } else {
      const kicker = m === h0 ? h1 : h0
      if (m === b0) {
        if (kicker >= 10) {
          made = 'STRONG'
          label = 'топ-пара, сильний кікер'
        } else {
          made = 'MEDIUM'
          label = 'топ-пара, слабкий кікер'
        }
      } else if (m === b1) {
        made = 'MEDIUM'
        label = 'друга пара'
      } else {
        made = 'WEAK'
        label = 'третя пара'
      }
    }
  }

  // Дро живі, поки борд не повний. Референс цієї гілки не має — він далі флопу
  // не йде, а на рівері «дро» означало б добір з карти, якої не буде.
  const live = board.length < 5
  // Булеві, а не знайдена масть: індекс ♠ дорівнює 0, і перевірка на істинність
  // самої масті мовчки ковтала б усі пікові дро.
  const flushDraw =
    live && [...suitCnt.entries()].some(([s, n]) => n === 4 && holeSuits.includes(s))
  const backdoor =
    live && [...suitCnt.entries()].some(([s, n]) => n === 3 && holeSuits.includes(s))
  const sd = live ? straightDraw(all, hv) : null

  const over = made === null && h0 > b0 && h1 > b0

  const dl: string[] = []
  if (flushDraw && !flushMade) dl.push('флеш-дро')
  if (sd === 'oesd') dl.push('двосторонній стріт-дро')
  if (sd === 'gutshot') dl.push('гатшот')
  if (!flushDraw && backdoor && dl.length === 0) dl.push('беквдор-флеш')

  let cat: PostCategory
  if (made === 'STRONG') cat = big ? 'STRONG_MADE' : 'STRONG_PAIR'
  else if ((flushDraw && !flushMade) || sd === 'oesd')
    // Середня рука із сильним дро — теж «сильна», але парного роду.
    cat = made === 'MEDIUM' ? 'STRONG_PAIR' : 'DRAW'
  else if (made === 'MEDIUM') cat = 'MEDIUM'
  else if (made === 'WEAK') cat = 'WEAK'
  else if (sd === 'gutshot' || over) cat = 'WEAKDRAW'
  else cat = 'AIR'

  let full = label
  if (dl.length) full = (made ? `${label} + ` : '') + dl.join(' + ')
  if (!made && dl.length === 0) full = over ? 'дві оверкарти' : 'нічого'

  return { cat, label: full, madeFlush: flushMade }
}

/** Текстура флопу. Фіксується на флопі й далі не перераховується. */
export function texture(flop: readonly Card[]): { t: Texture; label: string } {
  const v = flop.map((c) => c.v).sort((a, b) => b - a)
  const v0 = v[0] ?? 0
  const v1 = v[1] ?? 0
  const v2 = v[2] ?? 0
  if (v0 === v1 || v1 === v2) return { t: 'PAIRED', label: 'спарена' }

  const su = new Map<number, number>()
  for (const c of flop) su.set(c.s, (su.get(c.s) ?? 0) + 1)
  const mx = Math.max(...su.values())

  let sc = 0
  if (mx === 3) sc += 2
  else if (mx === 2) sc += 1
  if (v0 - v1 <= 2 || v1 - v2 <= 2) sc += 1
  if (v0 - v2 <= 4) sc += 1

  return sc >= 2 ? { t: 'WET', label: 'мокра' } : { t: 'DRY', label: 'суха' }
}

export function boardEvents(board: readonly Card[]): BoardEvents {
  const suit = new Map<number, number>()
  const rank = new Map<number, number>()
  for (const c of board) {
    suit.set(c.s, (suit.get(c.s) ?? 0) + 1)
    rank.set(c.v, (rank.get(c.v) ?? 0) + 1)
  }
  const flopTop = Math.max(...board.slice(0, 3).map((c) => c.v))
  const last = board[board.length - 1]
  return {
    flushClosed: [...suit.values()].some((n) => n >= 3),
    boardPaired: [...rank.values()].some((n) => n >= 2),
    overcard: board.length > 3 && last !== undefined && last.v > flopTop,
  }
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npm test -- evaluate.test`
Expected: PASS. Якщо падає тест еквівалентності — правити порт, **не** еталон.

- [ ] **Step 5: Коміт**

```bash
git add web/src/engine/postflop/evaluate.ts web/src/engine/postflop/evaluate.test.ts && git commit -m "post-1: оцінювач руки і текстури, звірений з референсом"
```

---

### Task 5: Ранкер сімох карт для шоудауну

У референсі роздачі не догравались, тож цього коду там немає — пишемо з нуля.

**Files:**
- Create: `web/src/engine/postflop/showdown.ts`
- Test: `web/src/engine/postflop/showdown.test.ts`

- [ ] **Step 1: Написати падаючий тест**

```ts
import { describe, expect, it } from 'vitest'

import { VAL, SUITS } from '../cards'
import { RANKS, type Card, type Rank } from '../types'
import { RANK_LABEL, compareRank, rank7, showdownWinners } from './showdown'

const SUIT_CODES = ['s', 'h', 'd', 'c']

function card(code: string): Card {
  const rk = code[0] as Rank
  const s = SUIT_CODES.indexOf(code[1] ?? '')
  const suit = SUITS[s]
  if (!RANKS.includes(rk) || suit === undefined) throw new Error(`невалідна карта ${code}`)
  return { rk, v: VAL[rk], s, g: suit.g, red: suit.red }
}

const cards = (codes: string): Card[] => codes.match(/.{2}/g)?.map(card) ?? []

describe('rank7', () => {
  it.each([
    ['AsKsQsJsTs2c3d', 8, 'стріт-флеш'],
    ['7s7h7d7cKs2d3h', 7, 'каре'],
    ['7s7h7dKsKh2d3c', 6, 'фул-хаус'],
    ['As9s7s4s2s8h3d', 5, 'флеш'],
    ['9s8h7d6c5s2d3h', 4, 'стріт'],
    ['7s7h7dKs9c4d2h', 3, 'трійка'],
    ['7s7hKsKc9d4h2s', 2, 'дві пари'],
    ['7s7hKc9d4h2s3c', 1, 'пара'],
    ['AsKc9d7h4s3c2d', 0, 'старша карта'],
  ])('%s → %i (%s)', (codes, cat, label) => {
    const r = rank7(cards(codes))
    expect(r.cat).toBe(cat)
    expect(RANK_LABEL[cat]).toBe(label)
  })

  it('колесо A2345 — стріт від туза знизу', () => {
    expect(rank7(cards('As2h3d4c5sKdQh')).cat).toBe(4)
  })

  it('серед двох стрітів рахується старший', () => {
    // 5..9 і 6..T на одному борді — виграє верхній.
    const high = rank7(cards('Th9h8s7d6c5h2d'))
    const low = rank7(cards('9h8s7d6c5h2d3c'))
    expect(compareRank(high, low)).toBeGreaterThan(0)
  })

  it('два трипси дають фул-хаус зі старшим трипсом', () => {
    const r = rank7(cards('7s7h7dKsKhKc2d'))
    expect(r.cat).toBe(6)
    expect(r.tie[0]).toBe(VAL['K'])
    expect(r.tie[1]).toBe(VAL['7'])
  })

  it('три пари: рахуються дві старші, третя йде в кікери', () => {
    const r = rank7(cards('KsKh9s9d4c4h2s'))
    expect(r.cat).toBe(2)
    expect(r.tie).toEqual([VAL['K'], VAL['9'], VAL['4']])
  })
})

describe('compareRank', () => {
  it('вища категорія бʼє нижчу', () => {
    expect(compareRank(rank7(cards('7s7h7dKs9c4d2h')), rank7(cards('7s7hKc9d4h2s3c')))).toBeGreaterThan(0)
  })

  it('однакова категорія — вирішує кікер', () => {
    const withAce = rank7(cards('7s7hAc9d4h2s3c'))
    const withKing = rank7(cards('7s7hKc9d4h2s3c'))
    expect(compareRank(withAce, withKing)).toBeGreaterThan(0)
  })

  it('повністю однакові руки — нічия', () => {
    expect(compareRank(rank7(cards('7s7hKc9d4h2s3c')), rank7(cards('7d7cKh9s4d2h3s')))).toBe(0)
  })
})

describe('showdownWinners', () => {
  const board = cards('Ks7d2c9h4s')

  it('повертає індекс сильнішої руки', () => {
    expect(showdownWinners([cards('AsKh'), cards('QsJd')], board)).toEqual([0])
  })

  it('спліт — обидва індекси', () => {
    expect(showdownWinners([cards('AsQh'), cards('AdQc')], board)).toEqual([0, 1])
  })

  it('три учасники, виграє один', () => {
    expect(showdownWinners([cards('2s2h'), cards('KcKh'), cards('QsJd')], board)).toEqual([1])
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- showdown.test`
Expected: FAIL, `Failed to resolve import "./showdown"`.

- [ ] **Step 3: Реалізувати**

```ts
/**
 * Ранкер сімох карт. Потрібен лише постфлопу: у референсі роздачі не
 * догравались до шоудауну, тож джерела для порту немає.
 */

import type { Card } from '../types'

export interface HandRank {
  /** 0 старша карта … 8 стріт-флеш. */
  readonly cat: number
  /** Тайбрейк за спаданням значущості. */
  readonly tie: readonly number[]
}

export const RANK_LABEL: readonly string[] = [
  'старша карта',
  'пара',
  'дві пари',
  'трійка',
  'стріт',
  'флеш',
  'фул-хаус',
  'каре',
  'стріт-флеш',
]

/** Найстарший стріт: нижня карта вікна, 0 — стріту немає. */
function topStraight(values: readonly number[]): number {
  const s = new Set(values)
  if (s.has(14)) s.add(1)
  for (let lo = 10; lo >= 1; lo--) {
    let ok = true
    for (let k = 0; k < 5; k++) {
      if (!s.has(lo + k)) {
        ok = false
        break
      }
    }
    if (ok) return lo
  }
  return 0
}

export function rank7(cards: readonly Card[]): HandRank {
  const byRank = new Map<number, number>()
  const bySuit = new Map<number, number[]>()
  for (const c of cards) {
    byRank.set(c.v, (byRank.get(c.v) ?? 0) + 1)
    const list = bySuit.get(c.s) ?? []
    list.push(c.v)
    bySuit.set(c.s, list)
  }

  const flush = [...bySuit.values()].find((vs) => vs.length >= 5)
  if (flush) {
    const vs = [...flush].sort((a, b) => b - a)
    const sf = topStraight(vs)
    if (sf > 0) return { cat: 8, tie: [sf] }
    return { cat: 5, tie: vs.slice(0, 5) }
  }

  // Спершу за кількістю, потім за старшинством: g0 — найбільша й найстарша група.
  const groups = [...byRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const g0 = groups[0]
  const g1 = groups[1]

  const kickers = (used: readonly number[], n: number): number[] =>
    [...byRank.keys()]
      .filter((v) => !used.includes(v))
      .sort((a, b) => b - a)
      .slice(0, n)

  if (g0 && g0[1] === 4) return { cat: 7, tie: [g0[0], ...kickers([g0[0]], 1)] }
  if (g0 && g1 && g0[1] === 3 && g1[1] >= 2) return { cat: 6, tie: [g0[0], g1[0]] }

  const straight = topStraight([...byRank.keys()])
  if (straight > 0) return { cat: 4, tie: [straight] }

  if (g0 && g0[1] === 3) return { cat: 3, tie: [g0[0], ...kickers([g0[0]], 2)] }
  if (g0 && g1 && g0[1] === 2 && g1[1] === 2) {
    const pair = [g0[0], g1[0]]
    return { cat: 2, tie: [...pair, ...kickers(pair, 1)] }
  }
  if (g0 && g0[1] === 2) return { cat: 1, tie: [g0[0], ...kickers([g0[0]], 3)] }
  return { cat: 0, tie: kickers([], 5) }
}

/** >0 якщо a сильніша, <0 якщо b, 0 — нічия. */
export function compareRank(a: HandRank, b: HandRank): number {
  if (a.cat !== b.cat) return a.cat - b.cat
  const len = Math.max(a.tie.length, b.tie.length)
  for (let i = 0; i < len; i++) {
    const x = a.tie[i] ?? 0
    const y = b.tie[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

/** Індекси переможців серед переданих рук. Кілька — спліт. */
export function showdownWinners(
  holes: readonly (readonly Card[])[],
  board: readonly Card[],
): number[] {
  const ranks = holes.map((hole) => rank7([...hole, ...board]))
  let best = 0
  for (let i = 1; i < ranks.length; i++) {
    const a = ranks[i]
    const b = ranks[best]
    if (a && b && compareRank(a, b) > 0) best = i
  }
  const top = ranks[best]
  if (!top) return []
  return ranks.map((r, i) => (compareRank(r, top) === 0 ? i : -1)).filter((i) => i >= 0)
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npm test -- showdown.test`
Expected: PASS, 18 тестів.

- [ ] **Step 5: Коміт**

```bash
git add web/src/engine/postflop/showdown.ts web/src/engine/postflop/showdown.test.ts && git commit -m "post-1: ранкер семи карт для шоудауну"
```

---

### Task 6: Матриця «можу ставити» — флоп, терн, рівер

Флоп-частина — порт `decide()`; терн і рівер — §5.2 і §5.3 спеки.

**Files:**
- Create: `web/src/engine/postflop/matrixBet.ts`
- Test: `web/src/engine/postflop/matrixBet.test.ts`

- [ ] **Step 1: Написати падаючий тест**

```ts
import { describe, expect, it } from 'vitest'

import refPostflop from '../__fixtures__/ref-postflop.json'
import { decideBet } from './matrixBet'
import type { BoardEvents, PostCategory, Texture } from './types'

interface RefCase {
  cat: string
  tex: string
  nOpp: number
  ip: boolean
  decide: string
}
const fixtures = refPostflop as unknown as RefCase[]

const QUIET: BoardEvents = { flushClosed: false, boardPaired: false, overcard: false }

const ctx = (over: Partial<Parameters<typeof decideBet>[0]> = {}): Parameters<typeof decideBet>[0] => ({
  street: 'flop',
  cat: 'AIR',
  texture: 'DRY',
  events: QUIET,
  nOpps: 1,
  ip: true,
  delayed: false,
  madeFlush: false,
  ...over,
})

describe('флоп · еквівалентність decide() з референсу', () => {
  it('усі кейси еталона дають ту саму дію', () => {
    // Референс не знає розщеплення STRONG, тому обидва підтипи мають вести себе
    // однаково — перевіряємо кожен кейс двічі.
    fixtures.forEach((ref, i) => {
      const cats: PostCategory[] =
        ref.cat === 'STRONG' ? ['STRONG_MADE', 'STRONG_PAIR'] : [ref.cat as PostCategory]
      for (const cat of cats) {
        const got = decideBet(
          ctx({ cat, texture: ref.tex as Texture, nOpps: ref.nOpp, ip: ref.ip }),
        )
        expect(got.action, `кейс ${i} · ${cat}`).toBe(ref.decide)
        expect(got.why.length, `кейс ${i}: пояснення не має бути порожнім`).toBeGreaterThan(20)
      }
    })
  })
})

describe('терн · §5.2', () => {
  it('сильна рука ставить великим сайзом', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'STRONG_MADE' })).action).toBe('b66')
  })

  it('на закритій масті сильна рука без флеша сайзить менше', () => {
    const events = { ...QUIET, flushClosed: true }
    expect(decideBet(ctx({ street: 'turn', cat: 'STRONG_MADE', events })).action).toBe('b33')
    expect(
      decideBet(ctx({ street: 'turn', cat: 'STRONG_MADE', events, madeFlush: true })).action,
    ).toBe('b66')
  })

  it('дро барелить лише в позиції', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'DRAW', ip: true })).action).toBe('b66')
    expect(decideBet(ctx({ street: 'turn', cat: 'DRAW', ip: false })).action).toBe('check')
  })

  it('середня рука ставить тонко лише після чек-чеку без оверкарти', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'MEDIUM', delayed: true })).action).toBe('b33')
    expect(decideBet(ctx({ street: 'turn', cat: 'MEDIUM', delayed: false })).action).toBe('check')
    expect(
      decideBet(
        ctx({ street: 'turn', cat: 'MEDIUM', delayed: true, events: { ...QUIET, overcard: true } }),
      ).action,
    ).toBe('check')
  })

  it('порожня рука барелить лише як delayed c-bet у позиції', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'AIR', delayed: true, ip: true })).action).toBe('b33')
    expect(decideBet(ctx({ street: 'turn', cat: 'AIR', delayed: true, ip: false })).action).toBe('check')
    expect(decideBet(ctx({ street: 'turn', cat: 'AIR', delayed: false, ip: true })).action).toBe('check')
  })

  it('слабка пара і слабке дро мовчать', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'WEAK' })).action).toBe('check')
    expect(decideBet(ctx({ street: 'turn', cat: 'WEAKDRAW' })).action).toBe('check')
  })
})

describe('рівер · §5.3', () => {
  it('сильна рука забирає валью', () => {
    expect(decideBet(ctx({ street: 'river', cat: 'STRONG_MADE' })).action).toBe('b66')
    expect(decideBet(ctx({ street: 'river', cat: 'STRONG_PAIR' })).action).toBe('b66')
  })

  it('рівер не блефується ніколи — навіть у позиції на сухій дошці', () => {
    expect(decideBet(ctx({ street: 'river', cat: 'AIR', ip: true, delayed: true })).action).toBe('check')
  })

  it('середня і слабка руки йдуть на дешевий шоудаун', () => {
    expect(decideBet(ctx({ street: 'river', cat: 'MEDIUM' })).action).toBe('check')
    expect(decideBet(ctx({ street: 'river', cat: 'WEAK' })).action).toBe('check')
  })
})

describe('мультивей', () => {
  it('на всіх вулицях ставить лише сила, дро — лише в позиції на флопі й терні', () => {
    for (const street of ['flop', 'turn'] as const) {
      expect(decideBet(ctx({ street, cat: 'STRONG_MADE', nOpps: 3 })).action).toBe('b66')
      expect(decideBet(ctx({ street, cat: 'DRAW', nOpps: 3, ip: true })).action).toBe('b66')
      expect(decideBet(ctx({ street, cat: 'DRAW', nOpps: 3, ip: false })).action).toBe('check')
      expect(decideBet(ctx({ street, cat: 'AIR', nOpps: 3, ip: true })).action).toBe('check')
      expect(decideBet(ctx({ street, cat: 'MEDIUM', nOpps: 2, ip: true })).action).toBe('check')
    }
    expect(decideBet(ctx({ street: 'river', cat: 'STRONG_MADE', nOpps: 2 })).action).toBe('b66')
    expect(decideBet(ctx({ street: 'river', cat: 'MEDIUM', nOpps: 2 })).action).toBe('check')
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- matrixBet.test`
Expected: FAIL, `Failed to resolve import "./matrixBet"`.

- [ ] **Step 3: Реалізувати**

```ts
/**
 * Матриці контексту «чекнуто до тебе, можна ставити».
 *
 * Флоп — порт decide()/pfExplain() з poker-trainer.html 1:1 (звіряється з
 * ref-postflop.json). Терн і рівер джерела в референсі не мають: вони описані
 * спекою, §5.2 і §5.3.
 */

import type { BoardEvents, PostAction, PostCategory, Street, Texture } from './types'
import { isStrong } from './types'

export interface BetContext {
  readonly street: Street
  readonly cat: PostCategory
  readonly texture: Texture
  readonly events: BoardEvents
  readonly nOpps: number
  readonly ip: boolean
  /** На попередній вулиці ставок не було — діапазони слабкі з обох боків. */
  readonly delayed: boolean
  readonly madeFlush: boolean
}

export interface Decision {
  readonly action: PostAction
  readonly why: string
}

const MULTI_VALUE =
  'Мультипот. Ставиш виключно валью і великим сайзом: троє опонентів дадуть колл достатньо часто, а дешева ставка просто пускає всіх на дешеві дро.'
const MULTI_DRAW_IP =
  'У позиції з сильним дро у мультипоті ставка виправдана: достатньо еквіті, а позиція дозволяє контролювати банк далі.'
const MULTI_DRAW_OOP =
  'Сильне дро поза позицією в мультипоті — чек. Немає ні фолд-еквіті проти трьох, ні контролю над банком.'
const MULTI_NO_BLUFF =
  'Головне правило мультипоту: не блефувати. Коли на флопі троє і більше, хтось майже завжди має пару чи дро — твій блеф не має адресата.'

/** Флоп, порт pfExplain() 1:1 — послідовність гілок повторює decide(). */
function whyFlop(cat: PostCategory, tex: Texture, nOpps: number, ip: boolean): string {
  if (nOpps >= 2) {
    if (isStrong(cat)) return MULTI_VALUE
    if (cat === 'DRAW') return ip ? MULTI_DRAW_IP : MULTI_DRAW_OOP
    return MULTI_NO_BLUFF
  }
  if (isStrong(cat))
    return tex === 'WET'
      ? 'Сильна рука на мокрій дошці — великий сайз. Ти не просто збираєш валью, а змушуєш дро платити неправильну ціну.'
      : 'Сильна рука на сухій дошці — маленький сайз. Опонент рідко має чим платити багато, а дрібна ставка тримає його слабкі руки в грі.'
  if (cat === 'DRAW')
    return tex === 'WET'
      ? 'Напівблеф з сильним дро працює двома способами: опонент фолдить зараз або платить, коли ти влучаєш.'
      : 'З сильним дро на сухій дошці вистачить маленької ставки: фолд-еквіті і так високе.'
  if (cat === 'MEDIUM')
    return tex === 'WET'
      ? 'Середня рука на мокрій дошці — чек. Ставлячи, ти виганяєш усе гірше і платиш усьому кращому.'
      : 'Середня рука на сухій дошці витримує одну маленьку ставку: гірші руки платять, дошка небезпечно не розвивається.'
  if (cat === 'WEAK')
    return 'Слабка пара має шоудаун-валью, але ставкою ти його вбиваєш. Чекай і дійди до шоудауну дешево.'
  if (tex === 'WET')
    return 'Порожня рука на мокрій дошці — чек. Така текстура влучає в калл-діапазон опонента частіше, ніж у твій.'
  return ip
    ? 'Порожньо, але дошка суха і ти в позиції — маленька ставка забирає банк достатньо часто, щоб бути плюсовою. Це основний двигун c-bet стратегії.'
    : 'Порожньо і поза позицією — чек. Без позиції блеф доводиться продовжувати наосліп на терні, і саме там губляться гроші.'
}

/** Флоп, порт decide() 1:1. Розщеплення STRONG тут згортається назад. */
function actionFlop(cat: PostCategory, tex: Texture, nOpps: number, ip: boolean): PostAction {
  if (nOpps >= 2) {
    if (isStrong(cat)) return 'b66'
    if (cat === 'DRAW') return ip ? 'b66' : 'check'
    return 'check'
  }
  if (isStrong(cat) || cat === 'DRAW') return tex === 'WET' ? 'b66' : 'b33'
  if (cat === 'MEDIUM') return tex === 'WET' ? 'check' : 'b33'
  if (cat === 'WEAK') return 'check'
  if (tex === 'WET') return 'check'
  return ip ? 'b33' : 'check'
}

function decideTurn(c: BetContext): Decision {
  const { cat, events, ip, delayed, madeFlush } = c
  if (isStrong(cat)) {
    return events.flushClosed && !madeFlush
      ? {
          action: 'b33',
          why: 'Масть на борді закрилась. Валью лишається, але сайз тонший: велика ставка тут платиться переважно флешем, тобто рукою, яка тебе вже бʼє.',
        }
      : {
          action: 'b66',
          why: 'Другий барель сильною рукою — великим сайзом. Колер флопу вже показав пару чи дро, і саме зараз він платить найохочіше.',
        }
  }
  if (cat === 'DRAW')
    return ip
      ? {
          action: 'b66',
          why: 'Другий барель напівблефом виправданий позицією: є еквіті на рівер і контроль над тим, скільки коштуватиме роздача.',
        }
      : {
          action: 'check',
          why: 'Дро поза позицією на терні — чек. Барель наосліп коштує дорого, а рівер ти все одно гратимеш першим.',
        }
  if (cat === 'MEDIUM')
    return delayed && !events.overcard
      ? {
          action: 'b33',
          why: 'Після чек-чеку на флопі діапазони обох слабкі, а карта нічого не змінила — маленька ставка збирає тонке валью з гірших рук.',
        }
      : {
          action: 'check',
          why: 'Середня рука на терні — чек. Опонент, який заколлював флоп, гіршим уже не платить, а кращим ти платиш сам.',
        }
  if (cat === 'WEAK')
    return {
      action: 'check',
      why: 'Слабка пара доходить до шоудауну лише дешево. Ставка перетворює її на блеф без фолд-еквіті.',
    }
  if (cat === 'WEAKDRAW')
    return {
      action: 'check',
      why: 'Гатшот або оверкарти на терні — замало еквіті для другої кулі. Дивись рівер дешево.',
    }
  return delayed && ip
    ? {
        action: 'b33',
        why: 'Обидва чекнули флоп — це найслабший діапазон опонента за всю роздачу. Дешевий стаб у позиції тут забирає банк достатньо часто.',
      }
    : {
        action: 'check',
        why: 'Колер флопу терн майже не фолдить: продовжувати блеф ні до кого. Одна куля і зупинка — «one and done».',
      }
}

function decideRiver(c: BetContext): Decision {
  if (isStrong(c.cat))
    return {
      action: 'b66',
      why: 'Рівер сильною рукою — це чисте валью. Поле, яке дійшло сюди, коллить значно ширше, ніж здається; чек тут просто дарує гроші.',
    }
  return {
    action: 'check',
    why: 'На рівері проти станцій не блефують — ніколи. Без сильної руки чек: або дешевий шоудаун, або програна роздача, але без зайвої ставки.',
  }
}

function decideMulti(c: BetContext): Decision {
  if (isStrong(c.cat)) return { action: 'b66', why: MULTI_VALUE }
  if (c.cat === 'DRAW' && c.street !== 'river')
    return c.ip
      ? { action: 'b66', why: MULTI_DRAW_IP }
      : { action: 'check', why: MULTI_DRAW_OOP }
  return { action: 'check', why: MULTI_NO_BLUFF }
}

/** Єдиний вхід контексту «можу ставити». */
export function decideBet(c: BetContext): Decision {
  if (c.nOpps >= 2) return decideMulti(c)
  if (c.street === 'flop')
    return {
      action: actionFlop(c.cat, c.texture, c.nOpps, c.ip),
      why: whyFlop(c.cat, c.texture, c.nOpps, c.ip),
    }
  if (c.street === 'turn') return decideTurn(c)
  return decideRiver(c)
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npm test -- matrixBet.test`
Expected: PASS.

- [ ] **Step 5: Коміт**

```bash
git add web/src/engine/postflop/matrixBet.ts web/src/engine/postflop/matrixBet.test.ts && git commit -m "post-1: матриці ставки — флоп 1:1, терн і рівер за спекою"
```

---

### Task 7: Матриці проти агресії опонента

§5.5 (проти ставки) і §5.6 (проти рейзу). §5.4 (лінія колера проти c-bet) — фаза post-4.

**Files:**
- Create: `web/src/engine/postflop/matrixDefend.ts`
- Test: `web/src/engine/postflop/matrixDefend.test.ts`

- [ ] **Step 1: Написати падаючий тест**

```ts
import { describe, expect, it } from 'vitest'

import { decideDefend } from './matrixDefend'
import { POST_CATEGORIES, type PostCategory } from './types'

const ctx = (over: Partial<Parameters<typeof decideDefend>[0]> = {}): Parameters<typeof decideDefend>[0] => ({
  street: 'flop',
  facing: 'small_bet',
  cat: 'AIR',
  nOpps: 1,
  repeatAggro: false,
  ...over,
})

describe('проти ставки · флоп і терн · §5.5', () => {
  it('дві пари й краще рейзять малу ставку і коллять велику', () => {
    expect(decideDefend(ctx({ cat: 'STRONG_MADE', facing: 'small_bet' })).action).toBe('raise')
    expect(decideDefend(ctx({ cat: 'STRONG_MADE', facing: 'big_bet' })).action).toBe('call')
  })

  it('одна пара — один колл, друга куля її вбиває', () => {
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', facing: 'small_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', facing: 'big_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', repeatAggro: true })).action).toBe('fold')
  })

  it('дро платить дешево на флопі, але не велику ставку на терні', () => {
    expect(decideDefend(ctx({ cat: 'DRAW', facing: 'small_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'DRAW', facing: 'big_bet', street: 'flop' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'DRAW', facing: 'big_bet', street: 'turn' })).action).toBe('fold')
  })

  it('середня рука витримує дешеву ставку лише на флопі', () => {
    expect(decideDefend(ctx({ cat: 'MEDIUM', facing: 'small_bet', street: 'flop' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'MEDIUM', facing: 'small_bet', street: 'turn' })).action).toBe('fold')
    expect(decideDefend(ctx({ cat: 'MEDIUM', facing: 'big_bet' })).action).toBe('fold')
  })

  it('слабка пара, слабке дро й порожньо фолдять завжди', () => {
    for (const cat of ['WEAK', 'WEAKDRAW', 'AIR'] as PostCategory[]) {
      for (const facing of ['small_bet', 'big_bet'] as const) {
        expect(decideDefend(ctx({ cat, facing })).action, `${cat} vs ${facing}`).toBe('fold')
      }
    }
  })
})

describe('проти ставки · рівер · §5.5', () => {
  it('дві пари й краще коллять усе', () => {
    expect(decideDefend(ctx({ street: 'river', cat: 'STRONG_MADE', facing: 'big_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ street: 'river', cat: 'STRONG_MADE', repeatAggro: true })).action).toBe('call')
  })

  it('одна пара ловить лише дешевий блеф', () => {
    expect(decideDefend(ctx({ street: 'river', cat: 'STRONG_PAIR', facing: 'small_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ street: 'river', cat: 'STRONG_PAIR', facing: 'big_bet' })).action).toBe('fold')
  })

  it('усе, слабше за одну пару, фолдить: пасивні рівер не блефують', () => {
    for (const cat of ['MEDIUM', 'WEAK', 'AIR'] as PostCategory[]) {
      expect(decideDefend(ctx({ street: 'river', cat, facing: 'small_bet' })).action).toBe('fold')
    }
  })
})

describe('проти рейзу · §5.6', () => {
  it('дві пари й краще коллять на всіх вулицях', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      expect(decideDefend(ctx({ street, facing: 'raise', cat: 'STRONG_MADE' })).action).toBe('call')
    }
  })

  it('одна пара платить рейз лише на флопі', () => {
    expect(decideDefend(ctx({ facing: 'raise', cat: 'STRONG_PAIR', street: 'flop' })).action).toBe('call')
    expect(decideDefend(ctx({ facing: 'raise', cat: 'STRONG_PAIR', street: 'turn' })).action).toBe('fold')
    expect(decideDefend(ctx({ facing: 'raise', cat: 'STRONG_PAIR', street: 'river' })).action).toBe('fold')
  })

  it('дро платить рейз лише на флопі', () => {
    expect(decideDefend(ctx({ facing: 'raise', cat: 'DRAW', street: 'flop' })).action).toBe('call')
    expect(decideDefend(ctx({ facing: 'raise', cat: 'DRAW', street: 'turn' })).action).toBe('fold')
  })
})

describe('мультивей-модифікатор', () => {
  it('продовжують лише дві пари; одна пара — тільки проти малої першої', () => {
    expect(decideDefend(ctx({ cat: 'STRONG_MADE', nOpps: 2, facing: 'big_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', nOpps: 2, facing: 'small_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', nOpps: 2, facing: 'big_bet' })).action).toBe('fold')
    expect(decideDefend(ctx({ cat: 'DRAW', nOpps: 2, facing: 'small_bet' })).action).toBe('fold')
  })
})

describe('інваріанти', () => {
  it('кожна досяжна комбінація має рішення з непорожнім поясненням', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const facing of ['small_bet', 'big_bet', 'raise'] as const) {
        for (const cat of POST_CATEGORIES) {
          for (const nOpps of [1, 2]) {
            for (const repeatAggro of [false, true]) {
              const d = decideDefend({ street, facing, cat, nOpps, repeatAggro })
              expect(['fold', 'call', 'raise'], `${street}/${facing}/${cat}`).toContain(d.action)
              expect(d.why.length, `${street}/${facing}/${cat}`).toBeGreaterThan(20)
            }
          }
        }
      }
    }
  })

  it('дві пари й краще ніколи не фолдять', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const facing of ['small_bet', 'big_bet', 'raise'] as const) {
        expect(
          decideDefend({ street, facing, cat: 'STRONG_MADE', nOpps: 1, repeatAggro: true }).action,
        ).not.toBe('fold')
      }
    }
  })

  it('порожня рука ніколи не колле ставку', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const facing of ['small_bet', 'big_bet', 'raise'] as const) {
        expect(decideDefend({ street, facing, cat: 'AIR', nOpps: 1, repeatAggro: false }).action).toBe(
          'fold',
        )
      }
    }
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- matrixDefend.test`
Expected: FAIL, `Failed to resolve import "./matrixDefend"`.

- [ ] **Step 3: Реалізувати**

```ts
/**
 * Матриці проти агресії опонента: §5.5 (ставка) і §5.6 (рейз) спеки.
 *
 * Головна ідея, яку вони тренують: у лузово-пасивному полі агресія майже
 * завжди означає силу. Тому «продовжувати» тут — виняток, а не норма, і
 * ключова межа проходить між двома парами (STRONG_MADE) і однією (STRONG_PAIR).
 *
 * §5.4 (лінія колера проти c-bet) — окремий контекст фази post-4.
 */

import type { Decision } from './matrixBet'
import type { Facing, PostCategory, Street } from './types'

export interface DefendContext {
  readonly street: Street
  /** 'none' сюди не потрапляє — це контекст matrixBet. */
  readonly facing: Facing
  readonly cat: PostCategory
  readonly nOpps: number
  /** Опонент уже проявляв агресію раніше в цій руці — це друга куля. */
  readonly repeatAggro: boolean
}

const FOLD_TRASH: Decision = {
  action: 'fold',
  why: 'Рука не має ні шоудаун-валью, ні достатнього еквіті, а пасивний опонент ставить із силою. Фолд тут — не слабкість, а економія.',
}

const CALL_TWO_PAIR: Decision = {
  action: 'call',
  why: 'Дві пари й краще знизу не скидаються. Проти сили не роздуваємо банк рейзом, але й не віддаємо руку, яка виграє достатньо часто.',
}

const RAISE_VALUE: Decision = {
  action: 'raise',
  why: 'Мала ставка від пасивного гравця — це або тонке валью, або спроба дешево дійти до шоудауну. Рейз двома парами будує банк, поки він ще платить.',
}

const CALL_ONE_PAIR: Decision = {
  action: 'call',
  why: 'Одна пара платить рівно один раз. Далі кожна нова ставка пасивного опонента робить її гіршою, а не кращою.',
}

const FOLD_ONE_PAIR: Decision = {
  action: 'fold',
  why: 'Друга куля пасивного гравця бʼє одну пару майже завжди. Саме тут мікроліміти губляться найдорожче — на «ну в мене ж топ-пара».',
}

const CALL_DRAW: Decision = {
  action: 'call',
  why: 'Дро платить, поки ціна дешева і попереду ще карти. Рейз-напівблеф проти того, хто не фолдить, працює лише проти себе.',
}

const FOLD_DRAW: Decision = {
  action: 'fold',
  why: 'Одна карта попереду не окупає велику ставку. Імплайди в лузовому полі є, але не такі, щоб платити цю ціну.',
}

const CALL_MEDIUM: Decision = {
  action: 'call',
  why: 'Одна дешева ставка на флопі — прийнятна ціна за середню руку з шоудаун-валью. Одна, не серія.',
}

const FOLD_MEDIUM: Decision = {
  action: 'fold',
  why: 'На терні діапазон ставки вже бʼє другу пару. Далі ця рука лише платитиме — і саме тому її скидають зараз.',
}

const CALL_RIVER_CATCH: Decision = {
  action: 'call',
  why: 'Дешева ставка на рівері — єдиний випадок, коли блеф-кетч однією парою окупається: навіть рідкісний блеф робить цей колл плюсовим.',
}

const FOLD_RIVER: Decision = {
  action: 'fold',
  why: 'Пасивні гравці на рівері не блефують. Велика ставка тут — завжди рука, і колл із однією парою просто дарує стек.',
}

/** Мультивей: продовжує лише сила, і то стримано. */
function defendMulti(c: DefendContext): Decision {
  if (c.cat === 'STRONG_MADE') return CALL_TWO_PAIR
  if (c.cat === 'STRONG_PAIR' && c.facing === 'small_bet' && !c.repeatAggro) return CALL_ONE_PAIR
  return {
    action: 'fold',
    why: 'Проти двох і більше опонентів хтось майже завжди має справжню руку. У мультивеї продовжують лише двома парами й краще.',
  }
}

function defendRaise(c: DefendContext): Decision {
  if (c.cat === 'STRONG_MADE') return CALL_TWO_PAIR
  if (c.cat === 'STRONG_PAIR')
    return c.street === 'flop' ? CALL_ONE_PAIR : FOLD_ONE_PAIR
  if (c.cat === 'DRAW') return c.street === 'flop' ? CALL_DRAW : FOLD_DRAW
  return FOLD_TRASH
}

function defendRiverBet(c: DefendContext): Decision {
  if (c.cat === 'STRONG_MADE') return CALL_TWO_PAIR
  if (c.cat === 'STRONG_PAIR')
    return c.facing === 'small_bet' && !c.repeatAggro ? CALL_RIVER_CATCH : FOLD_RIVER
  return FOLD_RIVER
}

function defendBet(c: DefendContext): Decision {
  const big = c.facing === 'big_bet'
  if (c.cat === 'STRONG_MADE') {
    if (c.repeatAggro) return CALL_TWO_PAIR
    return big ? CALL_TWO_PAIR : RAISE_VALUE
  }
  if (c.cat === 'STRONG_PAIR') return c.repeatAggro ? FOLD_ONE_PAIR : CALL_ONE_PAIR
  if (c.cat === 'DRAW') {
    if (c.repeatAggro) return FOLD_DRAW
    if (!big) return CALL_DRAW
    return c.street === 'flop' ? CALL_DRAW : FOLD_DRAW
  }
  if (c.cat === 'MEDIUM') {
    if (c.repeatAggro || big) return FOLD_MEDIUM
    return c.street === 'flop' ? CALL_MEDIUM : FOLD_MEDIUM
  }
  return FOLD_TRASH
}

export function decideDefend(c: DefendContext): Decision {
  if (c.nOpps >= 2) return defendMulti(c)
  if (c.facing === 'raise') return defendRaise(c)
  if (c.street === 'river') return defendRiverBet(c)
  return defendBet(c)
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npm test -- matrixDefend.test`
Expected: PASS.

- [ ] **Step 5: Прогнати весь набір і закомітити**

Run: `npm test`
Expected: усі файли зелені (175 старих тестів + нові).

```bash
git add web/src/engine/postflop/matrixDefend.ts web/src/engine/postflop/matrixDefend.test.ts && git commit -m "post-1: матриці проти ставки і рейзу"
```

---

### Task 8: Профіль опонента

**Files:**
- Create: `web/src/engine/postflop/villain.ts`
- Test: `web/src/engine/postflop/villain.test.ts`

- [ ] **Step 1: Написати падаючий тест**

```ts
import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { VILLAIN, villainBetFraction, villainOpen, villainVsBet } from './villain'
import type { PostCategory, Street } from './types'

/** Частка вибраної дії на великій вибірці — так перевіряються частоти. */
function share(n: number, run: (rng: () => number) => string, want: string): number {
  const rng = mulberry32(42)
  let hits = 0
  for (let i = 0; i < n; i++) if (run(rng) === want) hits++
  return hits / n
}

describe('villainOpen', () => {
  it('сильна рука ставить частіше за порожню на кожній вулиці', () => {
    for (const street of ['flop', 'turn', 'river'] as Street[]) {
      const strong = share(4000, (r) => villainOpen('STRONG_MADE', street, r), 'bet')
      const air = share(4000, (r) => villainOpen('AIR', street, r), 'bet')
      expect(strong, `${street}: сила`).toBeGreaterThan(air + 0.4)
    }
  })

  it('частоти збігаються з таблицею профілю ±0.03', () => {
    const cases: [PostCategory, Street][] = [
      ['STRONG_MADE', 'flop'],
      ['MEDIUM', 'flop'],
      ['DRAW', 'flop'],
      ['AIR', 'turn'],
      ['STRONG_PAIR', 'river'],
    ]
    for (const [cat, street] of cases) {
      const got = share(6000, (r) => villainOpen(cat, street, r), 'bet')
      const want = VILLAIN.bet[street][cat]
      expect(Math.abs(got - want), `${cat}/${street}: ${got} vs ${want}`).toBeLessThan(0.03)
    }
  })

  it('обидва підтипи STRONG поводяться однаково', () => {
    const made = share(4000, (r) => villainOpen('STRONG_MADE', 'flop', r), 'bet')
    const pair = share(4000, (r) => villainOpen('STRONG_PAIR', 'flop', r), 'bet')
    expect(Math.abs(made - pair)).toBeLessThan(0.03)
  })
})

describe('villainVsBet', () => {
  it('сила ніколи не фолдить', () => {
    for (const big of [false, true]) {
      expect(share(3000, (r) => villainVsBet('STRONG_MADE', 'flop', big, false, r), 'fold')).toBe(0)
    }
  })

  it('порожня рука майже завжди фолдить, і частіше проти великої ставки', () => {
    const small = share(4000, (r) => villainVsBet('AIR', 'flop', false, false, r), 'fold')
    const big = share(4000, (r) => villainVsBet('AIR', 'flop', true, false, r), 'fold')
    expect(small).toBeGreaterThan(0.8)
    expect(big).toBeGreaterThan(small)
  })

  it('середня рука коллить забагато — профіль станції', () => {
    expect(share(4000, (r) => villainVsBet('MEDIUM', 'flop', false, false, r), 'call')).toBeGreaterThan(0.85)
  })

  it('рейз майже завжди означає силу', () => {
    const strong = share(4000, (r) => villainVsBet('STRONG_MADE', 'flop', false, false, r), 'raise')
    const air = share(4000, (r) => villainVsBet('AIR', 'flop', false, false, r), 'raise')
    expect(strong).toBeGreaterThan(0.4)
    expect(air).toBeLessThan(0.05)
  })

  it('після рейзу на вулиці рейзів більше не буває — cap згортає їх у колл', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 500; i++) {
      expect(villainVsBet('STRONG_MADE', 'flop', false, true, rng)).not.toBe('raise')
    }
  })
})

describe('villainBetFraction', () => {
  it('сила і дро ставлять 66%, решта 33% — сайз корелює з рукою', () => {
    expect(villainBetFraction('STRONG_MADE')).toBe(0.66)
    expect(villainBetFraction('DRAW')).toBe(0.66)
    expect(villainBetFraction('MEDIUM')).toBe(0.33)
    expect(villainBetFraction('AIR')).toBe(0.33)
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- villain.test`
Expected: FAIL, `Failed to resolve import "./villain"`.

- [ ] **Step 3: Реалізувати**

```ts
/**
 * Профіль опонента: лузово-пасивний гравець мікролімітів.
 *
 * Колле забагато, рейзить майже виключно силу, блефує рідко. Саме цей профіль
 * експлуатують матриці §5 — тому числа тут не «баланс», а модель поля.
 * Усі частоти — продуктові параметри зі спеки §6, змінювати їх свідомо.
 */

import type { Rng } from '../types'
import { isStrong, type PostCategory, type Street } from './types'

/** Опонент бачить свою руку тим самим оцінювачем; підтипи STRONG не розрізняються. */
type CoarseCat = 'STRONG' | 'MEDIUM' | 'WEAK' | 'DRAW' | 'WEAKDRAW' | 'AIR'

const coarse = (c: PostCategory): CoarseCat => (isStrong(c) ? 'STRONG' : c)

type CatFreq = Readonly<Record<CoarseCat, number>>

export interface VillainProfile {
  /** Ставка, коли чекнуто до нього. */
  readonly bet: Readonly<Record<Street, Readonly<Record<PostCategory, number>>>>
  /** Донк-бет OOP до дії героя. */
  readonly donk: CatFreq
  /** Рейз у відповідь на ставку героя: [мала, велика]. */
  readonly raise: Readonly<Record<CoarseCat, readonly [number, number]>>
  /** Колл у відповідь на ставку героя: [мала, велика]. Решта — фолд. */
  readonly call: Readonly<Record<CoarseCat, readonly [number, number]>>
  /** Рейз на рівері однаковий незалежно від сайзу. */
  readonly riverRaise: number
}

const BET_FLOP: CatFreq = { STRONG: 0.6, MEDIUM: 0.25, WEAK: 0.1, DRAW: 0.3, WEAKDRAW: 0.05, AIR: 0.05 }
const BET_TURN: CatFreq = { STRONG: 0.7, MEDIUM: 0.2, WEAK: 0.05, DRAW: 0.25, WEAKDRAW: 0.05, AIR: 0.05 }
// На рівері дро не існують — рядки лишаються нулями заради повноти типу.
const BET_RIVER: CatFreq = { STRONG: 0.75, MEDIUM: 0.25, WEAK: 0.05, DRAW: 0, WEAKDRAW: 0, AIR: 0.05 }

/** Розгортає коротку таблицю на всі сім категорій. */
const expand = (f: CatFreq): Readonly<Record<PostCategory, number>> => ({
  STRONG_MADE: f.STRONG,
  STRONG_PAIR: f.STRONG,
  MEDIUM: f.MEDIUM,
  WEAK: f.WEAK,
  DRAW: f.DRAW,
  WEAKDRAW: f.WEAKDRAW,
  AIR: f.AIR,
})

export const VILLAIN: VillainProfile = {
  bet: { flop: expand(BET_FLOP), turn: expand(BET_TURN), river: expand(BET_RIVER) },
  donk: { STRONG: 0.3, MEDIUM: 0, WEAK: 0, DRAW: 0.2, WEAKDRAW: 0, AIR: 0 },
  raise: {
    STRONG: [0.5, 0.4],
    MEDIUM: [0, 0],
    WEAK: [0, 0],
    DRAW: [0.05, 0.05],
    WEAKDRAW: [0, 0],
    AIR: [0.02, 0.02],
  },
  call: {
    STRONG: [0.5, 0.6],
    MEDIUM: [0.9, 0.6],
    WEAK: [0.7, 0.3],
    DRAW: [0.9, 0.85],
    WEAKDRAW: [0.6, 0.25],
    AIR: [0.13, 0.05],
  },
  riverRaise: 0.3,
}

export type VillainMove = 'check' | 'bet' | 'fold' | 'call' | 'raise'

/** Сайз опонента корелює з силою — реальний телл мікрополя (спека §3.2, §13). */
export const villainBetFraction = (cat: PostCategory): 0.33 | 0.66 =>
  isStrong(cat) || cat === 'DRAW' ? 0.66 : 0.33

/** Чекнуто до опонента: ставить чи чекає. */
export function villainOpen(cat: PostCategory, street: Street, rng: Rng): 'check' | 'bet' {
  return rng() < VILLAIN.bet[street][cat] ? 'bet' : 'check'
}

/** Донк-бет: опонент OOP діє першим, до героя. */
export function villainDonk(cat: PostCategory, street: Street, rng: Rng): 'check' | 'bet' {
  if (street === 'river' && (cat === 'DRAW' || cat === 'WEAKDRAW')) return 'check'
  return rng() < VILLAIN.donk[coarse(cat)] ? 'bet' : 'check'
}

/**
 * Відповідь на ставку героя. `capped` — на вулиці вже був рейз, тож рейз-частка
 * згортається в колл: одна підвищена ставка на вулицю (спека §3.3).
 */
export function villainVsBet(
  cat: PostCategory,
  street: Street,
  big: boolean,
  capped: boolean,
  rng: Rng,
): 'fold' | 'call' | 'raise' {
  const c = coarse(cat)
  const i = big ? 1 : 0
  const raiseFreq = street === 'river' && c === 'STRONG' ? VILLAIN.riverRaise : (VILLAIN.raise[c][i] ?? 0)
  const callFreq = VILLAIN.call[c][i] ?? 0

  const roll = rng()
  if (!capped && roll < raiseFreq) return 'raise'
  // Cap не робить руку слабшою: рейзова частка стає коллом, а не фолдом.
  if (roll < raiseFreq + callFreq) return 'call'
  return 'fold'
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npm test -- villain.test`
Expected: PASS.

- [ ] **Step 5: Коміт**

```bash
git add web/src/engine/postflop/villain.ts web/src/engine/postflop/villain.test.ts && git commit -m "post-1: профіль лузово-пасивного опонента"
```

---

### Task 9: Генератор епізодів — лінія агресора, сценарій rfi

**Files:**
- Create: `web/src/engine/postflop/episode.ts` (типи стану — окремо, бо їх ділять build.ts і step.ts)
- Create: `web/src/engine/postflop/build.ts`
- Test: `web/src/engine/postflop/build.test.ts`

- [ ] **Step 1: Створити типи стану епізоду**

Файл `web/src/engine/postflop/episode.ts`:

```ts
/**
 * Стан однієї роздачі. Виділений окремо від build.ts і step.ts, бо його ділять
 * обидва: build створює, step рухає.
 *
 * Стан мутабельний навмисно — так само, як PreProgress у префлопі: стор клонує
 * його перед викликом, а рушій лишається синхронним і без копій на кожен крок.
 */

import type { Card, Position } from '../types'
import type { BoardEvents, PostCategory, Street, Texture } from './types'

export interface EpisodeSeat {
  readonly pos: Position
  readonly hole: readonly Card[]
  readonly hero: boolean
  /** Скільки лишилось у стеку. */
  stack: number
  /** Вкладено на поточній вулиці. */
  put: number
  folded: boolean
}

export interface ShownHand {
  readonly pos: Position
  readonly hole: readonly Card[]
  readonly label: string
  readonly won: boolean
}

export interface EpisodeEnd {
  readonly kind: 'hero-folded' | 'villains-folded' | 'showdown'
  readonly heroWon: boolean
  readonly potBB: number
  /** Порожньо, якщо до шоудауну не дійшло. */
  readonly shown: readonly ShownHand[]
}

export interface EpisodeState {
  readonly line: 'aggressor' | 'caller'
  readonly scenario: 'rfi' | 'iso' | 'vsraise'
  readonly heroPos: Position
  readonly seats: EpisodeSeat[]
  /** Індекс героя в seats. */
  readonly heroIdx: number
  /** Текстура флопу фіксується один раз і далі не перераховується. */
  readonly texture: Texture
  /** Герой у позиції відносно всіх колерів (рахується на роздачі). */
  readonly ip: boolean
  readonly deck: Card[]
  board: Card[]
  street: Street
  potBB: number
  /** Ставка, яку треба зрівняти на цій вулиці. */
  bet: number
  /** На вулиці вже був рейз — більше рейзів не буває (cap, спека §3.3). */
  raised: boolean
  /** Хто вже діяв на цій вулиці після останньої ставки. */
  acted: Set<number>
  /** Скільки разів опоненти проявили агресію за всю роздачу. */
  villainAggro: number
  /** На попередній вулиці ставок не було. */
  delayed: boolean
  /** Чи були ставки на поточній вулиці — потрібно для delayed наступної. */
  streetHadBet: boolean
  /** Стрічка подій роздачі для UI, українською. */
  history: string[]
  finished: EpisodeEnd | null
}
```

Імпорт типів у цьому файлі — рівно те, що вжите: `import type { Card, Position } from '../types'` і `import type { Street, Texture } from './types'`.

- [ ] **Step 2: Написати падаючий тест генератора**

```ts
import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { BUILD, buildEpisode } from './build'
import { cardCode } from './deck'
import { evalHand } from './evaluate'
import { RFI, VS_RAISE, BUCKET, HERO_CTX } from '../ranges'
import { POSTFLOP_ORDER, type Position } from '../types'
import { isStrong } from './types'

const sample = (n: number, seed = 1) =>
  Array.from({ length: n }, (_, i) => buildEpisode({ rng: mulberry32(seed + i) }))

describe('buildEpisode · rfi', () => {
  it('той самий seed дає той самий епізод', () => {
    const a = buildEpisode({ rng: mulberry32(11) })
    const b = buildEpisode({ rng: mulberry32(11) })
    expect(a.board.map(cardCode)).toEqual(b.board.map(cardCode))
    expect(a.seats.map((s) => s.hole.map(cardCode))).toEqual(b.seats.map((s) => s.hole.map(cardCode)))
  })

  it('рука героя завжди з його RFI-діапазону', () => {
    for (const ep of sample(300)) {
      const hero = ep.seats[ep.heroIdx]
      expect(hero).toBeDefined()
      const hand = handOf(hero!.hole)
      expect(RFI[ep.heroPos]?.has(hand), `${ep.heroPos}: ${hand}`).toBe(true)
    }
  })

  it('руки колерів завжди з їхніх діапазонів захисту', () => {
    for (const ep of sample(300, 500)) {
      const bucket = BUCKET(ep.heroPos)
      for (const seat of ep.seats) {
        if (seat.hero) continue
        const range = VS_RAISE[bucket].call[HERO_CTX(seat.pos)]
        expect(range.has(handOf(seat.hole)), `${seat.pos} проти ${ep.heroPos}`).toBe(true)
      }
    }
  })

  it('карти ніде не повторюються', () => {
    for (const ep of sample(200, 900)) {
      const all = [...ep.board, ...ep.seats.flatMap((s) => [...s.hole])].map(cardCode)
      expect(new Set(all).size, `дублікат у ${all.join(' ')}`).toBe(all.length)
    }
  })

  it('BB героєм не буває, колери діють після героя на префлопі', () => {
    for (const ep of sample(300, 1300)) {
      expect(ep.heroPos).not.toBe('BB')
      expect(ep.seats.filter((s) => !s.hero).length).toBeGreaterThanOrEqual(1)
      expect(ep.seats.filter((s) => !s.hero).length).toBeLessThanOrEqual(3)
    }
  })

  it('ip рахується за постфлоп-порядком', () => {
    for (const ep of sample(200, 1700)) {
      const heroIdx = POSTFLOP_ORDER.indexOf(ep.heroPos as (typeof POSTFLOP_ORDER)[number])
      const want = ep.seats
        .filter((s) => !s.hero)
        .every((s) => POSTFLOP_ORDER.indexOf(s.pos as (typeof POSTFLOP_ORDER)[number]) < heroIdx)
      expect(ep.ip, `${ep.heroPos} проти ${ep.seats.map((s) => s.pos).join(',')}`).toBe(want)
    }
  })

  it('банк рахується за формулою референсу', () => {
    for (const ep of sample(200, 2100)) {
      const callers = ep.seats.filter((s) => !s.hero).map((s) => s.pos)
      const dead = callers.includes('SB') || callers.includes('BB') ? 0.5 : 1.5
      expect(ep.potBB).toBe(Math.round((3 * (1 + callers.length) + dead) * 2) / 2)
    }
  })

  it('стеки зменшені на префлоп-внесок', () => {
    for (const ep of sample(100, 2500)) {
      for (const seat of ep.seats) expect(seat.stack).toBe(BUILD.startStack - 3)
    }
  })

  it('починається з флопу без ставок', () => {
    const ep = buildEpisode({ rng: mulberry32(33) })
    expect(ep.street).toBe('flop')
    expect(ep.board).toHaveLength(3)
    expect(ep.bet).toBe(0)
    expect(ep.raised).toBe(false)
    expect(ep.finished).toBeNull()
    expect(ep.history[0]).toMatch(/відкрив/)
  })

  it('частка епізодів із сильним опонентом близька до цільової', () => {
    const eps = sample(1500, 4000)
    const strong = eps.filter((ep) =>
      ep.seats.some((s) => !s.hero && isStrong(evalHand(s.hole, ep.board).cat)),
    ).length
    const share = strong / eps.length
    expect(share, `частка ${share}`).toBeGreaterThan(0.24)
    expect(share, `частка ${share}`).toBeLessThan(0.37)
  })
})

/** Канонічна рука з двох карт: 'AKs', 'AKo', '77'. */
function handOf(hole: readonly { rk: string; s: number }[]): string {
  const ORDER = 'AKQJT98765432'
  const a = hole[0]
  const b = hole[1]
  if (!a || !b) throw new Error('порожня рука')
  const [hi, lo] = ORDER.indexOf(a.rk) <= ORDER.indexOf(b.rk) ? [a, b] : [b, a]
  if (hi.rk === lo.rk) return `${hi.rk}${lo.rk}`
  return `${hi.rk}${lo.rk}${hi.s === lo.s ? 's' : 'o'}`
}
```

- [ ] **Step 3: Запустити — має впасти**

Run: `npm test -- build.test`
Expected: FAIL, `Failed to resolve import "./build"`.

- [ ] **Step 4: Реалізувати**

```ts
/**
 * Роздача постфлоп-епізоду.
 *
 * Сумісність із префлопом тримається на тому, що жодних власних діапазонів тут
 * немає: рука героя береться з RFI його позиції, руки колерів — з тих самих
 * чартів захисту, які тренує сценарій vsraise. Тому спот, який герой бачить на
 * флопі, міг реально виникнути з префлопу, якого його вчили.
 */

import { combos } from '../cards'
import { BUCKET, HERO_CTX, OPEN_ORDER, RFI, VS_RAISE } from '../ranges'
import { ACTION_ORDER, POSTFLOP_ORDER, type Hand, type Position, type Rng } from '../types'
import { drawCards, drawHand, makeDeck } from './deck'
import type { EpisodeSeat, EpisodeState } from './episode'
import { evalHand, texture } from './evaluate'
import { isStrong } from './types'

export const BUILD = {
  /** Ефективні стеки на початку роздачі, bb. */
  startStack: 100,
  /** Розмір опену, bb. */
  openBB: 3,
  /** Цільова частка епізодів, де хоча б один опонент має на флопі силу. */
  strongShare: 0.3,
  /** Скільки разів перероздаємо заради цільової частки, перш ніж узяти як є. */
  maxTries: 50,
} as const

export interface BuildOptions {
  readonly rng?: Rng
  readonly strongShare?: number
  readonly maxTries?: number
}

/** Позиції, які можуть бути героєм-агресором: ті, що відкривають пот, плюс SB. */
const HERO_POSITIONS: readonly Position[] = [...OPEN_ORDER, 'SB']

/** Рука з діапазону, зважена за комбінаціями — так само, як у референсі. */
function pickWeighted(range: ReadonlySet<Hand>, rng: Rng): Hand | null {
  const bag: Hand[] = []
  for (const h of range) {
    const n = Math.max(1, combos(h) / 2)
    for (let i = 0; i < n; i++) bag.push(h)
  }
  if (bag.length === 0) return null
  return bag[Math.floor(rng() * bag.length)] ?? null
}

/** Одна спроба роздачі. null — не склалось (карт забракло), викликач пробує ще. */
function dealOnce(rng: Rng): EpisodeState | null {
  const heroPos = HERO_POSITIONS[Math.floor(rng() * HERO_POSITIONS.length)]
  if (heroPos === undefined) return null

  const hi = ACTION_ORDER.indexOf(heroPos)
  const bucket = BUCKET(heroPos)
  // Кандидати в колери: діють після героя і мають непорожній діапазон захисту.
  const pool = ACTION_ORDER.slice(hi + 1).filter(
    (p) => VS_RAISE[bucket].call[HERO_CTX(p)].size > 0,
  )
  if (pool.length === 0) return null

  // Ваги кількості опонентів — з референсу: 50% один, 36% два, 14% три.
  const wanted = rng() < 0.5 ? 1 : rng() < 0.72 ? 2 : 3
  const callers: Position[] = []
  const rest = [...pool]
  for (let k = 0; k < Math.min(wanted, rest.length); k++) {
    const idx = Math.floor(rng() * rest.length)
    const [pos] = rest.splice(idx, 1)
    if (pos) callers.push(pos)
  }
  if (callers.length === 0) return null

  const deck = makeDeck()

  const heroHand = pickWeighted(RFI[heroPos] ?? new Set<Hand>(), rng)
  if (heroHand === null) return null
  const heroHole = drawHand(deck, heroHand, rng)
  if (heroHole === null) return null

  const seats: EpisodeSeat[] = []
  const stack = BUILD.startStack - BUILD.openBB

  // Порядок сітів — постфлопний: так само читається і рушієм, і UI.
  const inHand: Position[] = [heroPos, ...callers]
  const ordered = POSTFLOP_ORDER.filter((p) => inHand.includes(p))

  for (const pos of ordered) {
    if (pos === heroPos) {
      seats.push({ pos, hole: heroHole, hero: true, stack, put: 0, folded: false })
      continue
    }
    const hand = pickWeighted(villainRange(pos), rng)
    if (hand === null) return null
    const hole = drawHand(deck, hand, rng)
    if (hole === null) return null
    seats.push({ pos, hole, hero: false, stack, put: 0, folded: false })
  }

  const board = drawCards(deck, 3, rng)
  if (board.length < 3) return null

  const heroIdx = seats.findIndex((s) => s.hero)
  const heroOrder = POSTFLOP_ORDER.indexOf(heroPos)
  const ip = callers.every((c) => POSTFLOP_ORDER.indexOf(c) < heroOrder)

  const dead = callers.includes('SB') || callers.includes('BB') ? 0.5 : 1.5
  const potBB = Math.round((BUILD.openBB * (1 + callers.length) + dead) * 2) / 2

  return {
    line: 'aggressor',
    scenario: 'rfi',
    heroPos,
    seats,
    heroIdx,
    texture: texture(board).t,
    ip,
    deck,
    board,
    street: 'flop',
    potBB,
    bet: 0,
    raised: false,
    acted: new Set<number>(),
    villainAggro: 0,
    delayed: false,
    streetHadBet: false,
    history: [
      `Ти відкрив з ${heroPos} на ${BUILD.openBB}bb, колл — ${callers.join(', ')}.`,
    ],
    finished: null,
  }
}

/**
 * Роздає епізод. Rejection sampling підтягує частку роздач, де опонент має
 * силу: інакше чек-рейзи й барелі траплялись би надто рідко, щоб їх тренувати.
 * Карти після прийняття не підмінюються — шоудаун лишається чесним.
 */
export function buildEpisode(options: BuildOptions = {}): EpisodeState {
  const rng = options.rng ?? Math.random
  const share = options.strongShare ?? BUILD.strongShare
  const tries = options.maxTries ?? BUILD.maxTries

  const wantStrong = rng() < share
  let fallback: EpisodeState | null = null

  for (let i = 0; i < tries; i++) {
    const ep = dealOnce(rng)
    if (ep === null) continue
    fallback ??= ep
    const hasStrong = ep.seats.some((s) => !s.hero && isStrong(evalHand(s.hole, ep.board).cat))
    if (hasStrong === wantStrong) return ep
  }

  if (fallback !== null) return fallback
  throw new Error('не вдалося роздати епізод')
}
```

- [ ] **Step 5: Запустити — має пройти**

Run: `npm test -- build.test`
Expected: PASS, 10 тестів.

- [ ] **Step 6: Коміт**

```bash
git add web/src/engine/postflop/episode.ts web/src/engine/postflop/build.ts web/src/engine/postflop/build.test.ts && git commit -m "post-1: роздача епізодів лінії агресора"
```

---

### Task 10: Епізоди сценарію iso (ізолейт проти лімперів)

Спека §3.1 вимагає iso в MVP. Лімп-діапазону в чартах немає — його визначає спека, тож це нові дані, а не порт.

**Files:**
- Modify: `web/src/engine/postflop/build.ts`
- Modify: `web/src/engine/postflop/build.test.ts`

- [ ] **Step 1: Дописати падаючий тест**

Додати в `build.test.ts` новий `describe` і розширити імпорт: `import { BUILD, LIMP_CALL, LIMP_RANGE, buildEpisode } from './build'`, `import { ISO } from '../ranges'`.

```ts
describe('buildEpisode · iso', () => {
  const isoSample = (n: number, seed = 1) =>
    Array.from({ length: n }, (_, i) => buildEpisode({ scenario: 'iso', rng: mulberry32(seed + i) }))

  it('рука героя з ISO-діапазону, а не з RFI', () => {
    for (const ep of isoSample(200)) {
      expect(ep.scenario).toBe('iso')
      const hero = ep.seats[ep.heroIdx]
      expect(ISO[ep.heroPos]?.has(handOf(hero!.hole)), `${ep.heroPos}`).toBe(true)
    }
  })

  it('опоненти — лімпери, що заколлювали ізолейт', () => {
    for (const ep of isoSample(200, 700)) {
      for (const seat of ep.seats) {
        if (seat.hero) continue
        const hand = handOf(seat.hole)
        expect(LIMP_RANGE.has(hand), `${hand} має бути в лімп-діапазоні`).toBe(true)
        expect(LIMP_CALL.has(hand), `${hand} мав би сфолдити ізолейт`).toBe(true)
      }
    }
  })

  it('лімперів один-два, банк більший за rfi', () => {
    for (const ep of isoSample(200, 1500)) {
      const n = ep.seats.filter((s) => !s.hero).length
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(2)
      expect(ep.potBB).toBeGreaterThan(9)
    }
  })

  it('стрічка історії згадує лімперів', () => {
    const ep = buildEpisode({ scenario: 'iso', rng: mulberry32(21) })
    expect(ep.history[0]).toMatch(/ізо-рейз/)
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- build.test`
Expected: FAIL — `scenario` не приймається в `BuildOptions`, `LIMP_RANGE` не експортується.

- [ ] **Step 3: Реалізувати**

У `build.ts` додати діапазони й гілку роздачі:

```ts
import { BUCKET, HERO_CTX, ISO, OPEN_ORDER, RFI, S, VS_RAISE } from '../ranges'
```

```ts
/**
 * Лімп-діапазон мікрополя. Джерела в референсі немає — це нові дані, визначені
 * спекою (§3.1): типовий лузовий лімп 9-max кеша на низьких лімітах.
 */
export const LIMP_RANGE: ReadonlySet<Hand> = S(
  '22-99',
  'A2s-A9s',
  'KTs',
  'QTs',
  'JTs',
  'T9s',
  '98s',
  '87s',
  '76s',
  '65s',
  'KJo',
  'QJo',
  'JTo',
  'A2o-A9o',
)

/** Чим лімпер продовжує проти ізолейту: пари, мастеві й бродвейний офсьют. */
export const LIMP_CALL: ReadonlySet<Hand> = S(
  '22-99',
  'A2s-A9s',
  'KTs',
  'QTs',
  'JTs',
  'T9s',
  '98s',
  '87s',
  '76s',
  '65s',
  'KJo',
  'QJo',
  'JTo',
)
```

Розширити опції:

```ts
export interface BuildOptions {
  readonly scenario?: 'rfi' | 'iso'
  readonly rng?: Rng
  readonly strongShare?: number
  readonly maxTries?: number
}
```

`dealOnce(rng)` стає `dealOnce(scenario: 'rfi' | 'iso', rng: Rng)`. Всередині розділяються чотири речі:

```ts
  const isIso = scenario === 'iso'

  // Діапазон героя.
  const heroRange = isIso ? (ISO[heroPos] ?? new Set<Hand>()) : (RFI[heroPos] ?? new Set<Hand>())

  // Опоненти: для iso — лімпери з власним діапазоном, для rfi — колери чарту захисту.
  const pool = ACTION_ORDER.slice(hi + 1).filter((p) =>
    isIso ? true : VS_RAISE[bucket].call[HERO_CTX(p)].size > 0,
  )
  const wanted = isIso ? (rng() < 0.55 ? 1 : 2) : rng() < 0.5 ? 1 : rng() < 0.72 ? 2 : 3

  // Викликається в циклі сітів замість інлайнового VS_RAISE[...] з кроку Task 9.
  const villainRange = (pos: Position): ReadonlySet<Hand> =>
    isIso ? LIMP_CALL : VS_RAISE[bucket].call[HERO_CTX(pos)]

  // Розмір ізолейту — як у префлопі: 4bb + 1 за кожного лімпера.
  const raiseBB = isIso ? 4 + callers.length : BUILD.openBB
```

Банк і стеки:

```ts
  const stack = BUILD.startStack - raiseBB
  const dead = callers.includes('SB') || callers.includes('BB') ? 0.5 : 1.5
  const potBB = Math.round((raiseBB * (1 + callers.length) + dead) * 2) / 2
```

Історія:

```ts
    history: [
      isIso
        ? `Ти зробив ізо-рейз ${raiseBB}bb з ${heroPos}, колл — ${callers.join(', ')}.`
        : `Ти відкрив з ${heroPos} на ${BUILD.openBB}bb, колл — ${callers.join(', ')}.`,
    ],
```

І `scenario` в стані: `scenario,` замість літерала `'rfi'`.

`buildEpisode` передає сценарій далі:

```ts
export function buildEpisode(options: BuildOptions = {}): EpisodeState {
  const rng = options.rng ?? Math.random
  const scenario = options.scenario ?? 'rfi'
  ...
    const ep = dealOnce(scenario, rng)
  ...
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npm test -- build.test`
Expected: PASS, 14 тестів. Тест «стеки зменшені на префлоп-внесок» стосується лише rfi — переконатись, що він викликає `buildEpisode` без `scenario`.

- [ ] **Step 5: Коміт**

```bash
git add web/src/engine/postflop/build.ts web/src/engine/postflop/build.test.ts && git commit -m "post-1: iso-епізоди з лімп-діапазоном"
```

---

### Task 11: Редюсер роздачі

Веде епізод від флопу до термінала: опоненти діють самі, герой зупиняє машину на кожному своєму рішенні.

**Files:**
- Modify: `web/src/engine/postflop/episode.ts` (одне нове поле)
- Create: `web/src/engine/postflop/step.ts`
- Test: `web/src/engine/postflop/step.test.ts`

- [ ] **Step 1: Додати поле у стан епізоду**

У `web/src/engine/postflop/episode.ts`, у `EpisodeState`, після поля `raised`:

```ts
  /**
   * Частка банку в останній ставці на вулиці: за нею відрізняється «мала» ціна
   * (≤0.4) від «великої». Рейз завжди рахується великою ціною.
   */
  lastBetFraction: number
```

У `build.ts`, у поверненому обʼєкті, після `raised: false,` додати `lastBetFraction: 0,`.

- [ ] **Step 2: Написати падаючий тест**

```ts
import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { BUILD } from './build'
import { cardCode } from './deck'
import { answerPost, heroDecision, startEpisode } from './step'
import type { PostAction } from './types'

/** Прогонить епізод до кінця, щоразу віддаючи правильну відповідь. */
function playCorrect(seed: number): ReturnType<typeof startEpisode> {
  const ep = startEpisode({ rng: mulberry32(seed) })
  const rng = mulberry32(seed + 10_000)
  let guard = 0
  while (!ep.finished && guard++ < 20) {
    const d = heroDecision(ep)
    if (!d) break
    answerPost(ep, d.correct, rng)
  }
  return ep
}

/** Прогонить епізод, щоразу віддаючи задану дію, якщо вона доступна. */
function playWith(seed: number, prefer: PostAction): ReturnType<typeof startEpisode> {
  const ep = startEpisode({ rng: mulberry32(seed) })
  const rng = mulberry32(seed + 10_000)
  let guard = 0
  while (!ep.finished && guard++ < 20) {
    const d = heroDecision(ep)
    if (!d) break
    const has = d.options.some((o) => o.k === prefer)
    answerPost(ep, has ? prefer : (d.options[0]?.k ?? 'check'), rng)
  }
  return ep
}

describe('startEpisode', () => {
  it('той самий seed дає той самий стан і те саме рішення', () => {
    const a = startEpisode({ rng: mulberry32(5) })
    const b = startEpisode({ rng: mulberry32(5) })
    expect(a.board.map(cardCode)).toEqual(b.board.map(cardCode))
    expect(heroDecision(a)?.correct).toBe(heroDecision(b)?.correct)
  })

  it('герой або має рішення, або роздача вже завершена', () => {
    for (let s = 1; s <= 200; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      expect(ep.finished !== null || heroDecision(ep) !== null, `seed ${s}`).toBe(true)
    }
  })

  it('на флопі без ставок пропонує чек і два сайзи в порядку хоткеїв', () => {
    for (let s = 1; s <= 100; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const d = heroDecision(ep)
      if (!d || d.facing !== 'none') continue
      expect(d.options.map((o) => o.k)).toEqual(['check', 'b33', 'b66'])
      expect(d.options[1]?.l).toMatch(/33% · [\d.]+bb/)
      return
    }
    throw new Error('не трапився спот без ставки — перевір генератор')
  })
})

describe('дії героя', () => {
  it('фолд завершує роздачу', () => {
    const ep = startEpisode({ rng: mulberry32(3) })
    answerPost(ep, 'fold', mulberry32(3))
    expect(ep.finished?.kind).toBe('hero-folded')
    expect(ep.finished?.heroWon).toBe(false)
    expect(heroDecision(ep)).toBeNull()
  })

  it('ставка збільшує банк і зменшує стек героя', () => {
    for (let s = 1; s <= 100; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const d = heroDecision(ep)
      if (!d || d.facing !== 'none') continue
      const potBefore = ep.potBB
      const stackBefore = ep.seats[ep.heroIdx]?.stack ?? 0
      answerPost(ep, 'b66', mulberry32(s + 1))
      expect(ep.potBB).toBeGreaterThan(potBefore)
      expect(ep.seats[ep.heroIdx]?.stack).toBeLessThan(stackBefore)
      return
    }
    throw new Error('не трапився спот без ставки')
  })

  it('правильна відповідь дає ok, неправильна — ні', () => {
    const ep = startEpisode({ rng: mulberry32(9) })
    const d = heroDecision(ep)
    expect(d).not.toBeNull()
    const wrong = d!.options.map((o) => o.k).find((k) => k !== d!.correct)
    expect(wrong).toBeDefined()
    const res = answerPost(ep, wrong!, mulberry32(9))
    expect(res.ok).toBe(false)
    expect(res.decision.correct).toBe(d!.correct)
  })

  it('відповідь після завершення роздачі — виняток, а не мовчазний no-op', () => {
    const ep = startEpisode({ rng: mulberry32(4) })
    answerPost(ep, 'fold', mulberry32(4))
    expect(() => answerPost(ep, 'check', mulberry32(4))).toThrow(/не треба діяти/)
  })
})

describe('перебіг роздачі', () => {
  it('роздача завжди доходить до термінала', () => {
    for (let s = 1; s <= 300; s++) {
      const ep = playCorrect(s)
      expect(ep.finished, `seed ${s}`).not.toBeNull()
      expect(['hero-folded', 'villains-folded', 'showdown']).toContain(ep.finished?.kind)
    }
  })

  it('борд росте рівно до пʼяти карт і ніколи не повторює карту', () => {
    for (let s = 1; s <= 200; s++) {
      const ep = playCorrect(s)
      expect(ep.board.length).toBeGreaterThanOrEqual(3)
      expect(ep.board.length).toBeLessThanOrEqual(5)
      const all = [...ep.board, ...ep.seats.flatMap((x) => [...x.hole])].map(cardCode)
      expect(new Set(all).size, `seed ${s}`).toBe(all.length)
    }
  })

  it('шоудаун показує карти всіх, хто дійшов, і має переможця', () => {
    let seen = 0
    for (let s = 1; s <= 300 && seen < 5; s++) {
      const ep = playCorrect(s)
      if (ep.finished?.kind !== 'showdown') continue
      seen++
      expect(ep.board).toHaveLength(5)
      expect(ep.finished.shown.length).toBeGreaterThanOrEqual(2)
      expect(ep.finished.shown.some((h) => h.won)).toBe(true)
      for (const h of ep.finished.shown) expect(h.label.length).toBeGreaterThan(0)
    }
    expect(seen, 'шоудауни мають траплятись').toBeGreaterThan(0)
  })

  it('стеки не йдуть у мінус, банк не перевищує всіх внесків', () => {
    for (let s = 1; s <= 200; s++) {
      const ep = playWith(s, 'b66')
      for (const seat of ep.seats) expect(seat.stack, `seed ${s}`).toBeGreaterThanOrEqual(0)
      const putIn = ep.seats.reduce((sum, x) => sum + (BUILD.startStack - x.stack), 0)
      expect(ep.potBB).toBeLessThanOrEqual(putIn + 1.5)
    }
  })

  it('на одній вулиці не буває двох рейзів — cap тримає', () => {
    for (let s = 1; s <= 200; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const rng = mulberry32(s + 5)
      let guard = 0
      let street = ep.street
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        if (d.street !== street) {
          street = d.street
          expect(ep.raised, `seed ${s}: нова вулиця має скидати cap`).toBe(false)
        }
        answerPost(ep, d.correct, rng)
      }
    }
  })

  it('проти рейзу кнопки рейзу немає — ре-рейзів у моделі не існує', () => {
    let seen = 0
    for (let s = 1; s <= 400 && seen < 3; s++) {
      const ep = startEpisode({ rng: mulberry32(s) })
      const rng = mulberry32(s + 77)
      let guard = 0
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        if (d.facing === 'raise') {
          seen++
          expect(d.options.map((o) => o.k)).toEqual(['fold', 'call'])
          break
        }
        answerPost(ep, d.options.some((o) => o.k === 'b66') ? 'b66' : d.correct, rng)
      }
    }
    expect(seen, 'рейзи опонентів мають траплятись').toBeGreaterThan(0)
  })

  it('стрічка історії поповнюється і починається з префлопу', () => {
    const ep = playCorrect(12)
    expect(ep.history[0]).toMatch(/відкрив|ізо-рейз/)
    expect(ep.history.length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 3: Запустити — має впасти**

Run: `npm test -- step.test`
Expected: FAIL, `Failed to resolve import "./step"`.

- [ ] **Step 4: Реалізувати**

```ts
/**
 * Редюсер роздачі: опоненти діють самі, герой зупиняє машину на кожному
 * власному рішенні.
 *
 * Оцінка завжди йде від ФАКТИЧНОЇ лінії: якщо герой помилився на флопі, терн
 * оцінюється в контексті того, як роздача склалась, а не як «мало бути».
 */

import { POSTFLOP_ORDER, type Rng } from '../types'
import { buildEpisode, type BuildOptions } from './build'
import { boardCode, drawCards } from './deck'
import type { EpisodeEnd, EpisodeState } from './episode'
import { boardEvents, evalHand } from './evaluate'
import { decideBet } from './matrixBet'
import { decideDefend } from './matrixDefend'
import { RANK_LABEL, rank7, showdownWinners } from './showdown'
import {
  STREET_LABEL,
  type BoardEvents,
  type Facing,
  type PostAction,
  type PostCategory,
  type Street,
  type Texture,
} from './types'
import { villainBetFraction, villainDonk, villainOpen, villainVsBet } from './villain'

/** Ціна вище цієї частки банку вважається великою (спека §5). */
const BIG_PRICE = 0.4
/** Рейз — завжди втричі від ставки (спека §3.2). */
const RAISE_FACTOR = 3

/** Заокруглення до 0.5bb — як у референсі. */
const r = (x: number): number => Math.round(x * 2) / 2

export interface PostActionOption {
  readonly k: PostAction
  readonly l: string
  readonly c: 'primary' | 'mid' | 'soft' | 'ghost'
}

export interface HeroDecision {
  readonly street: Street
  readonly facing: Facing
  readonly cat: PostCategory
  readonly label: string
  readonly texture: Texture
  readonly events: BoardEvents
  readonly nOpps: number
  readonly ip: boolean
  readonly potBB: number
  readonly toCallBB: number
  readonly repeatAggro: boolean
  readonly options: readonly PostActionOption[]
  readonly correct: PostAction
  readonly why: string
}

export interface PostAnswerResult {
  readonly ok: boolean
  /** Контекст рішення на момент відповіді — саме він іде в журнал. */
  readonly decision: HeroDecision
  readonly finished: EpisodeEnd | null
}

const activeCount = (ep: EpisodeState): number => ep.seats.filter((s) => !s.folded).length

function needsAction(ep: EpisodeState, i: number): boolean {
  const seat = ep.seats[i]
  if (!seat || seat.folded) return false
  if (seat.put < ep.bet) return true
  return !ep.acted.has(i)
}

/** Сіти зберігаються в постфлоп-порядку, тож достатньо першого, хто винен дію. */
function nextActor(ep: EpisodeState): number | undefined {
  for (let i = 0; i < ep.seats.length; i++) if (needsAction(ep, i)) return i
  return undefined
}

function commit(ep: EpisodeState, i: number, amount: number): void {
  const seat = ep.seats[i]
  if (!seat) return
  const pay = Math.max(0, Math.min(amount, seat.stack))
  seat.stack = r(seat.stack - pay)
  seat.put = r(seat.put + pay)
  ep.potBB = r(ep.potBB + pay)
}

/** Доводить внесок сіта до targetPut і відкриває нове коло дій. */
function placeBet(ep: EpisodeState, i: number, targetPut: number, kind: 'bet' | 'raise'): void {
  const seat = ep.seats[i]
  if (!seat) return
  commit(ep, i, r(targetPut) - seat.put)
  ep.bet = seat.put
  ep.streetHadBet = true
  ep.raised = kind === 'raise' ? true : ep.raised
  ep.acted = new Set<number>([i])
}

function finishByFolds(ep: EpisodeState): void {
  const heroAlive = ep.seats[ep.heroIdx]?.folded === false
  ep.history.push(heroAlive ? 'Усі скинули — банк твій.' : 'Роздача завершена.')
  ep.finished = {
    kind: heroAlive ? 'villains-folded' : 'hero-folded',
    heroWon: heroAlive,
    potBB: ep.potBB,
    shown: [],
  }
}

function showdown(ep: EpisodeState): void {
  const idx = ep.seats.map((_, i) => i).filter((i) => ep.seats[i]?.folded === false)
  const holes = idx.map((i) => ep.seats[i]?.hole ?? [])
  const winners = new Set(showdownWinners(holes, ep.board).map((w) => idx[w]))
  ep.history.push('Шоудаун.')
  ep.finished = {
    kind: 'showdown',
    heroWon: winners.has(ep.heroIdx),
    potBB: ep.potBB,
    shown: idx.map((i) => {
      const seat = ep.seats[i]
      const hole = seat?.hole ?? []
      return {
        pos: seat?.pos ?? POSTFLOP_ORDER[0],
        hole,
        label: RANK_LABEL[rank7([...hole, ...ep.board]).cat] ?? '',
        won: winners.has(i),
      }
    }),
  }
}

function closeStreet(ep: EpisodeState, rng: Rng): void {
  ep.delayed = !ep.streetHadBet
  if (ep.street === 'river') {
    showdown(ep)
    return
  }
  const [card] = drawCards(ep.deck, 1, rng)
  if (card) ep.board.push(card)
  ep.street = ep.street === 'flop' ? 'turn' : 'river'
  ep.bet = 0
  ep.raised = false
  ep.streetHadBet = false
  ep.lastBetFraction = 0
  ep.acted = new Set<number>()
  for (const seat of ep.seats) seat.put = 0
  ep.history.push(`${STREET_LABEL[ep.street]}: ${boardCode(ep.board)}`)
}

function villainAct(ep: EpisodeState, i: number, rng: Rng): void {
  const seat = ep.seats[i]
  if (!seat) return
  const { cat } = evalHand(seat.hole, ep.board)
  const owed = r(ep.bet - seat.put)

  if (owed > 0) {
    const move = villainVsBet(cat, ep.street, ep.lastBetFraction > BIG_PRICE, ep.raised, rng)
    if (move === 'fold') {
      seat.folded = true
      ep.acted.add(i)
      ep.history.push(`${seat.pos} скинув.`)
      return
    }
    if (move === 'call') {
      commit(ep, i, owed)
      ep.acted.add(i)
      ep.history.push(`${seat.pos} заколлював ${owed}bb.`)
      return
    }
    const target = r(ep.bet * RAISE_FACTOR)
    placeBet(ep, i, target, 'raise')
    ep.lastBetFraction = 1
    ep.villainAggro++
    ep.history.push(`${seat.pos} рейзить до ${target}bb.`)
    return
  }

  // Ставки немає. До дії героя це донк-бет, після — звичайна ставка у слабкість.
  const heroActed = ep.acted.has(ep.heroIdx)
  const move = heroActed ? villainOpen(cat, ep.street, rng) : villainDonk(cat, ep.street, rng)
  if (move === 'check') {
    ep.acted.add(i)
    ep.history.push(`${seat.pos} чекнув.`)
    return
  }
  const frac = villainBetFraction(cat)
  const size = r(ep.potBB * frac)
  ep.lastBetFraction = frac
  placeBet(ep, i, seat.put + size, 'bet')
  ep.villainAggro++
  ep.history.push(`${seat.pos} ставить ${size}bb.`)
}

/** Прокручує дії опонентів, доки не настане черга героя або роздача не скінчиться. */
export function advance(ep: EpisodeState, rng: Rng): void {
  let guard = 0
  while (ep.finished === null && guard++ < 500) {
    if (activeCount(ep) <= 1) {
      finishByFolds(ep)
      return
    }
    const next = nextActor(ep)
    if (next === undefined) {
      closeStreet(ep, rng)
      continue
    }
    if (next === ep.heroIdx) return
    villainAct(ep, next, rng)
  }
}

function betOptions(ep: EpisodeState): PostActionOption[] {
  return [
    { k: 'check', l: 'Чек', c: 'ghost' },
    { k: 'b33', l: `Ставка 33% · ${r(ep.potBB * 0.33)}bb`, c: 'soft' },
    { k: 'b66', l: `Ставка 66% · ${r(ep.potBB * 0.66)}bb`, c: 'primary' },
  ]
}

function defendOptions(ep: EpisodeState, facing: Facing, owed: number): PostActionOption[] {
  const base: PostActionOption[] = [
    { k: 'fold', l: 'Фолд', c: 'ghost' },
    { k: 'call', l: `Колл ${owed}bb`, c: 'mid' },
  ]
  // Проти рейзу ре-рейзу немає: рейз пасивного гравця означає силу (спека §3.3).
  if (facing === 'raise') return base
  return [...base, { k: 'raise', l: `Рейз ${r(ep.bet * RAISE_FACTOR)}bb`, c: 'primary' }]
}

export function heroDecision(ep: EpisodeState): HeroDecision | null {
  if (ep.finished !== null) return null
  const hero = ep.seats[ep.heroIdx]
  if (!hero || hero.folded) return null
  if (!needsAction(ep, ep.heroIdx)) return null

  const ev = evalHand(hero.hole, ep.board)
  const events = boardEvents(ep.board)
  const nOpps = ep.seats.filter((s) => !s.folded && !s.hero).length
  const owed = r(ep.bet - hero.put)

  const facing: Facing =
    owed <= 0
      ? 'none'
      : hero.put > 0
        ? 'raise'
        : ep.lastBetFraction > BIG_PRICE
          ? 'big_bet'
          : 'small_bet'

  const decision =
    facing === 'none'
      ? decideBet({
          street: ep.street,
          cat: ev.cat,
          texture: ep.texture,
          events,
          nOpps,
          ip: ep.ip,
          delayed: ep.delayed,
          madeFlush: ev.madeFlush,
        })
      : decideDefend({
          street: ep.street,
          facing,
          cat: ev.cat,
          nOpps,
          repeatAggro: ep.villainAggro > 1,
        })

  return {
    street: ep.street,
    facing,
    cat: ev.cat,
    label: ev.label,
    texture: ep.texture,
    events,
    nOpps,
    ip: ep.ip,
    potBB: ep.potBB,
    toCallBB: Math.max(0, owed),
    repeatAggro: ep.villainAggro > 1,
    options: facing === 'none' ? betOptions(ep) : defendOptions(ep, facing, owed),
    correct: decision.action,
    why: decision.why,
  }
}

export function answerPost(ep: EpisodeState, chosen: PostAction, rng: Rng): PostAnswerResult {
  const decision = heroDecision(ep)
  if (decision === null) throw new Error('героєві зараз не треба діяти')

  const hero = ep.seats[ep.heroIdx]
  if (!hero) throw new Error('епізод без героя')
  const ok = chosen === decision.correct

  if (chosen === 'fold') {
    hero.folded = true
    ep.acted.add(ep.heroIdx)
    ep.history.push('Ти скинув.')
    ep.finished = { kind: 'hero-folded', heroWon: false, potBB: ep.potBB, shown: [] }
    return { ok, decision, finished: ep.finished }
  }

  if (chosen === 'check') {
    ep.acted.add(ep.heroIdx)
    ep.history.push('Ти чекнув.')
  } else if (chosen === 'call') {
    const owed = r(ep.bet - hero.put)
    commit(ep, ep.heroIdx, owed)
    ep.acted.add(ep.heroIdx)
    ep.history.push(`Ти заколлював ${owed}bb.`)
  } else if (chosen === 'raise') {
    const target = r(ep.bet * RAISE_FACTOR)
    placeBet(ep, ep.heroIdx, target, 'raise')
    ep.lastBetFraction = 1
    ep.history.push(`Ти рейзнув до ${target}bb.`)
  } else {
    const frac = chosen === 'b33' ? 0.33 : 0.66
    const size = r(ep.potBB * frac)
    ep.lastBetFraction = frac
    placeBet(ep, ep.heroIdx, hero.put + size, 'bet')
    ep.history.push(`Ти поставив ${size}bb.`)
  }

  advance(ep, rng)
  return { ok, decision, finished: ep.finished }
}

/** Роздає епізод і одразу прокручує його до першого рішення героя. */
export function startEpisode(options: BuildOptions = {}): EpisodeState {
  const rng = options.rng ?? Math.random
  const ep = buildEpisode(options)
  advance(ep, rng)
  return ep
}
```

- [ ] **Step 5: Запустити — має пройти**

Run: `npm test -- step.test`
Expected: PASS, 14 тестів.

Якщо тест «проти рейзу кнопки рейзу немає» не знаходить жодного рейзу — це сигнал, що опоненти не рейзять; перевірити `villainVsBet` і `ep.lastBetFraction`, **не** послаблювати тест.

- [ ] **Step 6: Коміт**

```bash
git add web/src/engine/postflop/episode.ts web/src/engine/postflop/build.ts web/src/engine/postflop/step.ts web/src/engine/postflop/step.test.ts && git commit -m "post-1: редюсер роздачі від флопу до термінала"
```

---

### Task 12: Локальні агрегати постфлопу

База — джерело істини, але тренування має працювати без мережі й логіну (правило 6 CLAUDE.md). Цей модуль — офлайн-буфер тієї самої форми, яку потім віддаватиме сервер.

**Files:**
- Create: `web/src/engine/postflop/postProgress.ts`
- Test: `web/src/engine/postflop/postProgress.test.ts`

- [ ] **Step 1: Написати падаючий тест**

```ts
import { describe, expect, it } from 'vitest'

import {
  POST_LOG_LIMIT,
  emptyPostProgress,
  postModeKey,
  recordPostAnswer,
  type PostAnswerInput,
  type PostProgress,
} from './postProgress'

const answer = (over: Partial<PostAnswerInput> = {}): PostAnswerInput => ({
  street: 'flop',
  cat: 'AIR',
  texture: 'DRY',
  facing: 'none',
  nOpps: 1,
  ip: true,
  chosen: 'check',
  correct: 'check',
  at: 1_700_000_000_000,
  ...over,
})

/** Прогонить n відповідей і повертає фінальну серію. */
function run(p: PostProgress, inputs: PostAnswerInput[]): number {
  let streak = 0
  for (const input of inputs) streak = recordPostAnswer(p, streak, input).streak
  return streak
}

describe('recordPostAnswer', () => {
  it('порожній прогрес — усі лічильники нульові', () => {
    const p = emptyPostProgress()
    expect(p.total).toBe(0)
    expect(p.log).toEqual([])
    expect(p.byStreet).toEqual({})
  })

  it('рахує загальні цифри і серію', () => {
    const p = emptyPostProgress()
    const streak = run(p, [answer(), answer(), answer({ chosen: 'b33' }), answer()])
    expect(p.total).toBe(4)
    expect(p.correct).toBe(3)
    expect(p.best).toBe(2)
    expect(streak).toBe(1)
  })

  it('розкладає по вулиці, категорії, текстурі, режиму і контексту', () => {
    const p = emptyPostProgress()
    run(p, [
      answer({ street: 'turn', cat: 'MEDIUM', texture: 'WET', nOpps: 2, ip: false }),
      answer({ street: 'turn', cat: 'MEDIUM', texture: 'WET', nOpps: 2, ip: false, chosen: 'b66' }),
      answer({ facing: 'big_bet', chosen: 'fold', correct: 'fold' }),
    ])
    expect(p.byStreet['turn']).toEqual({ t: 2, c: 1 })
    expect(p.byStreet['flop']).toEqual({ t: 1, c: 1 })
    expect(p.byCat['MEDIUM']).toEqual({ t: 2, c: 1 })
    expect(p.byTex['WET']).toEqual({ t: 2, c: 1 })
    expect(p.byMode['MULTI·OOP']).toEqual({ t: 2, c: 1 })
    expect(p.byFacing['big_bet']).toEqual({ t: 1, c: 1 })
  })

  it('журнал поповнюється лише помилками', () => {
    const p = emptyPostProgress()
    run(p, [answer(), answer({ chosen: 'b66' }), answer()])
    expect(p.log).toHaveLength(1)
    expect(p.log[0]).toEqual({
      street: 'flop',
      cat: 'AIR',
      tex: 'DRY',
      facing: 'none',
      n: 1,
      ip: 1,
      ch: 'b66',
      co: 'check',
      t: 1_700_000_000_000,
    })
  })

  it('журнал обрізається до межі, лишаючи найсвіжіші записи', () => {
    const p = emptyPostProgress()
    const inputs = Array.from({ length: POST_LOG_LIMIT + 40 }, (_, i) =>
      answer({ chosen: 'b66', at: i }),
    )
    run(p, inputs)
    expect(p.log).toHaveLength(POST_LOG_LIMIT)
    expect(p.log.at(-1)?.t).toBe(POST_LOG_LIMIT + 39)
  })

  it('ключ режиму збігається з форматом референсу', () => {
    expect(postModeKey(1, true)).toBe('HU·IP')
    expect(postModeKey(1, false)).toBe('HU·OOP')
    expect(postModeKey(3, true)).toBe('MULTI·IP')
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- postProgress.test`
Expected: FAIL, `Failed to resolve import "./postProgress"`.

- [ ] **Step 3: Реалізувати**

```ts
/**
 * Локальні агрегати постфлопу.
 *
 * База — джерело істини (кожне рішення їде рядком у postflop_attempts), але
 * тренування не має залежати від мережі й логіну. Ці лічильники — офлайн-буфер
 * тієї самої форми, яку потім віддає сервер: Stats і Review працюють одним
 * кодом для обох джерел.
 */

import type { Tally } from '../progress'
import type { Facing, PostAction, PostCategory, Street, Texture } from './types'

export const POST_LOG_LIMIT = 500

export interface PostMistakeEntry {
  readonly street: Street
  readonly cat: PostCategory
  readonly tex: Texture
  readonly facing: Facing
  /** Скільки опонентів було в роздачі на момент рішення. */
  readonly n: number
  readonly ip: 0 | 1
  readonly ch: PostAction
  readonly co: PostAction
  readonly t: number
}

export interface PostProgress {
  total: number
  correct: number
  best: number
  byStreet: Record<string, Tally>
  byCat: Record<string, Tally>
  byTex: Record<string, Tally>
  byMode: Record<string, Tally>
  byFacing: Record<string, Tally>
  log: PostMistakeEntry[]
}

export const emptyPostProgress = (): PostProgress => ({
  total: 0,
  correct: 0,
  best: 0,
  byStreet: {},
  byCat: {},
  byTex: {},
  byMode: {},
  byFacing: {},
  log: [],
})

/** Формат ключа успадкований від референсу: роздільник — U+00B7. */
export const postModeKey = (nOpps: number, ip: boolean): string =>
  `${nOpps >= 2 ? 'MULTI' : 'HU'}·${ip ? 'IP' : 'OOP'}`

const bump = (table: Record<string, Tally>, key: string, ok: boolean): void => {
  const d = table[key] ?? { t: 0, c: 0 }
  d.t++
  if (ok) d.c++
  table[key] = d
}

export interface PostAnswerInput {
  readonly street: Street
  readonly cat: PostCategory
  readonly texture: Texture
  readonly facing: Facing
  readonly nOpps: number
  readonly ip: boolean
  readonly chosen: PostAction
  readonly correct: PostAction
  /** Час відповіді (ms). Інжектується, щоб тести були детермінованими. */
  readonly at?: number
}

export interface PostAnswerRecord {
  readonly progress: PostProgress
  readonly ok: boolean
  readonly streak: number
}

/** Мутує переданий обʼєкт — так само, як recordAnswer префлопу: стор клонує стан. */
export function recordPostAnswer(
  progress: PostProgress,
  streakBefore: number,
  input: PostAnswerInput,
): PostAnswerRecord {
  const ok = input.chosen === input.correct

  progress.total++
  if (ok) progress.correct++

  bump(progress.byStreet, input.street, ok)
  bump(progress.byCat, input.cat, ok)
  bump(progress.byTex, input.texture, ok)
  bump(progress.byMode, postModeKey(input.nOpps, input.ip), ok)
  bump(progress.byFacing, input.facing, ok)

  if (!ok) {
    progress.log.push({
      street: input.street,
      cat: input.cat,
      tex: input.texture,
      facing: input.facing,
      n: input.nOpps,
      ip: input.ip ? 1 : 0,
      ch: input.chosen,
      co: input.correct,
      t: input.at ?? Date.now(),
    })
    if (progress.log.length > POST_LOG_LIMIT) {
      progress.log.splice(0, progress.log.length - POST_LOG_LIMIT)
    }
  }

  const streak = ok ? streakBefore + 1 : 0
  progress.best = Math.max(progress.best, streak)

  return { progress, ok, streak }
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npm test -- postProgress.test`
Expected: PASS, 6 тестів.

- [ ] **Step 5: Коміт**

```bash
git add web/src/engine/postflop/postProgress.ts web/src/engine/postflop/postProgress.test.ts && git commit -m "post-1: локальні агрегати постфлопу"
```

---

### Task 13: Публічний API підмодуля і закриття фази

**Files:**
- Create: `web/src/engine/postflop/index.ts`
- Modify: `web/src/engine/index.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Написати барель підмодуля**

`web/src/engine/postflop/index.ts`:

```ts
/**
 * Публічний API постфлопу (Етап 2).
 *
 * Ті самі правила, що й у решті engine/: жодного React, zustand, DOM чи
 * supabase; уся випадковість — через інжектований Rng.
 *
 * Джерела істини: флоп-ядро — poker-trainer.html (звірене фікстурами),
 * решта — docs/superpowers/specs/2026-08-11-postflop-stage-design.md.
 */

export * from './build'
export * from './deck'
export * from './episode'
export * from './evaluate'
export * from './matrixBet'
export * from './matrixDefend'
export * from './postProgress'
export * from './showdown'
export * from './step'
export * from './types'
export * from './villain'
```

- [ ] **Step 2: Підключити до бареля engine**

У `web/src/engine/index.ts` додати рядок у алфавітному порядку — між `'./gate'` і `'./progress'`:

```ts
export * from './postflop'
```

- [ ] **Step 3: Перевірити відсутність зіткнень імен**

`export *` мовчки ламається на дублікаті імені, тож перевіряємо компілятором і явно:

Run: `npm run typecheck`
Expected: без помилок.

```bash
node -e "
const fs=require('fs');
const names=new Map();
for (const f of fs.readdirSync('src/engine').filter(n=>n.endsWith('.ts')&&!n.includes('.test'))) {
  for (const m of fs.readFileSync('src/engine/'+f,'utf8').matchAll(/^export (?:const|function|type|interface|class) (\w+)/gm)) {
    if (names.has(m[1])) console.log('ДУБЛІКАТ:', m[1], names.get(m[1]), f);
    names.set(m[1], f);
  }
}
for (const f of fs.readdirSync('src/engine/postflop').filter(n=>n.endsWith('.ts')&&!n.includes('.test'))) {
  for (const m of fs.readFileSync('src/engine/postflop/'+f,'utf8').matchAll(/^export (?:const|function|type|interface|class) (\w+)/gm)) {
    if (names.has(m[1])) console.log('ДУБЛІКАТ:', m[1], names.get(m[1]), 'postflop/'+f);
    names.set(m[1], f);
  }
}
console.log('перевірено', names.size, 'імен');
"
```
Expected: жодного рядка «ДУБЛІКАТ».

- [ ] **Step 4: Прогнати весь набір**

Run: `npm test`
Expected: усі тести зелені. Базова лінія до фази — 10 файлів / 175 тестів; після — 17 файлів і приблизно 250 тестів.

Run: `npm run lint`
Expected: без зауважень.

Run: `npm run build`
Expected: збірка проходить (постфлоп поки ніде не рендериться, але має компілюватись).

- [ ] **Step 5: Оновити CLAUDE.md**

У розділі «Що це», після абзацу про `poker-trainer.html`, додати:

```markdown
Етап 2 (постфлоп) живе в `web/src/engine/postflop/`. Джерела істини тут два:
флоп-ядро лінії агресора (`evaluate`, `texture`, матриця «можу ставити»)
перенесене з `poker-trainer.html` 1:1 і звіряється з ним фікстурою
`__fixtures__/ref-postflop.json`; терн, рівер, захист і профіль опонента
референсу не мають — їх задає
`docs/superpowers/specs/2026-08-11-postflop-stage-design.md`. Міняти числа
профілю чи клітинки матриць можна лише разом зі спекою.
```

- [ ] **Step 6: Коміт**

```bash
git add web/src/engine/postflop/index.ts web/src/engine/index.ts CLAUDE.md && git commit -m "post-1: публічний API постфлопу"
```

---

## Що лишається за межами цієї фази

| Фаза | Зміст | Окремий план |
|---|---|---|
| post-2 | UI: перемикач етапів, екран роздачі, вердикти, стор, запис подій у чергу синку | `2026-08-12-postflop-ui-server.md` |
| post-3 | Сервер: міграція `postflop_attempts`, RLS-тести, узагальнення SyncQueue, SQL-зрізи, serverProgress | той самий план |
| post-4 | Лінія колера: матриця §5.4, семплінг vsraise-епізодів, контексти facing у UI | окремий план після post-3 |
| post-5 | Вкладка «Схема рішень», постфлоп-патерни в Розборі, перегляд роздачі за `episode_id` | окремий план після post-3 |

Ідея порядку: post-1 і post-2 дають робочий тренажер, post-3 переводить прогрес у базу (де він і має жити), і лише після цього має сенс розширювати набір лінй та розбір.

