# post-4 · Лінія колера — план реалізації

> **Для агентів:** виконувати через `superpowers:executing-plans` або
> `superpowers:subagent-driven-development`, крок за кроком; кроки — чекбокси.

**Мета:** герой може грати постфлоп не лише як префлоп-агресор, а й як колер
опену: семплінг vsraise-епізодів, матриця §5.4 (захист проти c-bet), правило
§5.1а (колер, що діє першим), c-bet-профіль агресора і третій сценарій в UI.

**Архітектура:** нових модулів немає — розширюються наявні. `build.ts` отримує
другу функцію роздачі (`dealCaller`), `matrixBet`/`matrixDefend` — по одному
новому виміру контексту (`line` і `vsCbet`), `villain.ts` — окремий рядок
частот `cbet`, `step.ts` лише зшиває це разом. Схема бази не змінюється:
`line='caller'`, `scenario='vsraise'` вже дозволені міграцією post-3.

**Стек:** TypeScript strict, vitest, React 19 (UI), zustand (стор).

**Затверджені продуктові рішення цієї фази** (обидва — 2026-08-17):

1. **C-bet агресора — окремий рядок §6.** Без нього агресор ставив би флоп за
   загальною bet-таблицею (AIR .05) і §5.4 тренувалась би майже ніколи. Числа:
   STRONG .85, DRAW .70, MEDIUM .70, WEAK .60, WEAKDRAW .60, AIR .55 (~65%
   флопів). Терн і рівер лишаються на bet-таблиці — «one and done».
   Донк-частоти явно позначаються як «лише для опонента, який агресором не був».
2. **Зріз статистики по лінії — відкладено в post-5** (там і так чіпається
   Stats/Review). У post-4 міграцій немає.

---

## Файли

| Файл | Що робить у цій фазі |
|---|---|
| `web/src/engine/postflop/types.ts` | новий тип `PostScenario` (спільний для build/episode/стору) |
| `web/src/engine/postflop/villain.ts` | рядок `cbet` у профілі + `villainCbet()` |
| `web/src/engine/postflop/matrixDefend.ts` | вимір `vsCbet` + матриця §5.4 |
| `web/src/engine/postflop/matrixBet.ts` | вимір `line` + правило §5.1а |
| `web/src/engine/postflop/build.ts` | `dealCaller()` — роздача vsraise |
| `web/src/engine/postflop/step.ts` | вибір джерела частот опонента, `line`/`vsCbet` у контексті рішення |
| `web/src/store/postSessionStore.ts` | сценарій `vsraise` |
| `web/src/pages/TrainPost.tsx` | третій чіп сценарію |
| `web/src/components/PostVerdict.tsx` | тег лінії у вердикті |
| `docs/…/2026-08-11-postflop-stage-design.md` | §6: рядок `cbet` + межі донку |

Тести — поруч із кожним файлом (`*.test.ts`), як у решті модуля.

---

### Task 1: спільний тип сценарію

Зараз `'rfi' | 'iso'` продубльований у `BuildOptions`, `EpisodeState` і сторі, і
кожне місце довелось би розширювати окремо.

**Файли:**
- Modify: `web/src/engine/postflop/types.ts`
- Modify: `web/src/engine/postflop/episode.ts:47`
- Modify: `web/src/engine/postflop/build.ts:35`

- [ ] **Крок 1: додати тип у `types.ts`** (після `PostLine`)

```ts
/** Префлоп-сценарій, з якого виріс епізод. Той самий набір, що в схемі бази. */
export type PostScenario = 'rfi' | 'iso' | 'vsraise'
```

- [ ] **Крок 2: використати його в `episode.ts`**

Імпорт: `import type { PostLine, PostScenario, Street, Texture } from './types'`

```ts
  readonly line: PostLine
  readonly scenario: PostScenario
```

- [ ] **Крок 3: використати його в `build.ts`**

`BuildOptions.scenario` — `readonly scenario?: PostScenario` (імпорт із `./types`).

- [ ] **Крок 4: перевірити типи**

Run: `cd web && npm run typecheck`
Expected: без помилок (поведінка не змінилась).

- [ ] **Крок 5: коміт**

```bash
git add web/src/engine/postflop/types.ts web/src/engine/postflop/episode.ts web/src/engine/postflop/build.ts
git commit -m "post-4: спільний тип PostScenario"
```

---

### Task 2: c-bet-частоти агресора

**Файли:**
- Modify: `web/src/engine/postflop/villain.ts`
- Test: `web/src/engine/postflop/villain.test.ts`

- [ ] **Крок 1: тест, що падає**

Додати в `villain.test.ts` (імпорт `villainCbet` до наявного списку):

```ts
describe('villainCbet', () => {
  it('частоти c-bet збігаються зі спекою §6 ±0.03', () => {
    const cases: [PostCategory, number][] = [
      ['STRONG_MADE', 0.85],
      ['DRAW', 0.7],
      ['MEDIUM', 0.7],
      ['WEAK', 0.6],
      ['WEAKDRAW', 0.6],
      ['AIR', 0.55],
    ]
    for (const [cat, want] of cases) {
      const got = share(6000, (r) => villainCbet(cat, r), 'bet')
      expect(Math.abs(got - want), `${cat}: ${got} vs ${want}`).toBeLessThan(0.03)
    }
  })

  it('c-bet значно ширший за звичайну ставку — на цьому стоїть §5.4', () => {
    for (const cat of ['AIR', 'WEAK', 'MEDIUM'] as PostCategory[]) {
      const cbet = share(6000, (r) => villainCbet(cat, r), 'bet')
      const open = share(6000, (r) => villainOpen(cat, 'flop', r), 'bet')
      expect(cbet, `${cat}`).toBeGreaterThan(open + 0.3)
    }
  })

  it('обидва підтипи STRONG c-betять однаково', () => {
    const made = share(4000, (r) => villainCbet('STRONG_MADE', r), 'bet')
    const pair = share(4000, (r) => villainCbet('STRONG_PAIR', r), 'bet')
    expect(Math.abs(made - pair)).toBeLessThan(0.03)
  })
})
```

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/engine/postflop/villain.test.ts`
Expected: FAIL — `villainCbet` не експортується.

- [ ] **Крок 3: реалізація**

У `villain.ts` після `BET_RIVER`:

```ts
/**
 * C-bet префлоп-агресора на флопі. Окремий рядок, а не bet-таблиця: агресор
 * мікрополя ставить флоп майже автоматично, і саме на цьому стоїть §5.4 —
 * єдиний контекст, де у ставці опонента є повітря. Терн і рівер лишаються на
 * bet: друга куля пасивного гравця вже означає силу («one and done»).
 */
const CBET_FLOP: CatFreq = { STRONG: 0.85, MEDIUM: 0.7, WEAK: 0.6, DRAW: 0.7, WEAKDRAW: 0.6, AIR: 0.55 }
```

У `VillainProfile` — після `bet`:

```ts
  /** C-bet агресора на флопі (лінія колера). */
  readonly cbet: Readonly<Record<PostCategory, number>>
```

У `VILLAIN` — після `bet: {...}`: `cbet: expand(CBET_FLOP),`
і уточнити коментар донку:

```ts
  /** Донк-бет OOP до дії героя. Лише для опонента, який агресором НЕ був. */
  donk: { STRONG: 0.3, MEDIUM: 0, WEAK: 0, DRAW: 0.2, WEAKDRAW: 0, AIR: 0 },
```

Функція — поряд із `villainOpen`:

```ts
/** C-bet агресора: флоп, лінія колера. Пізніші вулиці — звичайна bet-таблиця. */
export function villainCbet(cat: PostCategory, rng: Rng): 'check' | 'bet' {
  return rng() < VILLAIN.cbet[cat] ? 'bet' : 'check'
}
```

- [ ] **Крок 4: тести зелені**

Run: `cd web && npx vitest run src/engine/postflop/villain.test.ts`
Expected: PASS.

- [ ] **Крок 5: коміт**

```bash
git add web/src/engine/postflop/villain.ts web/src/engine/postflop/villain.test.ts
git commit -m "post-4: c-bet-частоти агресора в профілі опонента"
```

---

### Task 3: матриця §5.4 — захист проти c-bet

Відмінність від §5.5 рівно у двох рядках: STRONG_MADE рейзить і велику ставку,
STRONG_PAIR рейзить малу. Решта клітинок збігається — тексти пояснень усе одно
свої, бо причина інша (широкий c-bet, а не сила пасивного гравця).

**Файли:**
- Modify: `web/src/engine/postflop/matrixDefend.ts`
- Test: `web/src/engine/postflop/matrixDefend.test.ts`

- [ ] **Крок 1: тест, що падає**

У `matrixDefend.test.ts` додати `vsCbet: false` у дефолти хелпера `ctx` і
`vsCbet: false` у два літерали контексту в блоці «інваріанти» (рядки з
`decideDefend({ street, facing, cat, nOpps, repeatAggro })` і далі). Потім новий
блок:

```ts
describe('проти c-bet агресора · флоп · §5.4', () => {
  const cbet = (over: Partial<Parameters<typeof decideDefend>[0]> = {}) =>
    decideDefend(ctx({ vsCbet: true, ...over }))

  it('дві пари й краще рейзять будь-який сайз — банк будуємо одразу', () => {
    expect(cbet({ cat: 'STRONG_MADE', facing: 'small_bet' }).action).toBe('raise')
    expect(cbet({ cat: 'STRONG_MADE', facing: 'big_bet' }).action).toBe('raise')
  })

  it('одна пара рейзить малу ставку, але проти великої лише колле', () => {
    expect(cbet({ cat: 'STRONG_PAIR', facing: 'small_bet' }).action).toBe('raise')
    expect(cbet({ cat: 'STRONG_PAIR', facing: 'big_bet' }).action).toBe('call')
  })

  it('дро колле обидва сайзи — ціна плюс імплайди', () => {
    expect(cbet({ cat: 'DRAW', facing: 'small_bet' }).action).toBe('call')
    expect(cbet({ cat: 'DRAW', facing: 'big_bet' }).action).toBe('call')
  })

  it('середня рука витримує дешевий c-bet, велику ставку — ні', () => {
    expect(cbet({ cat: 'MEDIUM', facing: 'small_bet' }).action).toBe('call')
    expect(cbet({ cat: 'MEDIUM', facing: 'big_bet' }).action).toBe('fold')
  })

  it('слабка пара, слабке дро й повітря фолдять навіть проти широкого c-bet', () => {
    for (const cat of ['WEAK', 'WEAKDRAW', 'AIR'] as PostCategory[]) {
      for (const facing of ['small_bet', 'big_bet'] as const) {
        expect(cbet({ cat, facing }).action, `${cat} vs ${facing}`).toBe('fold')
      }
    }
  })

  // Саме тут §5.4 відрізняється від §5.5 — тест стереже, що прапорець реально
  // перемикає матрицю, а не просто передається далі.
  it('без прапорця ті самі споти грають за §5.5', () => {
    expect(decideDefend(ctx({ cat: 'STRONG_MADE', facing: 'big_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', facing: 'small_bet' })).action).toBe('call')
  })

  it('рейз опонента лишається §5.6 навіть у лінії колера', () => {
    expect(cbet({ cat: 'STRONG_PAIR', facing: 'raise', street: 'turn' }).action).toBe('fold')
  })

  it('кожна категорія має рішення з непорожнім поясненням', () => {
    for (const cat of POST_CATEGORIES) {
      for (const facing of ['small_bet', 'big_bet'] as const) {
        const d = cbet({ cat, facing })
        expect(['fold', 'call', 'raise'], `${cat}/${facing}`).toContain(d.action)
        expect(d.why.length, `${cat}/${facing}`).toBeGreaterThan(20)
      }
    }
  })
})
```

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/engine/postflop/matrixDefend.test.ts`
Expected: FAIL — `vsCbet` немає в типі контексту.

- [ ] **Крок 3: реалізація**

У `DefendContext`:

```ts
  /**
   * Ставка префлоп-агресора на флопі (лінія колера) — контекст §5.4. Єдина
   * ставка опонента, у діапазоні якої є повітря: агресор мікрополя c-betить
   * широко. Прапорець ставить step.ts, матриця його лише читає.
   */
  readonly vsCbet: boolean
```

Тексти — після наявних констант:

```ts
const RAISE_CBET_TWO_PAIR: Decision = {
  action: 'raise',
  why: 'Агресор c-betить флоп майже автоматично, тож його ставка — ще не сила. Дві пари рейзять одразу і байдуже, скільки він поставив: банк треба будувати, поки поле платить.',
}

const RAISE_CBET_ONE_PAIR: Decision = {
  action: 'raise',
  why: 'Дешевий c-bet у широкому діапазоні платять гірші пари й повітря. Рейз топ-парою збирає з них валью зараз, а не сподівається на три вулиці коллів.',
}

const CALL_CBET_ONE_PAIR: Decision = {
  action: 'call',
  why: 'Велика ставка звужує його діапазон до валью. Одна пара тут колле, але банк не роздуває — саме на роздутому банку з однією парою мікроліміти віддають стеки.',
}

const FOLD_CBET_MEDIUM: Decision = {
  action: 'fold',
  why: 'Велика ставка навіть від широкого c-bet — це вже валью-діапазон. Середня рука проти нього не окупається.',
}

const FOLD_CBET_WEAK: Decision = {
  action: 'fold',
  why: 'Третя пара проти c-bet платить усю руку і виграє надто рідко. Дисциплінований фолд тут дешевший за «ну подивимось терн».',
}

const FOLD_CBET_AIR: Decision = {
  action: 'fold',
  why: 'C-bet справді широкий, але ловити його рукою без пари й без ціни на дро — найдорожча звичка мікролімітів. Широкий діапазон опонента сам по собі еквіті не дає.',
}

/** §5.4 — c-bet агресора на флопі. Ціна: мала ≤40% банку, велика — далі. */
function defendCbet(c: DefendContext): Decision {
  const big = c.facing === 'big_bet'
  if (c.cat === 'STRONG_MADE') return RAISE_CBET_TWO_PAIR
  if (c.cat === 'STRONG_PAIR') return big ? CALL_CBET_ONE_PAIR : RAISE_CBET_ONE_PAIR
  if (c.cat === 'DRAW') return CALL_DRAW
  if (c.cat === 'MEDIUM') return big ? FOLD_CBET_MEDIUM : CALL_MEDIUM
  if (c.cat === 'WEAK') return FOLD_CBET_WEAK
  return FOLD_CBET_AIR
}
```

У `baseDecision` — перед перевіркою рівера:

```ts
function baseDecision(c: DefendContext): Decision {
  if (c.facing === 'raise') return defendRaise(c)
  // §5.4 перед §5.5: рейз лишається §5.6 (сила пасивного гравця), а от перша
  // ставка агресора на флопі — окремий, ширший контекст.
  if (c.vsCbet) return defendCbet(c)
  if (c.street === 'river') return defendRiverBet(c)
  return defendBet(c)
}
```

Оновити шапку файлу: замінити рядок «§5.4 … — окремий контекст фази post-4» на
«§5.4 (лінія колера проти c-bet) — прапорець `vsCbet` у контексті.»

- [ ] **Крок 4: тести зелені**

Run: `cd web && npx vitest run src/engine/postflop/matrixDefend.test.ts`
Expected: PASS.

- [ ] **Крок 5: коміт**

```bash
git add web/src/engine/postflop/matrixDefend.ts web/src/engine/postflop/matrixDefend.test.ts
git commit -m "post-4: матриця захисту проти c-bet агресора"
```

---

### Task 4: §5.1а — колер, що діє першим

**Файли:**
- Modify: `web/src/engine/postflop/matrixBet.ts`
- Test: `web/src/engine/postflop/matrixBet.test.ts`

- [ ] **Крок 1: тест, що падає**

У `matrixBet.test.ts` додати `line: 'aggressor'` у дефолти хелпера `ctx`, потім:

```ts
describe('лінія колера · §5.1а', () => {
  const caller = (over: Partial<Parameters<typeof decideBet>[0]> = {}) =>
    decideBet(ctx({ line: 'caller', ...over }))

  it('поза позицією на флопі колер чекає з будь-якою рукою — донків немає', () => {
    for (const cat of POST_CATEGORIES) {
      for (const texture of ['DRY', 'WET', 'PAIRED'] as Texture[]) {
        const d = caller({ cat, texture, ip: false })
        expect(d.action, `${cat}/${texture}`).toBe('check')
        expect(d.why.length).toBeGreaterThan(20)
      }
    }
  })

  it('у позиції після чеку агресора діє звичайна флоп-матриця', () => {
    expect(caller({ cat: 'STRONG_MADE', texture: 'WET', ip: true }).action).toBe('b66')
    expect(caller({ cat: 'MEDIUM', texture: 'DRY', ip: true }).action).toBe('b33')
    expect(caller({ cat: 'AIR', texture: 'DRY', ip: true }).action).toBe('b33')
    expect(caller({ cat: 'AIR', texture: 'WET', ip: true }).action).toBe('check')
  })

  it('на терні й рівері лінія нічого не змінює — матриці спільні', () => {
    for (const ip of [true, false]) {
      expect(caller({ street: 'turn', cat: 'STRONG_MADE', ip }).action).toBe('b66')
      expect(caller({ street: 'river', cat: 'STRONG_PAIR', ip }).action).toBe('b66')
      expect(caller({ street: 'river', cat: 'AIR', ip }).action).toBe('check')
    }
  })
})
```

Імпорт у тесті доповнити: `import { POST_CATEGORIES, type BoardEvents, type PostCategory, type Texture } from './types'`.

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/engine/postflop/matrixBet.test.ts`
Expected: FAIL — `line` немає в типі контексту.

- [ ] **Крок 3: реалізація**

Імпорт у `matrixBet.ts`: додати `PostLine` до типів із `./types`.

У `BetContext`:

```ts
  /** Роль героя: у колера на флопі OOP донк-бетів немає (§5.1а). */
  readonly line: PostLine
```

Константа — поряд із мультивей-текстами:

```ts
const CALLER_FLOP_CHECK: Decision = {
  action: 'check',
  why: 'Донк-бетів у моделі немає: поза позицією проти префлоп-агресора чекаємо. Він c-betить широко — далі граємо за матрицею захисту; а якщо чекне слідом, терн уже наш.',
}
```

У `decideBet` — першою перевіркою:

```ts
export function decideBet(c: BetContext): Decision {
  // §5.1а: колер OOP на флопі діє першим — і завжди чекає. Правило сильніше за
  // решту матриці, тому стоїть перед мультивеєм (лінія колера завжди хедз-ап).
  if (c.line === 'caller' && c.street === 'flop' && !c.ip) return CALLER_FLOP_CHECK
  if (c.nOpps >= 2) return decideMulti(c)
  ...
```

- [ ] **Крок 4: тести зелені**

Run: `cd web && npx vitest run src/engine/postflop/matrixBet.test.ts`
Expected: PASS, включно з фікстурою референсу (вона ходить із `line: 'aggressor'`).

- [ ] **Крок 5: коміт**

```bash
git add web/src/engine/postflop/matrixBet.ts web/src/engine/postflop/matrixBet.test.ts
git commit -m "post-4: колер OOP на флопі не донкає"
```

---

### Task 5: роздача vsraise-епізодів

**Файли:**
- Modify: `web/src/engine/postflop/build.ts`
- Test: `web/src/engine/postflop/build.test.ts`

- [ ] **Крок 1: тест, що падає**

```ts
describe('buildEpisode · vsraise (лінія колера)', () => {
  const callerSample = (n: number, seed = 1) =>
    Array.from({ length: n }, (_, i) =>
      buildEpisode({ scenario: 'vsraise', rng: mulberry32(seed + i) }),
    )

  it('епізод підписаний лінією колера', () => {
    for (const ep of callerSample(50)) {
      expect(ep.line).toBe('caller')
      expect(ep.scenario).toBe('vsraise')
    }
  })

  it('завжди хедз-ап: опенер один', () => {
    for (const ep of callerSample(200, 300)) {
      expect(ep.seats.filter((s) => !s.hero)).toHaveLength(1)
    }
  })

  it('рука опенера з його RFI, рука героя — з чарта захисту проти цього бакета', () => {
    for (const ep of callerSample(300, 700)) {
      const opener = ep.seats.find((s) => !s.hero)
      const hero = ep.seats[ep.heroIdx]
      expect(opener).toBeDefined()
      expect(hero).toBeDefined()
      expect(RFI[opener!.pos]?.has(handOf(opener!.hole)), `опенер ${opener!.pos}`).toBe(true)
      const range = VS_RAISE[BUCKET(opener!.pos)].call[HERO_CTX(ep.heroPos)]
      expect(range.has(handOf(hero!.hole)), `${ep.heroPos} проти ${opener!.pos}`).toBe(true)
    }
  })

  it('опенер завжди діє до героя за префлоп-порядком', () => {
    for (const ep of callerSample(300, 1100)) {
      const opener = ep.seats.find((s) => !s.hero)
      expect(ACTION_ORDER.indexOf(opener!.pos), `${opener!.pos} до ${ep.heroPos}`).toBeLessThan(
        ACTION_ORDER.indexOf(ep.heroPos),
      )
    }
  })

  it('ip рахується за постфлоп-порядком', () => {
    for (const ep of callerSample(200, 1500)) {
      const opener = ep.seats.find((s) => !s.hero)
      const want =
        POSTFLOP_ORDER.indexOf(ep.heroPos as (typeof POSTFLOP_ORDER)[number]) >
        POSTFLOP_ORDER.indexOf(opener!.pos as (typeof POSTFLOP_ORDER)[number])
      expect(ep.ip, `${ep.heroPos} проти ${opener!.pos}`).toBe(want)
    }
  })

  it('карти ніде не повторюються', () => {
    for (const ep of callerSample(200, 1900)) {
      const all = [...ep.board, ...ep.seats.flatMap((s) => [...s.hole])].map(cardCode)
      expect(new Set(all).size, `дублікат у ${all.join(' ')}`).toBe(all.length)
    }
  })

  it('той самий seed дає той самий епізод', () => {
    const a = buildEpisode({ scenario: 'vsraise', rng: mulberry32(77) })
    const b = buildEpisode({ scenario: 'vsraise', rng: mulberry32(77) })
    expect(a.heroPos).toBe(b.heroPos)
    expect(a.board.map(cardCode)).toEqual(b.board.map(cardCode))
  })

  // Числа пораховані вручну: 3bb опен + 3bb колл + блайнди, які не поклали 3bb.
  it('банк: CO відкрив, BTN заколлював → 7.5bb (обидва блайнди мертві)', () => {
    expectPot('CO', 'BTN', 7.5)
  })

  it('банк: CO відкрив, BB заколлював → 6.5bb (блайнд BB уже в його 3bb)', () => {
    expectPot('CO', 'BB', 6.5)
  })

  it('банк: CO відкрив, SB заколлював → 7bb (мертвий лише блайнд BB)', () => {
    expectPot('CO', 'SB', 7)
  })

  it('стеки зменшені на префлоп-внесок', () => {
    for (const ep of callerSample(100, 2500)) {
      for (const seat of ep.seats) expect(seat.stack).toBe(BUILD.startStack - BUILD.openBB)
    }
  })

  it('стрічка історії описує префлоп колера', () => {
    const ep = buildEpisode({ scenario: 'vsraise', rng: mulberry32(31) })
    expect(ep.history[0]).toMatch(/відкрив/)
    expect(ep.history[0]).toMatch(/заколлював/)
  })

  it('частка епізодів із сильним опонентом близька до цільової', () => {
    const eps = callerSample(1200, 4000)
    const strong = eps.filter((ep) =>
      ep.seats.some((s) => !s.hero && isStrong(evalHand(s.hole, ep.board).cat)),
    ).length
    const share = strong / eps.length
    expect(share, `частка ${share}`).toBeGreaterThan(0.24)
    expect(share, `частка ${share}`).toBeLessThan(0.37)
  })
})
```

Хелпер `expectPot` — над цим блоком:

```ts
/** Шукає конкретний спот лінії колера серед сідів і перевіряє банк. */
function expectPot(opener: string, hero: string, want: number): void {
  for (let s = 1; s <= 8000; s++) {
    const ep = buildEpisode({ scenario: 'vsraise', rng: mulberry32(s) })
    if (ep.heroPos !== hero) continue
    if (ep.seats.find((x) => !x.hero)?.pos !== opener) continue
    expect(ep.potBB).toBe(want)
    return
  }
  throw new Error(`не знайшлось споту ${opener} проти ${hero}`)
}
```

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/engine/postflop/build.test.ts`
Expected: FAIL — `line` епізоду `'aggressor'`, бо `vsraise` не роздається.

- [ ] **Крок 3: реалізація**

У `build.ts` перейменувати наявну `dealOnce` на `dealAggressor` (сигнатура
`(scenario: 'rfi' | 'iso', rng: Rng, id: string)`), додати роздачу колера і
диспетчер:

```ts
/**
 * Лінія колера (§3.1): опенер відкриває 3bb, герой заколлював — хедз-ап.
 * Позиції героя — ті, що діють після опенера і мають непорожній call-діапазон
 * проти його бакета: рука героя береться саме з того чарта, який тренує
 * префлопний vsraise.
 */
function dealCaller(rng: Rng, id: string): EpisodeState | null {
  const openerPos = HERO_POSITIONS[Math.floor(rng() * HERO_POSITIONS.length)]
  if (openerPos === undefined) return null
  const bucket = BUCKET(openerPos)

  const pool = ACTION_ORDER.slice(ACTION_ORDER.indexOf(openerPos) + 1).filter(
    (p) => VS_RAISE[bucket].call[HERO_CTX(p)].size > 0,
  )
  const heroPos = pool[Math.floor(rng() * pool.length)]
  if (heroPos === undefined) return null

  const deck = makeDeck()

  const openerHand = pickWeighted(RFI[openerPos] ?? new Set<Hand>(), rng)
  if (openerHand === null) return null
  const openerHole = drawHand(deck, openerHand, rng)
  if (openerHole === null) return null

  const heroHand = pickWeighted(VS_RAISE[bucket].call[HERO_CTX(heroPos)], rng)
  if (heroHand === null) return null
  const heroHole = drawHand(deck, heroHand, rng)
  if (heroHole === null) return null

  const board = drawCards(deck, 3, rng)
  if (board.length < 3) return null

  const stack = BUILD.startStack - BUILD.openBB
  const inHand: Position[] = [openerPos, heroPos]
  const seats: EpisodeSeat[] = POSTFLOP_ORDER.filter((p) => inHand.includes(p)).map((pos) => ({
    pos,
    hole: pos === heroPos ? heroHole : openerHole,
    hero: pos === heroPos,
    stack,
    put: 0,
    folded: false,
  }))

  // Мертві блайнди — ті, що не поклали 3bb самі. Формула агресора вище — порт
  // із референсу разом із його спрощенням; для лінії колера референсу немає,
  // тож рахуємо точно (інакше банк SB-колера з'їхав би на пів-блайнда).
  const dead = (inHand.includes('SB') ? 0 : 0.5) + (inHand.includes('BB') ? 0 : 1)

  return {
    id,
    line: 'caller',
    scenario: 'vsraise',
    heroPos,
    seats,
    heroIdx: seats.findIndex((s) => s.hero),
    texture: texture(board).t,
    ip: POSTFLOP_ORDER.indexOf(heroPos) > POSTFLOP_ORDER.indexOf(openerPos),
    deck,
    board,
    street: 'flop',
    potBB: Math.round((BUILD.openBB * 2 + dead) * 2) / 2,
    bet: 0,
    raised: false,
    lastBetFraction: 0,
    acted: new Set<number>(),
    villainAggro: 0,
    delayed: false,
    streetHadBet: false,
    history: [`${openerPos} відкрив ${BUILD.openBB}bb, ти заколлював з ${heroPos}.`],
    finished: null,
  }
}

const dealOnce = (scenario: PostScenario, rng: Rng, id: string): EpisodeState | null =>
  scenario === 'vsraise' ? dealCaller(rng, id) : dealAggressor(scenario, rng, id)
```

У `buildEpisode` тип локальної змінної: `const scenario: PostScenario = options.scenario ?? 'rfi'`.

- [ ] **Крок 4: тести зелені**

Run: `cd web && npx vitest run src/engine/postflop/build.test.ts`
Expected: PASS (наявні тести rfi/iso теж).

- [ ] **Крок 5: коміт**

```bash
git add web/src/engine/postflop/build.ts web/src/engine/postflop/build.test.ts
git commit -m "post-4: роздача vsraise-епізодів"
```

---

### Task 6: рушій зшиває лінію колера

**Файли:**
- Modify: `web/src/engine/postflop/step.ts`
- Test: `web/src/engine/postflop/step.test.ts`

- [ ] **Крок 1: тест, що падає**

```ts
describe('лінія колера', () => {
  const startCaller = (seed: number) =>
    startEpisode({ scenario: 'vsraise', rng: mulberry32(seed) })

  it('рішення несе лінію — від неї залежать §5.1а і §5.4', () => {
    for (let s = 1; s <= 50; s++) {
      const d = heroDecision(startCaller(s))
      if (d) expect(d.line).toBe('caller')
    }
  })

  it('колер OOP на флопі без ставки завжди чекає', () => {
    let seen = 0
    for (let s = 1; s <= 400 && seen < 5; s++) {
      const ep = startCaller(s)
      const d = heroDecision(ep)
      if (!d || d.ip || d.street !== 'flop' || d.facing !== 'none') continue
      expect(d.correct, `seed ${s}`).toBe('check')
      seen++
    }
    expect(seen, 'не трапилось жодного OOP-споту без ставки').toBeGreaterThan(0)
  })

  // Саме тут §5.4 розходиться з §5.5: проти першої малої ставки одна пара
  // рейзить, а не колле. Якщо прапорець vsCbet не доїхав до матриці, тест впаде.
  it('одна пара проти малого c-bet рейзить', () => {
    for (let s = 1; s <= 3000; s++) {
      const ep = startCaller(s)
      const d = heroDecision(ep)
      if (!d || d.street !== 'flop' || d.cat !== 'STRONG_PAIR' || d.facing !== 'small_bet') continue
      expect(d.correct, `seed ${s}`).toBe('raise')
      return
    }
    throw new Error('не знайшлось топ-пари проти малого c-bet')
  })

  it('агресор c-betить помітно частіше, ніж донкає пасивний опонент', () => {
    // Герой OOP діє першим, тож c-bet видно лише ПІСЛЯ його чеку: або наступне
    // рішення теж на флопі (агресор поставив), або роздача пішла на терн
    // (чекнув слідом). Донк-частоти дали б тут ~0.1 — тест стереже, що на
    // флопі лінії колера працює саме cbet-таблиця.
    let flops = 0
    let bets = 0
    for (let s = 1; s <= 800; s++) {
      const ep = startCaller(s)
      const first = heroDecision(ep)
      if (!first || first.ip || first.street !== 'flop' || first.facing !== 'none') continue
      answerPost(ep, 'check', mulberry32(s + 500))
      flops++
      const next = heroDecision(ep)
      if (next?.street === 'flop' && next.facing !== 'none') bets++
    }
    expect(flops, 'потрібні OOP-споти').toBeGreaterThan(20)
    expect(bets / flops, `частка c-bet ${bets / flops}`).toBeGreaterThan(0.35)
  })

  it('роздача колера завжди доходить до термінала', () => {
    for (let s = 1; s <= 300; s++) {
      const ep = startCaller(s)
      const rng = mulberry32(s + 10_000)
      let guard = 0
      while (!ep.finished && guard++ < 20) {
        const d = heroDecision(ep)
        if (!d) break
        answerPost(ep, d.correct, rng)
      }
      expect(ep.finished, `seed ${s}`).not.toBeNull()
    }
  })
})
```

- [ ] **Крок 2: переконатись, що падає**

Run: `cd web && npx vitest run src/engine/postflop/step.test.ts`
Expected: FAIL — `d.line` не існує.

- [ ] **Крок 3: реалізація**

Імпорт `villainCbet` із `./villain`, `PostLine` із `./types`.

У `HeroDecision` — поряд із `street`:

```ts
  /** Роль героя в роздачі: від неї залежать §5.1а і §5.4. */
  readonly line: PostLine
```

У `villainAct`, у гілці «ставки немає»:

```ts
  // Лінія колера: єдиний опонент — префлоп-агресор. На флопі його ставка — це
  // c-bet (широкий, §6), а не донк: донк-частоти описують опонента, який
  // агресором не був. На терні й рівері він барелить за bet-таблицею.
  const move =
    ep.line === 'caller'
      ? ep.street === 'flop'
        ? villainCbet(cat, rng)
        : villainOpen(cat, ep.street, rng)
      : ep.acted.has(ep.heroIdx)
        ? villainOpen(cat, ep.street, rng)
        : villainDonk(cat, ep.street, rng)
```

(рядок `const heroActed = ...` прибрати — його місце зайняв цей вираз).

У `heroDecision` — після обчислення `facing`:

```ts
  // §5.4: у лінії колера будь-яка перша ставка на флопі і є c-bet агресора —
  // інших опонентів у роздачі немає, а рейз веде в §5.6.
  const vsCbet = ep.line === 'caller' && ep.street === 'flop' && !ep.raised
```

`decideBet({ ... })` доповнити `line: ep.line`, `decideDefend({ ... })` —
`vsCbet`, і в обʼєкт результату додати `line: ep.line`.

- [ ] **Крок 4: тести зелені**

Run: `cd web && npx vitest run src/engine/postflop`
Expected: PASS — усі тести рушія.

- [ ] **Крок 5: коміт**

```bash
git add web/src/engine/postflop/step.ts web/src/engine/postflop/step.test.ts
git commit -m "post-4: рушій грає лінію колера"
```

---

### Task 7: UI — третій сценарій

**Файли:**
- Modify: `web/src/store/postSessionStore.ts`
- Modify: `web/src/pages/TrainPost.tsx:10-13`
- Modify: `web/src/components/PostVerdict.tsx`
- Test: `web/src/pages/TrainPost.test.tsx`, `web/src/store/postSessionStore.test.ts`,
  `web/src/components/PostVerdict.test.tsx`

- [ ] **Крок 1: тести, що падають**

`TrainPost.test.tsx`:

```ts
  it('третій чіп перемикає на лінію колера', () => {
    render(<TrainPost />)

    fireEvent.click(screen.getByRole('button', { name: 'Проти рейзу' }))

    expect(usePostSessionStore.getState().scenario).toBe('vsraise')
    expect(usePostSessionStore.getState().episode?.line).toBe('caller')
  })
```

`postSessionStore.test.ts` (у наявний describe):

```ts
  it('сценарій vsraise роздає лінію колера і пише її в журнал', () => {
    usePostSessionStore.getState().setScenario('vsraise')
    const episode = usePostSessionStore.getState().episode
    expect(episode?.line).toBe('caller')
    expect(episode?.scenario).toBe('vsraise')

    const decision = usePostSessionStore.getState().decision
    expect(decision).not.toBeNull()
    usePostSessionStore.getState().answer(decision!.options[0]!.k)

    const last = postQueue.peek().at(-1)
    expect(last?.line).toBe('caller')
    expect(last?.scenario).toBe('vsraise')
  })
```

`PostVerdict.test.tsx`: додати `line: 'aggressor',` у `makeDecision` і тест

```ts
  it('лінія роздачі підписана тегом', () => {
    render(<PostVerdict decision={makeDecision()} ok={true} handOver={null} onNext={noop} />)
    expect(screen.getByText('агресор')).toBeInTheDocument()

    render(
      <PostVerdict decision={makeDecision({ line: 'caller' })} ok={true} handOver={null} onNext={noop} />,
    )
    expect(screen.getByText('колер')).toBeInTheDocument()
  })
```

- [ ] **Крок 2: переконатись, що падають**

Run: `cd web && npx vitest run src/pages/TrainPost.test.tsx src/store/postSessionStore.test.ts src/components/PostVerdict.test.tsx`
Expected: FAIL — чіпа «Проти рейзу» немає, тега лінії немає.

- [ ] **Крок 3: реалізація**

`postSessionStore.ts`: імпортувати `type PostScenario` з `../engine/postflop`,
замінити всі `'rfi' | 'iso'` на `PostScenario` (поле `scenario`, `setScenario`).

`TrainPost.tsx`:

```ts
const SCENARIO_ITEMS: readonly { key: PostScenario; label: string }[] = [
  { key: 'rfi', label: 'Відкриття' },
  { key: 'iso', label: 'Ізоляція' },
  // Лінія колера: герой заколлював опен і грає постфлоп без ініціативи.
  { key: 'vsraise', label: 'Проти рейзу' },
]
```

з імпортом `import type { PostScenario } from '../engine/postflop'`.

`PostVerdict.tsx` — у блок `.tags`, першим після руки:

```tsx
        <span className="tag">{decision.line === 'caller' ? 'колер' : 'агресор'}</span>
```

- [ ] **Крок 4: тести зелені**

Run: `cd web && npx vitest run src/pages src/store src/components`
Expected: PASS.

- [ ] **Крок 5: коміт**

```bash
git add web/src/store/postSessionStore.ts web/src/store/postSessionStore.test.ts web/src/pages/TrainPost.tsx web/src/pages/TrainPost.test.tsx web/src/components/PostVerdict.tsx web/src/components/PostVerdict.test.tsx
git commit -m "post-4: лінія колера в тренуванні"
```

---

### Task 8: спека і повна перевірка

**Файли:**
- Modify: `docs/superpowers/specs/2026-08-11-postflop-stage-design.md` (§6, §11)

- [ ] **Крок 1: оновити §6**

Після таблиці «Коли до нього чекнуто» додати:

```markdown
**C-bet агресора (лінія колера, флоп).** Окремий рядок: агресор мікрополя
ставить флоп майже автоматично, і §5.4 стоїть саме на цьому. Терн і рівер
беруть таблицю вище — друга куля пасивного гравця вже означає силу.

| Категорія | C-bet флопу |
|---|---|
| STRONG (обидва підтипи) | .85 |
| DRAW | .70 |
| MEDIUM | .70 |
| WEAK | .60 |
| WEAKDRAW | .60 |
| AIR | .55 |
```

І уточнити рядок донку: «Донк-бет OOP (замість чеку, до дії героя) — **лише для
опонента, який префлоп-агресором не був**: STRONG .30, DRAW .20, інші 0.»

- [ ] **Крок 2: позначити фазу в §11**

Рядок 4 списку: «**post-4 — лінія колера:** семплінг, матриці §5.4 і §5.1а,
c-bet-профіль агресора, третій сценарій в UI. **Зроблено.**»

- [ ] **Крок 3: повна перевірка**

```bash
cd web && npm test && npm run typecheck && npm run lint && npm run build
```

Expected: усі тести зелені (нових ~40), typecheck і lint без помилок, збірка
проходить. Міграцій фаза не додає, тож `npm run test:db` запускати не потрібно —
але якщо база вже піднята, він теж має лишитись зеленим.

- [ ] **Крок 4: коміт**

```bash
git add docs/superpowers/specs/2026-08-11-postflop-stage-design.md
git commit -m "post-4: c-bet-профіль агресора у спеці"
```

---

## Що ця фаза свідомо не робить

- **Зріз статистики по лінії** — рішення 2 вище: разом із post-5.
- **3бет-поти й мультивей-захист** — поза MVP (§1 спеки).
- **Ре-рейзи героя** — cap «один рейз на вулицю» лишається (§3.3).
- **Донк-бети героя** — модель їх не має (§5.1а, §13).
