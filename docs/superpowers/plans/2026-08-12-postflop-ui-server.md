# Постфлоп · фази post-2 і post-3 — інтерфейс і сервер

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Зробити Етап 2 грабельним у браузері (post-2) і перевести його прогрес у базу, де він і має жити (post-3).

**Architecture:** Постфлоп-стор поверх рушія з `web/src/engine/postflop/`; окремий екран у перемикачі етапів; кожне рішення героя одразу лягає в чергу синку і їде в нову таблицю `postflop_attempts`. Локальні агрегати лишаються офлайн-буфером (правило 6 CLAUDE.md), сервер витісняє їх щойно догнав — та сама схема, що вже працює для префлопу через `statsSource`.

**Tech Stack:** React 19 + zustand 5, звичайний CSS 1:1 з референсу, Supabase (Postgres + RLS), vitest (юніт) і vitest із `vitest.db.config.ts` (інтеграційні проти локального стека).

**Передумова:** виконаний план `2026-08-12-postflop-engine.md` — без `engine/postflop/` тут нема чого рендерити.

**Порядок фаз навмисний.** UI йде перед сервером, але події пишуться в чергу **вже в post-2**, коли таблиці ще немає: черга стійка до помилок сервера і просто накопичується. Щойно post-3 задеплоїться, все зігране доїде без втрат.

**Команди UI-частини — з `web/`, команди бази — з кореня репозиторію.**

---

### Task 1: Постфлоп у сховищі прогресу

**Files:**
- Modify: `web/src/store/progressStore.ts`
- Test: `web/src/store/progressStore.test.ts` (створюється — зараз тестів у цього стору немає)

- [ ] **Step 1: Написати падаючий тест**

```ts
/**
 * Стор прогресу тримає два незалежні розділи: префлоп і постфлоп. Тест
 * стежить саме за незалежністю — скидання одного не має чіпати інший.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { PostAnswerInput } from '../engine/postflop/postProgress'
import { emptyPostProgress } from '../engine/postflop/postProgress'
import { emptyPreProgress } from '../engine/progress'
import { useProgressStore } from './progressStore'

beforeEach(() => {
  useProgressStore.setState({
    pre: emptyPreProgress(),
    post: emptyPostProgress(),
    postUnlocked: true,
    postSeen: true,
  })
})

const postAnswer = (over: Partial<PostAnswerInput> = {}): PostAnswerInput => ({
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

describe('answerPost', () => {
  it('записує відповідь у розділ post і повертає серію', () => {
    const r1 = useProgressStore.getState().answerPost(postAnswer(), 0)
    expect(r1.ok).toBe(true)
    expect(r1.streak).toBe(1)
    expect(useProgressStore.getState().post.total).toBe(1)
    expect(useProgressStore.getState().pre.total, 'префлоп не чіпається').toBe(0)
  })

  it('помилка обнуляє серію і потрапляє в журнал', () => {
    useProgressStore.getState().answerPost(postAnswer(), 0)
    const r = useProgressStore.getState().answerPost(postAnswer({ chosen: 'b66' }), 1)
    expect(r.ok).toBe(false)
    expect(r.streak).toBe(0)
    expect(useProgressStore.getState().post.log).toHaveLength(1)
  })
})

describe('resetPost', () => {
  it('чистить постфлоп, лишаючи префлоп і відкриті ворота', () => {
    useProgressStore.getState().answerPost(postAnswer(), 0)
    useProgressStore.setState({ pre: { ...emptyPreProgress(), total: 42 } })

    useProgressStore.getState().resetPost()

    expect(useProgressStore.getState().post.total).toBe(0)
    expect(useProgressStore.getState().pre.total, 'префлоп лишається').toBe(42)
    expect(useProgressStore.getState().postUnlocked, 'ворота не зачиняються').toBe(true)
  })
})

describe('reset', () => {
  it('повне скидання чистить обидва розділи', () => {
    useProgressStore.getState().answerPost(postAnswer(), 0)
    useProgressStore.getState().reset()
    expect(useProgressStore.getState().post.total).toBe(0)
    expect(useProgressStore.getState().pre.total).toBe(0)
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- progressStore.test`
Expected: FAIL — `post` і `answerPost` не існують.

- [ ] **Step 3: Реалізувати**

У `web/src/store/progressStore.ts`:

Імпорти:
```ts
import {
  emptyPostProgress,
  recordPostAnswer,
  type PostAnswerInput,
  type PostAnswerRecord,
  type PostProgress,
} from '../engine/postflop/postProgress'
```

Інтерфейс — додати поля й дії:
```ts
export interface ProgressState {
  pre: PreProgress
  /** Локальний буфер Етапу 2. Джерело істини — база; це те, що ще не доїхало. */
  post: PostProgress
  postUnlocked: boolean
  postSeen: boolean
  legacyImported: number | null
  legacyChecked: boolean

  answer: (input: AnswerInput, streakBefore: number) => AnswerResult
  answerPost: (input: PostAnswerInput, streakBefore: number) => PostAnswerRecord
  markPostSeen: () => void
  dismissLegacyNotice: () => void
  importLegacy: () => void
  reset: () => void
  resetPost: () => void
}
```

Початковий стан — додати `post: emptyPostProgress(),` поряд із `pre: emptyPreProgress(),`.

Дії:
```ts
  answerPost: (input, streakBefore) => {
    const post = structuredClone(get().post)
    const result = recordPostAnswer(post, streakBefore, input)
    set({ post })
    return result
  },

  /** Скидає лише Етап 2: ворота і префлоп лишаються як були. */
  resetPost: () => set({ post: emptyPostProgress() }),
```

У наявному `reset` додати `post: emptyPostProgress(),` до обʼєкта, який він передає в `set`.

Персист — стан отримав нове поле, тож версію треба підняти:
```ts
  persist(
    (set, get) => ({ /* ... */ }),
    {
      name: STORAGE_KEY,
      version: 2,
      // v1 не знав про Етап 2 — дописуємо порожній розділ, нічого не втрачаючи.
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Partial<ProgressState>
        if (version < 2) return { ...state, post: emptyPostProgress() }
        return state
      },
      onRehydrateStorage: () => (state) => {
        if (state && !state.legacyChecked) state.importLegacy()
      },
    },
  ),
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npm test -- progressStore.test`
Expected: PASS, 4 тести.

- [ ] **Step 5: Коміт**

```bash
git add web/src/store/progressStore.ts web/src/store/progressStore.test.ts && git commit -m "post-2: розділ постфлопу у сховищі прогресу"
```

---

### Task 2: Стор сесії постфлопу

**Files:**
- Create: `web/src/store/postSessionStore.ts`
- Test: `web/src/store/postSessionStore.test.ts`

- [ ] **Step 1: Написати падаючий тест**

```ts
/**
 * Стор сесії Етапу 2. Тест ганяє реальний рушій — перевіряється саме
 * зчеплення engine → store, а не мок.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { emptyPostProgress } from '../engine/postflop/postProgress'
import { useProgressStore } from './progressStore'
import { usePostSessionStore } from './postSessionStore'

beforeEach(() => {
  useProgressStore.setState({ post: emptyPostProgress() })
  usePostSessionStore.setState({
    episode: null,
    decision: null,
    feedback: null,
    streak: 0,
    scenario: 'rfi',
  })
})

describe('deal', () => {
  it('роздає епізод і виставляє рішення героя', () => {
    usePostSessionStore.getState().deal()
    const s = usePostSessionStore.getState()
    expect(s.episode).not.toBeNull()
    expect(s.decision).not.toBeNull()
    expect(s.decision?.options.length).toBeGreaterThanOrEqual(2)
    expect(s.feedback).toBeNull()
  })
})

describe('answer', () => {
  it('правильна відповідь піднімає серію і рахується в прогресі', () => {
    usePostSessionStore.getState().deal()
    const correct = usePostSessionStore.getState().decision?.correct
    expect(correct).toBeDefined()

    usePostSessionStore.getState().answer(correct!)

    const s = usePostSessionStore.getState()
    expect(s.feedback?.ok).toBe(true)
    expect(s.streak).toBe(1)
    expect(useProgressStore.getState().post.total).toBe(1)
    expect(useProgressStore.getState().post.correct).toBe(1)
  })

  it('помилка обнуляє серію і лягає в журнал', () => {
    usePostSessionStore.getState().deal()
    const d = usePostSessionStore.getState().decision
    const wrong = d?.options.map((o) => o.k).find((k) => k !== d.correct)
    usePostSessionStore.getState().answer(wrong!)

    expect(usePostSessionStore.getState().feedback?.ok).toBe(false)
    expect(usePostSessionStore.getState().streak).toBe(0)
    expect(useProgressStore.getState().post.log).toHaveLength(1)
  })

  it('повторна відповідь на те саме рішення ігнорується', () => {
    usePostSessionStore.getState().deal()
    const correct = usePostSessionStore.getState().decision!.correct
    usePostSessionStore.getState().answer(correct)
    usePostSessionStore.getState().answer(correct)
    expect(useProgressStore.getState().post.total, 'подія не має подвоїтись').toBe(1)
  })
})

describe('continueHand', () => {
  it('веде роздачу до кінця, а потім роздає нову', () => {
    usePostSessionStore.getState().deal()
    let guard = 0
    while (guard++ < 30) {
      const s = usePostSessionStore.getState()
      if (!s.feedback) {
        const d = s.decision
        if (!d) break
        s.answer(d.correct)
        continue
      }
      s.continueHand()
      if (usePostSessionStore.getState().handOver) break
    }
    // Після завершення роздачі continueHand роздає наступну.
    const before = usePostSessionStore.getState().episode
    usePostSessionStore.getState().continueHand()
    expect(usePostSessionStore.getState().episode).not.toBe(before)
  })
})

describe('setScenario', () => {
  it('перемикає сценарій і одразу роздає нову руку', () => {
    usePostSessionStore.getState().deal()
    usePostSessionStore.getState().setScenario('iso')
    expect(usePostSessionStore.getState().scenario).toBe('iso')
    expect(usePostSessionStore.getState().episode?.scenario).toBe('iso')
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- postSessionStore.test`
Expected: FAIL, `Failed to resolve import "./postSessionStore"`.

- [ ] **Step 3: Реалізувати**

```ts
/**
 * Сесія Етапу 2: одна роздача, кілька рішень.
 *
 * Не персистується — це поточна рука, а не прогрес. Кожна відповідь одразу
 * лягає в чергу синку: база лишається джерелом істини навіть тоді, коли
 * мережі зараз немає.
 */

import { create } from 'zustand'

import { recordPostAttempt } from '../api/postSync'
import type { EpisodeEnd, EpisodeState } from '../engine/postflop/episode'
import { answerPost, heroDecision, startEpisode, type HeroDecision } from '../engine/postflop/step'
import type { PostAction } from '../engine/postflop/types'
import { boardCode } from '../engine/postflop/deck'
import { useProgressStore } from './progressStore'

export interface PostFeedback {
  readonly ok: boolean
  readonly correct: PostAction
  readonly why: string
}

export interface PostSessionState {
  episode: EpisodeState | null
  /** Рішення, яке зараз стоїть перед героєм; null — роздача завершена. */
  decision: HeroDecision | null
  /** Заповнюється після відповіді; null — питання відкрите. */
  feedback: PostFeedback | null
  /** Роздача дійшла до термінала — далі «Наступна рука». */
  handOver: EpisodeEnd | null
  streak: number
  scenario: 'rfi' | 'iso'

  deal: () => void
  answer: (chosen: PostAction) => void
  /** Після вердикту: наступне рішення цієї ж руки або нова рука. */
  continueHand: () => void
  setScenario: (scenario: 'rfi' | 'iso') => void
}

/** Один uuid на роздачу: групує всі рішення однієї руки в базі. */
let episodeId = ''

export const usePostSessionStore = create<PostSessionState>()((set, get) => ({
  episode: null,
  decision: null,
  feedback: null,
  handOver: null,
  streak: 0,
  scenario: 'rfi',

  deal: () => {
    const episode = startEpisode({ scenario: get().scenario })
    episodeId = crypto.randomUUID()
    set({ episode, decision: heroDecision(episode), feedback: null, handOver: null })
  },

  answer: (chosen) => {
    const { episode, decision, feedback, streak, scenario } = get()
    if (!episode || !decision || feedback) return

    const result = answerPost(episode, chosen, Math.random)
    const record = useProgressStore.getState().answerPost(
      {
        street: decision.street,
        cat: decision.cat,
        texture: decision.texture,
        facing: decision.facing,
        nOpps: decision.nOpps,
        ip: decision.ip,
        chosen,
        correct: decision.correct,
      },
      streak,
    )

    recordPostAttempt({
      client_id: crypto.randomUUID(),
      episode_id: episodeId,
      line: episode.line,
      scenario,
      hero_pos: episode.heroPos,
      opp_pos: episode.seats.filter((s) => !s.hero).map((s) => s.pos).join(','),
      n_opps: decision.nOpps,
      ip: decision.ip,
      street: decision.street,
      board: boardCode(episode.board),
      hand: handOf(episode),
      hole: holeOf(episode),
      category: decision.cat,
      texture: decision.texture,
      facing: decision.facing,
      repeat_aggro: decision.repeatAggro,
      pot_bb: decision.potBB,
      chosen,
      correct: decision.correct,
      answered_at: new Date().toISOString(),
    })

    set({
      feedback: { ok: result.ok, correct: decision.correct, why: decision.why },
      streak: record.streak,
      handOver: result.finished,
    })
  },

  continueHand: () => {
    const { episode, handOver } = get()
    if (!episode || handOver) {
      get().deal()
      return
    }
    set({ decision: heroDecision(episode), feedback: null })
  },

  setScenario: (scenario) => {
    set({ scenario })
    get().deal()
  },
}))

/** Канонічна рука героя: 'AKs', 'AKo', '77'. */
function handOf(ep: EpisodeState): string {
  const ORDER = 'AKQJT98765432'
  const hole = ep.seats[ep.heroIdx]?.hole ?? []
  const a = hole[0]
  const b = hole[1]
  if (!a || !b) return ''
  const [hi, lo] = ORDER.indexOf(a.rk) <= ORDER.indexOf(b.rk) ? [a, b] : [b, a]
  if (hi.rk === lo.rk) return `${hi.rk}${lo.rk}`
  return `${hi.rk}${lo.rk}${hi.s === lo.s ? 's' : 'o'}`
}

const holeOf = (ep: EpisodeState): string => boardCode(ep.seats[ep.heroIdx]?.hole ?? [])
```

- [ ] **Step 4: Тимчасова заглушка синку**

`recordPostAttempt` зʼявиться в Task 6. Щоб фаза лишалась зеленою покроково, створити `web/src/api/postSync.ts` з мінімальною реалізацією, яку Task 6 замінить на справжню чергу:

```ts
/**
 * Запис постфлоп-подій. У post-2 це заглушка: черга і таблиця зʼявляються
 * в post-3, і саме тому тут немає нічого, крім типу — щоб форма події була
 * зафіксована вже зараз і не розʼїхалась із міграцією.
 */

export interface QueuedPostAttempt {
  readonly client_id: string
  readonly episode_id: string
  readonly line: string
  readonly scenario: string
  readonly hero_pos: string
  readonly opp_pos: string
  readonly n_opps: number
  readonly ip: boolean
  readonly street: string
  readonly board: string
  readonly hand: string
  readonly hole: string
  readonly category: string
  readonly texture: string
  readonly facing: string
  readonly repeat_aggro: boolean
  readonly pot_bb: number
  readonly chosen: string
  readonly correct: string
  readonly answered_at: string
}

export function recordPostAttempt(_attempt: QueuedPostAttempt): void {
  // Заміняється справжньою чергою в post-3 (Task 6).
}
```

- [ ] **Step 5: Запустити — має пройти**

Run: `npm test -- postSessionStore.test`
Expected: PASS, 6 тестів.

- [ ] **Step 6: Коміт**

```bash
git add web/src/store/postSessionStore.ts web/src/store/postSessionStore.test.ts web/src/api/postSync.ts && git commit -m "post-2: стор сесії постфлопу"
```

---

### Task 3: Компоненти столу і вердикту

`PokerTable` і `Verdict` зашиті під префлопний `Spot`, тож постфлопу потрібні свої. Карти (`HandCards`), смужка цифр (`StatStrip`) і чіпси сценаріїв (`Chips`) перевикористовуються як є. CSS-класи вже існують у `web/src/styles/app.css` — `.cards.flop`, `.board-lbl`, `.tags`, `.tag`, `.verdict`, `.acts`, `.act-btn` — їх переносили заздалегідь саме під цю фазу.

**Files:**
- Create: `web/src/components/PostBoard.tsx`
- Create: `web/src/components/PostVerdict.tsx`
- Test: `web/src/components/PostVerdict.test.tsx`

- [ ] **Step 1: Написати падаючий тест вердикту**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { HeroDecision } from '../engine/postflop/step'
import { PostVerdict } from './PostVerdict'

const decision = (over: Partial<HeroDecision> = {}): HeroDecision => ({
  street: 'flop',
  facing: 'none',
  cat: 'STRONG_MADE',
  label: 'дві пари',
  texture: 'WET',
  events: { flushClosed: false, boardPaired: false, overcard: false },
  nOpps: 1,
  ip: true,
  potBB: 7.5,
  toCallBB: 0,
  repeatAggro: false,
  options: [
    { k: 'check', l: 'Чек', c: 'ghost' },
    { k: 'b33', l: 'Ставка 33% · 2.5bb', c: 'soft' },
    { k: 'b66', l: 'Ставка 66% · 5bb', c: 'primary' },
  ],
  correct: 'b66',
  why: 'Сильна рука на мокрій дошці — великий сайз, щоб дро платило неправильну ціну.',
  ...over,
})

describe('PostVerdict', () => {
  it('правильна відповідь показує «Правильно» і зелений стан', () => {
    const { container } = render(
      <PostVerdict decision={decision()} ok handOver={null} onNext={() => {}} />,
    )
    expect(screen.getByText('Правильно')).toBeInTheDocument()
    expect(container.querySelector('.verdict.ok')).not.toBeNull()
  })

  it('помилка називає правильну дію і пояснює чому', () => {
    render(<PostVerdict decision={decision()} ok={false} handOver={null} onNext={() => {}} />)
    expect(screen.getByText('Помилка')).toBeInTheDocument()
    expect(screen.getByText(/ставка 66%/)).toBeInTheDocument()
    expect(screen.getByText(/великий сайз/)).toBeInTheDocument()
  })

  it('показує теги руки, текстури і режиму', () => {
    render(<PostVerdict decision={decision()} ok handOver={null} onNext={() => {}} />)
    expect(screen.getByText('дві пари')).toBeInTheDocument()
    expect(screen.getByText('дошка мокра')).toBeInTheDocument()
    expect(screen.getByText(/хедз-ап · IP/)).toBeInTheDocument()
  })

  it('поки роздача триває — кнопка «Далі», після термінала — «Наступна рука»', () => {
    const { rerender } = render(
      <PostVerdict decision={decision()} ok handOver={null} onNext={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Далі/ })).toBeInTheDocument()

    rerender(
      <PostVerdict
        decision={decision()}
        ok
        handOver={{ kind: 'villains-folded', heroWon: true, potBB: 9, shown: [] }}
        onNext={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: /Наступна рука/ })).toBeInTheDocument()
    expect(screen.getByText(/банк твій|Усі скинули/)).toBeInTheDocument()
  })

  it('шоудаун показує карти опонентів і хто виграв', () => {
    render(
      <PostVerdict
        decision={decision()}
        ok
        handOver={{
          kind: 'showdown',
          heroWon: false,
          potBB: 12,
          shown: [
            { pos: 'BB', hole: [], label: 'дві пари', won: true },
            { pos: 'CO', hole: [], label: 'пара', won: false },
          ],
        }}
        onNext={() => {}}
      />,
    )
    expect(screen.getByText(/BB/)).toBeInTheDocument()
    expect(screen.getByText(/дві пари/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- PostVerdict.test`
Expected: FAIL, `Failed to resolve import "./PostVerdict"`.

- [ ] **Step 3: Реалізувати PostBoard**

```tsx
/**
 * Стіл постфлопу: борд, банк і стрічка того, що вже сталось у роздачі.
 *
 * PokerTable сюди не годиться — він малює 9 сітів під префлопний Spot.
 * Тут важливі інші речі: карти на столі й історія дій.
 */

import { HandCards } from './HandCards'
import { StatStrip } from './StatStrip'
import type { EpisodeState } from '../engine/postflop/episode'
import { STREET_LABEL } from '../engine/postflop/types'

export function PostBoard({ episode }: { episode: EpisodeState }) {
  const hero = episode.seats[episode.heroIdx]
  const opponents = episode.seats.filter((s) => !s.hero)
  const alive = opponents.filter((s) => !s.folded)

  return (
    <>
      <StatStrip
        style={{ marginBottom: 22 }}
        cells={[
          { value: episode.heroPos, label: 'твоя позиція', mono: true },
          { value: episode.ip ? 'у позиції' : 'поза позицією', label: 'на постфлопі', mono: true },
          {
            value: `${alive.length} (${alive.map((s) => s.pos).join(', ')})`,
            label: 'опонентів',
            mono: true,
          },
          { value: `${episode.potBB} bb`, label: 'банк', mono: true },
        ]}
      />

      <div className="board-lbl">{STREET_LABEL[episode.street]}</div>
      <HandCards cards={episode.board} hero={false} />

      <div className="board-lbl">Твої карти</div>
      <HandCards cards={hero?.hole ?? []} />

      <div className="hand-story">
        {episode.history.map((line, i) => (
          <span key={`${i}-${line}`}>{line}</span>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Реалізувати PostVerdict**

```tsx
/**
 * Вердикт постфлопу. Показується після кожного рішення, а не лише в кінці руки:
 * саме на рівні одного рішення оцінює рушій.
 */

import type { EpisodeEnd } from '../engine/postflop/episode'
import type { HeroDecision } from '../engine/postflop/step'
import { POST_ACT_LABEL, POST_CAT_LABEL, TEX_LABEL } from '../engine/postflop/types'

const END_TEXT: Readonly<Record<EpisodeEnd['kind'], string>> = {
  'hero-folded': 'Ти скинув — роздача завершена.',
  'villains-folded': 'Усі скинули, банк твій.',
  showdown: 'Шоудаун.',
}

export function PostVerdict({
  decision,
  ok,
  handOver,
  onNext,
}: {
  decision: HeroDecision
  ok: boolean
  handOver: EpisodeEnd | null
  onNext: () => void
}) {
  return (
    <div className={`verdict ${ok ? 'ok' : 'no'}`}>
      <h3>{ok ? 'Правильно' : 'Помилка'}</h3>

      <div className="tags">
        <span className="tag hand">{decision.label}</span>
        <span className="tag">{POST_CAT_LABEL[decision.cat]}</span>
        <span className="tag">дошка {TEX_LABEL[decision.texture]}</span>
        <span className="tag">
          {decision.nOpps >= 2 ? 'мультипот' : 'хедз-ап'} · {decision.ip ? 'IP' : 'OOP'}
        </span>
      </div>

      <p>
        Правильно тут — <strong>{POST_ACT_LABEL[decision.correct]}</strong>. {decision.why}
      </p>

      {handOver && (
        <p className="note">
          {END_TEXT[handOver.kind]}
          {handOver.kind === 'showdown' && (
            <>
              {' '}
              {handOver.shown
                .map((h) => `${h.pos}: ${h.label}${h.won ? ' — виграв' : ''}`)
                .join(' · ')}
            </>
          )}
        </p>
      )}

      <button type="button" className="next" onClick={onNext}>
        {handOver ? 'Наступна рука · пробіл' : 'Далі · пробіл'}
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Додати стиль стрічки історії**

У кінець `web/src/styles/app.css`, у секцію карт (після правил `.hand-label`):

```css
/* ---- postflop hand story ---- */
.hand-story{display:flex;flex-direction:column;gap:4px;margin:14px 0 4px;
  font-size:13px;color:var(--muted);line-height:1.5;}
.hand-story span:last-child{color:var(--ivory);}
```

- [ ] **Step 6: Запустити — має пройти**

Run: `npm test -- PostVerdict.test`
Expected: PASS, 5 тестів.

- [ ] **Step 7: Коміт**

```bash
git add web/src/components/PostBoard.tsx web/src/components/PostVerdict.tsx web/src/components/PostVerdict.test.tsx web/src/styles/app.css && git commit -m "post-2: компоненти столу і вердикту постфлопу"
```

---

### Task 4: Екран тренування постфлопу

**Files:**
- Create: `web/src/pages/TrainPost.tsx`
- Test: `web/src/pages/TrainPost.test.tsx`

- [ ] **Step 1: Написати падаючий тест**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { emptyPostProgress } from '../engine/postflop/postProgress'
import { usePostSessionStore } from '../store/postSessionStore'
import { useProgressStore } from '../store/progressStore'
import { TrainPost } from './TrainPost'

beforeEach(() => {
  useProgressStore.setState({ post: emptyPostProgress() })
  usePostSessionStore.setState({
    episode: null,
    decision: null,
    feedback: null,
    handOver: null,
    streak: 0,
    scenario: 'rfi',
  })
})

describe('TrainPost', () => {
  it('роздає руку при монтуванні і показує кнопки дій', () => {
    render(<TrainPost />)
    expect(screen.getByText('Твої карти')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button').filter((b) => b.className.includes('act-btn'))
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  it('після відповіді кнопки зникають, зʼявляється вердикт', async () => {
    const user = userEvent.setup()
    render(<TrainPost />)
    const first = screen.getAllByRole('button').find((b) => b.className.includes('act-btn'))
    await user.click(first!)

    expect(screen.queryByText(/Правильно|Помилка/)).toBeInTheDocument()
    expect(
      screen.getAllByRole('button').filter((b) => b.className.includes('act-btn')),
    ).toHaveLength(0)
  })

  it('смужка цифр показує серію і точність', () => {
    useProgressStore.setState({
      post: { ...emptyPostProgress(), total: 10, correct: 8, best: 4 },
    })
    render(<TrainPost />)
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByText('рішень')).toBeInTheDocument()
  })

  it('перемикач сценаріїв міняє тип роздачі', async () => {
    const user = userEvent.setup()
    render(<TrainPost />)
    await user.click(screen.getByRole('button', { name: /Ізоляція/ }))
    expect(usePostSessionStore.getState().scenario).toBe('iso')
  })
})
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npm test -- TrainPost.test`
Expected: FAIL, `Failed to resolve import "./TrainPost"`.

- [ ] **Step 3: Реалізувати**

```tsx
/** Вкладка «Тренування» Етапу 2: одна роздача, кілька рішень. */

import { useEffect } from 'react'

import { Chips } from '../components/Chips'
import { PostBoard } from '../components/PostBoard'
import { PostVerdict } from '../components/PostVerdict'
import { StatStrip } from '../components/StatStrip'
import { usePostSessionStore } from '../store/postSessionStore'
import { useProgressStore } from '../store/progressStore'

const SCENARIO_ITEMS = [
  { key: 'rfi' as const, label: 'Відкриття' },
  { key: 'iso' as const, label: 'Ізоляція' },
]

export function TrainPost() {
  const post = useProgressStore((s) => s.post)

  const episode = usePostSessionStore((s) => s.episode)
  const decision = usePostSessionStore((s) => s.decision)
  const feedback = usePostSessionStore((s) => s.feedback)
  const handOver = usePostSessionStore((s) => s.handOver)
  const streak = usePostSessionStore((s) => s.streak)
  const scenario = usePostSessionStore((s) => s.scenario)
  const deal = usePostSessionStore((s) => s.deal)
  const answer = usePostSessionStore((s) => s.answer)
  const continueHand = usePostSessionStore((s) => s.continueHand)
  const setScenario = usePostSessionStore((s) => s.setScenario)

  // Перша роздача — після монтування, а не в ініціалізаторі стору: до цього
  // моменту persist ще не встиг відновити прогрес.
  useEffect(() => {
    if (!episode) deal()
  }, [episode, deal])

  const acc = post.total ? Math.round((post.correct / post.total) * 100) : 0

  return (
    <section>
      <Chips
        items={SCENARIO_ITEMS}
        isOn={(k) => scenario === k}
        onPick={(k) => setScenario(k)}
      />

      <div className="stage">
        {episode && (
          <>
            <PostBoard episode={episode} />

            {decision && !feedback && (
              <div className="acts">
                {decision.options.map((o, i) => (
                  <button
                    type="button"
                    key={o.k}
                    className={`act-btn ${o.c}`}
                    onClick={() => answer(o.k)}
                  >
                    {o.l}
                    <small>клавіша {i + 1}</small>
                  </button>
                ))}
              </div>
            )}

            {decision && feedback && (
              <PostVerdict
                decision={decision}
                ok={feedback.ok}
                handOver={handOver}
                onNext={continueHand}
              />
            )}
          </>
        )}
      </div>

      <StatStrip
        style={{ marginTop: 18 }}
        cells={[
          { value: streak, label: 'серія' },
          { value: `${acc}%`, label: 'точність' },
          { value: post.total, label: 'рішень' },
          { value: post.best, label: 'рекорд' },
        ]}
      />
    </section>
  )
}
```

- [ ] **Step 4: Запустити — має пройти**

Run: `npm test -- TrainPost.test`
Expected: PASS, 4 тести.

Якщо `userEvent` не знайдено — доставити: `npm i -D @testing-library/user-event` (у репо його ще немає, це перший тест із кліками; `DrillBar.test.tsx` обходився рендером).

- [ ] **Step 5: Коміт**

```bash
git add web/src/pages/TrainPost.tsx web/src/pages/TrainPost.test.tsx web/package.json web/package-lock.json && git commit -m "post-2: екран тренування постфлопу"
```

---

### Task 5: Підключення до застосунку і гарячі клавіші

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/hooks/useHotkeys.ts`

- [ ] **Step 1: Додати хук хоткеїв**

У `web/src/hooks/useHotkeys.ts`, поряд із наявним `useTrainHotkeys`:

```ts
/**
 * Хоткеї Етапу 2. Окремий хук, а не прапорець у префлопному: набір дій там
 * фіксований (raise/call/fold), а тут залежить від контексту рішення.
 */
export function usePostTrainHotkeys(enabled: boolean): void {
  const decision = usePostSessionStore((s) => s.decision)
  const feedback = usePostSessionStore((s) => s.feedback)
  const answer = usePostSessionStore((s) => s.answer)
  const continueHand = usePostSessionStore((s) => s.continueHand)

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      if (el?.isContentEditable) return
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return

      if (feedback) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          continueHand()
        }
        return
      }
      const idx = ['1', '2', '3'].indexOf(e.key)
      if (idx < 0 || !decision) return
      const option = decision.options[idx]
      if (option) answer(option.k)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, decision, feedback, answer, continueHand])
}
```

Дописати імпорт `import { usePostSessionStore } from '../store/postSessionStore'`.

- [ ] **Step 2: Підключити екран у App.tsx**

Імпорти:
```ts
import { TrainPost } from './pages/TrainPost'
import { usePostTrainHotkeys } from './hooks/useHotkeys'
```

Поряд із наявним рядком хоткеїв (`useTrainHotkeys(stage === 'pre' && tab === 'train')`) додати:
```ts
usePostTrainHotkeys(stage === 'post' && postUnlocked)
```

Замінити блок-заглушку (панель «Етап 2 відкрито · Сам постфлоп-тренажер зʼявиться окремим кроком») на:
```tsx
) : postUnlocked ? (
  <TrainPost />
) : (
  <GateLock />
)}
```

- [ ] **Step 3: Перевірити в браузері**

Запустити прев'ю дев-сервера і пройти шлях: відкрити Етап 2 (за наявного прогресу воріт), зіграти 3–4 руки, перевірити хоткеї 1/2/3 і пробіл, побачити шоудаун.

Run: `npm run dev`, далі відкрити `http://localhost:5173`.

Якщо ворота ще закриті, для перевірки тимчасово виставити в консолі браузера:
```js
JSON.parse(localStorage.poker_trainer_web_v1)
```
і переконатись, що `state.postUnlocked === true`; інакше зіграти префлоп до відкриття — **не** правити код заради обходу воріт.

- [ ] **Step 4: Прогнати весь набір**

Run: `npm test && npm run typecheck && npm run lint`
Expected: усе зелене.

- [ ] **Step 5: Коміт**

```bash
git add web/src/App.tsx web/src/hooks/useHotkeys.ts && git commit -m "post-2: постфлоп у перемикачі етапів, гарячі клавіші"
```

---

### Task 6: Узагальнення черги синку

Зараз `SyncQueue` вшито в таблицю `attempts` (рядки 137–140). Постфлопу потрібна друга черга — з іншою таблицею і власним ключем у localStorage.

**Files:**
- Modify: `web/src/api/syncQueue.ts`
- Modify: `web/src/api/syncQueue.test.ts`
- Modify: `web/src/api/sync.ts`
- Modify: `supabase/tests/sync.test.ts`

- [ ] **Step 1: Переписати залежності черги**

У `web/src/api/syncQueue.ts` замінити `SyncDeps` і зробити клас узагальненим. Ключова ідея: черга більше не знає ні про таблицю, ні про supabase — відправка інжектується. Це прибирає єдине місце, через яке черга була однотабличною, і заодно робить тести чеснішими: більше не треба підробляти клієнт бази.

```ts
export const QUEUE_KEY = 'poker_trainer_sync_queue_v1'
export const POST_QUEUE_KEY = 'poker_trainer_post_sync_queue_v1'

export interface SendResult {
  readonly error: { readonly message: string } | null
}

export interface SyncDeps<T extends { client_id: string }> {
  storage: QueueStorage
  /** Чи є зараз авторизований користувач. Без нього слати нікуди. */
  isAuthenticated: () => boolean
  now?: () => number
  /** Ключ у localStorage: у кожної черги свій. */
  storageKey: string
  /** Відправка батча. Єдине місце, яке знає таблицю. */
  send: (batch: readonly T[]) => Promise<SendResult>
}
```

Прибрати `import type { AttemptInsert, Db } from './supabase'` і лишити:
```ts
import type { AttemptInsert } from './supabase'

export type QueuedAttempt = AttemptInsert & { client_id: string }
```

Функції читання/запису черги приймають ключ:
```ts
function readQueue<T extends { client_id: string }>(storage: QueueStorage, key: string): T[]
function writeQueue<T extends { client_id: string }>(storage: QueueStorage, key: string, items: readonly T[]): void
```
— у тілах замінити `QUEUE_KEY` на `key`, решта логіки (фільтр за `client_id`, ковтання JSON-помилок) без змін.

Клас:
```ts
export class SyncQueue<T extends { client_id: string }> {
  private readonly deps: SyncDeps<T>
  // решта полів без змін
}
```
Усі внутрішні виклики `readQueue(this.deps.storage)` → `readQueue<T>(this.deps.storage, this.deps.storageKey)`, аналогічно `writeQueue`.

Відправка (те, що було рядками 137–140):
```ts
    const batch = queue.slice(0, BATCH_LIMIT)
    // Повторна відправка того самого батча нічого не дублює: за це відповідає
    // unique (user_id, client_id) у базі та ignoreDuplicates у send.
    const { error } = await this.deps.send(batch)
```

- [ ] **Step 2: Оновити sync.ts**

```ts
export const queue = new SyncQueue<QueuedAttempt>({
  storage: globalThis.localStorage,
  isAuthenticated: () => useAuthStore.getState().session !== null,
  storageKey: QUEUE_KEY,
  send: (batch) =>
    supabase
      .from('attempts')
      .upsert([...batch], { onConflict: 'user_id,client_id', ignoreDuplicates: true }),
})
```

У приватній `run()` після флашу префлопної черги додати флаш постфлопної:
```ts
  await flushPostQueue(force)
```
з імпортом `import { flushPostQueue } from './postSync'`.

- [ ] **Step 3: Оновити тести черги**

У `web/src/api/syncQueue.test.ts` замінити `fakeDb` на фабрику відправки — простішу і без приведень типів:

```ts
/** Підроблена відправка: фіксує батчі, вміє віддавати помилку. */
function fakeSend(behaviour: { error?: string } = {}) {
  const batches: QueuedAttempt[][] = []
  const send = (batch: readonly QueuedAttempt[]) => {
    batches.push([...batch])
    return Promise.resolve(
      behaviour.error ? { error: { message: behaviour.error } } : { error: null },
    )
  }
  return { send, batches }
}
```

Кожне створення черги в тестах:
```ts
const { send, batches } = fakeSend()
const q = new SyncQueue<QueuedAttempt>({
  storage,
  isAuthenticated: () => true,
  storageKey: QUEUE_KEY,
  send,
})
```

Тест гонки (той, що утримує `resolveUpsert`) — та сама ідея, але проміс тепер повертає `send`:
```ts
let resolveSend: ((r: { error: null }) => void) | null = null
const send = () => new Promise<SendResult>((res) => { resolveSend = res as never })
```

Прибрати імпорт `type Db` — він більше не потрібен.

- [ ] **Step 4: Оновити наскрізний тест бази**

У `supabase/tests/sync.test.ts` замінити `makeQueue`:

```ts
const makeQueue = () =>
  new SyncQueue<QueuedAttempt>({
    storage,
    isAuthenticated: () => authenticated,
    storageKey: 'test-queue',
    send: (batch) =>
      client
        .from('attempts')
        .upsert([...batch], { onConflict: 'user_id,client_id', ignoreDuplicates: true }),
  })
```
і прибрати `import type { Db } from '../../web/src/api/supabase'` разом із приведенням `client as unknown as Db`.

- [ ] **Step 5: Запустити юніт-тести**

Run: `npm test -- syncQueue.test`
Expected: PASS — усі наявні кейси лишаються, поведінка не змінилась.

Run: `npm test && npm run typecheck`
Expected: зелено.

- [ ] **Step 6: Коміт**

```bash
git add web/src/api/syncQueue.ts web/src/api/syncQueue.test.ts web/src/api/sync.ts supabase/tests/sync.test.ts && git commit -m "post-3: черга синку більше не привʼязана до однієї таблиці"
```

---

### Task 7: Таблиця postflop_attempts

**Files:**
- Create: `supabase/migrations/<timestamp>_postflop_attempts.sql`
- Modify: `web/src/api/database.types.ts` (генерується)
- Modify: `web/src/api/supabase.ts`
- Modify: `web/src/api/postSync.ts`

- [ ] **Step 1: Створити файл міграції**

З кореня репозиторію:

```bash
npm run db:new postflop_attempts
```
Expected: `Created new migration at supabase/migrations/<timestamp>_postflop_attempts.sql`

- [ ] **Step 2: Наповнити міграцію**

Вміст створеного файлу цілком:

```sql
-- Журнал постфлопу (Етап 2).
--
-- Окрема таблиця, а не нові колонки в attempts: форма події інша (вулиця, борд,
-- контекст рішення), а префлопний журнал не хочеться чіпати міграцією.
--
-- Принцип той самий: сирі події, не агрегати. Один рядок — ОДНЕ рішення героя;
-- episode_id лише групує рішення однієї роздачі для розбору, це звʼязка, а не
-- лічильник.

create table public.postflop_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   text not null,

  -- Спільний для всіх рішень однієї роздачі.
  episode_id  uuid not null,

  line        text not null check (line in ('aggressor', 'caller')),
  -- Префлоп-контекст, з якого виріс постфлоп.
  scenario    text not null check (scenario in ('rfi', 'iso', 'vsraise')),

  hero_pos    text not null check (hero_pos in ('UTG','UTG+1','MP','LJ','HJ','CO','BTN','SB','BB')),
  -- Позиції опонентів роздачі через кому: 'BB' або 'BTN,BB'.
  -- Разом із board, facing і pot_bb дає повне відтворення споту для drill.
  opp_pos     text not null,
  n_opps      smallint not null check (n_opps between 1 and 3),
  ip          boolean not null,

  street      text not null check (street in ('flop', 'turn', 'river')),
  board       text not null check (board ~ '^([AKQJT98765432][shdc]){3,5}$'),
  hand        text not null check (hand ~ '^[AKQJT98765432]{2}[so]?$'),
  hole        text not null check (hole ~ '^([AKQJT98765432][shdc]){2}$'),

  category    text not null check (category in
    ('STRONG_MADE','STRONG_PAIR','MEDIUM','WEAK','DRAW','WEAKDRAW','AIR')),
  -- Текстура флопу; події пізніх вулиць відтворюються з board.
  texture     text not null check (texture in ('DRY', 'WET', 'PAIRED')),
  facing      text not null check (facing in ('none', 'small_bet', 'big_bet', 'raise')),
  repeat_aggro boolean not null default false,
  pot_bb      numeric not null check (pot_bb > 0),

  chosen      text not null check (chosen in ('check','b33','b66','fold','call','raise')),
  correct     text not null check (correct in ('check','b33','b66','fold','call','raise')),
  -- Похідне, але генероване базою: клієнт не може надіслати is_correct,
  -- що суперечить парі (chosen, correct).
  is_correct  boolean not null generated always as (chosen = correct) stored,

  answered_at timestamptz not null,
  created_at  timestamptz not null default now(),

  constraint postflop_attempts_user_client_key unique (user_id, client_id)
);

comment on table public.postflop_attempts is
  'Сирі події Етапу 2. Один рядок — одне рішення героя; episode_id групує роздачу.';
comment on column public.postflop_attempts.episode_id is
  'Ідентифікатор роздачі: звʼязує рішення флопу, терну й рівера однієї руки.';
comment on column public.postflop_attempts.opp_pos is
  'Позиції опонентів через кому. Потрібні, щоб відтворити спот у розборі й drill.';

create index postflop_attempts_user_answered_idx
  on public.postflop_attempts (user_id, answered_at desc);
create index postflop_attempts_user_street_answered_idx
  on public.postflop_attempts (user_id, street, answered_at desc);
create index postflop_attempts_user_episode_idx
  on public.postflop_attempts (user_id, episode_id);
create index postflop_attempts_user_mistakes_idx
  on public.postflop_attempts (user_id, answered_at desc)
  where not is_correct;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Anon-ключ публічний, тож ізоляція тримається виключно на політиках.

alter table public.postflop_attempts enable row level security;

grant select, insert, delete on public.postflop_attempts to authenticated;
grant all on public.postflop_attempts to service_role;

create policy "Користувач бачить лише свої постфлоп-спроби"
  on public.postflop_attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Користувач пише лише свої постфлоп-спроби"
  on public.postflop_attempts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- DELETE потрібен для «видалити все назавжди»; UPDATE-політики немає навмисно:
-- переписати окремий рядок журналу не може навіть його власник.
create policy "Користувач видаляє лише свої постфлоп-спроби"
  on public.postflop_attempts for delete
  to authenticated
  using ((select auth.uid()) = user_id);
```

- [ ] **Step 3: Застосувати і перегенерувати типи**

```bash
npm run db:start
```
```bash
npm run db:reset && npm run db:types
```
Expected: міграції застосовуються без помилок; `web/src/api/database.types.ts` отримує `postflop_attempts`.

Перевірити:
```bash
grep -c "postflop_attempts" web/src/api/database.types.ts
```
Expected: число більше нуля.

- [ ] **Step 4: Експортувати типи рядка**

У `web/src/api/supabase.ts` після наявних експортів:

```ts
export type PostflopAttemptRow = Database['public']['Tables']['postflop_attempts']['Row']
export type PostflopAttemptInsert = Database['public']['Tables']['postflop_attempts']['Insert']
```

- [ ] **Step 5: Замінити заглушку синку на справжню чергу**

`web/src/api/postSync.ts` цілком:

```ts
/**
 * Черга постфлоп-подій.
 *
 * Окремий інстанс тієї самої SyncQueue з власним ключем у localStorage: події
 * двох етапів не мають блокувати одна одну, а таблиці в них різні.
 */

import { create } from 'zustand'

import { useAuthStore } from '../store/authStore'
import { supabase, type PostflopAttemptInsert } from './supabase'
import { POST_QUEUE_KEY, SyncQueue } from './syncQueue'

export type QueuedPostAttempt = PostflopAttemptInsert & { client_id: string }

export const postQueue = new SyncQueue<QueuedPostAttempt>({
  storage: globalThis.localStorage,
  isAuthenticated: () => useAuthStore.getState().session !== null,
  storageKey: POST_QUEUE_KEY,
  // async, а не пряме повернення білдера: PostgrestFilterBuilder — PromiseLike,
  // і без await він не звужується до Promise<SendResult>.
  send: async (batch) =>
    await supabase
      .from('postflop_attempts')
      .upsert([...batch], { onConflict: 'user_id,client_id', ignoreDuplicates: true }),
})

interface PostSyncState {
  pending: number
  queued: QueuedPostAttempt[]
}

export const usePostSyncStore = create<PostSyncState>()(() => ({
  pending: postQueue.size,
  queued: postQueue.peek(),
}))

const refresh = (): void => {
  usePostSyncStore.setState({ pending: postQueue.size, queued: postQueue.peek() })
}

export function recordPostAttempt(attempt: QueuedPostAttempt): void {
  const shouldFlush = postQueue.enqueue(attempt)
  refresh()
  if (shouldFlush) void flushPostQueue()
}

export async function flushPostQueue(force = false): Promise<void> {
  await postQueue.flush(force)
  refresh()
}
```

- [ ] **Step 6: Перевірити**

Run: `npm test && npm run typecheck`
Expected: зелено. Тест `postSessionStore.test` тепер ганяє справжню чергу — вона пише в `localStorage` jsdom і без логіну просто накопичується, тобто нічого не ламає.

- [ ] **Step 7: Коміт**

```bash
git add supabase/migrations web/src/api/database.types.ts web/src/api/supabase.ts web/src/api/postSync.ts && git commit -m "post-3: таблиця postflop_attempts і черга постфлоп-подій"
```

---

### Task 8: Інтеграційні тести RLS

**Files:**
- Create: `supabase/tests/postflop.test.ts`

- [ ] **Step 1: Написати тест**

```ts
/**
 * RLS і обмеження таблиці postflop_attempts.
 *
 * Вимагають `npm run db:start`. Ключі нижче — стандартні ключі локальної
 * розробки Supabase CLI: вони однакові у всіх і не є секретами.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env['SUPABASE_ANON_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_KEY =
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface Actor {
  id: string
  email: string
  client: SupabaseClient
}

async function createActor(email: string): Promise<Actor> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'test-password-123',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`не вдалося створити ${email}: ${error?.message}`)

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await client.auth.signInWithPassword({ email, password: 'test-password-123' })
  if (signIn.error) throw new Error(`не вдалося увійти як ${email}: ${signIn.error.message}`)

  return { id: data.user.id, email, client }
}

const decision = (over: Record<string, unknown> = {}) => ({
  client_id: crypto.randomUUID(),
  episode_id: crypto.randomUUID(),
  line: 'aggressor',
  scenario: 'rfi',
  hero_pos: 'CO',
  opp_pos: 'BB',
  n_opps: 1,
  ip: true,
  street: 'flop',
  board: 'Ks7d2c',
  hand: 'AKs',
  hole: 'AsKs',
  category: 'STRONG_PAIR',
  texture: 'DRY',
  facing: 'none',
  repeat_aggro: false,
  pot_bb: 7.5,
  chosen: 'b33',
  correct: 'b33',
  answered_at: new Date('2026-08-01T10:00:00Z').toISOString(),
  ...over,
})

let alice: Actor
let bob: Actor
const anon = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

beforeAll(async () => {
  // Помилку прибирання перевіряємо явно: мовчазний no-op зробив би тести
  // залежними від порядку виконання.
  const { error } = await admin.from('postflop_attempts').delete().gte('id', 0)
  if (error) throw new Error(`не вдалося очистити postflop_attempts: ${error.message}`)
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)

  alice = await createActor('alice.post@example.com')
  bob = await createActor('bob.post@example.com')
}, 60_000)

afterAll(async () => {
  const { data } = await admin.auth.admin.listUsers()
  for (const u of data?.users ?? []) await admin.auth.admin.deleteUser(u.id)
})

describe('RLS: ізоляція користувачів', () => {
  it('запис проставляє user_id автора', async () => {
    const { error } = await alice.client.from('postflop_attempts').insert(decision())
    expect(error).toBeNull()
    const { data } = await admin.from('postflop_attempts').select('user_id')
    expect(data?.every((r) => r.user_id === alice.id)).toBe(true)
  })

  it('чужі рішення не видно', async () => {
    await bob.client.from('postflop_attempts').insert(decision({ hero_pos: 'BTN' }))
    const { data } = await alice.client.from('postflop_attempts').select('hero_pos')
    expect(data?.some((r) => r.hero_pos === 'BTN'), 'Аліса не має бачити руку Боба').toBe(false)
  })

  it('писати від чужого імені не можна', async () => {
    const { error } = await alice.client
      .from('postflop_attempts')
      .insert(decision({ user_id: bob.id }))
    expect(error).not.toBeNull()
  })

  it('без логіну не видно нічого і не пишеться нічого', async () => {
    const { data } = await anon.from('postflop_attempts').select('id')
    expect(data ?? []).toHaveLength(0)
    const { error } = await anon.from('postflop_attempts').insert(decision())
    expect(error).not.toBeNull()
  })

  it('переписати рядок журналу не може навіть автор', async () => {
    const { error } = await alice.client
      .from('postflop_attempts')
      .update({ chosen: 'b66' })
      .eq('user_id', alice.id)
    // UPDATE-політики немає: або помилка, або нуль зачеплених рядків.
    const { data } = await alice.client.from('postflop_attempts').select('chosen')
    expect(error !== null || data?.every((r) => r.chosen !== 'b66')).toBe(true)
  })

  it('свої рядки видаляються, чужі — ні', async () => {
    const before = await admin.from('postflop_attempts').select('id', { count: 'exact', head: true })
    await alice.client.from('postflop_attempts').delete().gte('id', 0)
    const after = await admin.from('postflop_attempts').select('user_id')
    expect(after.data?.every((r) => r.user_id === bob.id), 'мали лишитись лише рядки Боба').toBe(true)
    expect(before.count ?? 0).toBeGreaterThan(after.data?.length ?? 0)
  })
})

describe('Ідемпотентність синку', () => {
  it('повторний upsert того самого client_id не дублює рядок', async () => {
    const row = decision()
    const opts = { onConflict: 'user_id,client_id', ignoreDuplicates: true }
    await alice.client.from('postflop_attempts').upsert([row], opts)
    await alice.client.from('postflop_attempts').upsert([row], opts)
    const { data } = await alice.client
      .from('postflop_attempts')
      .select('client_id')
      .eq('client_id', row.client_id)
    expect(data).toHaveLength(1)
  })
})

describe('Обмеження цілісності', () => {
  it('is_correct рахує база, а не клієнт', async () => {
    const row = decision({ chosen: 'check', correct: 'b66' })
    await alice.client.from('postflop_attempts').insert(row)
    const { data } = await alice.client
      .from('postflop_attempts')
      .select('is_correct')
      .eq('client_id', row.client_id)
      .single()
    expect(data?.is_correct).toBe(false)
  })

  it.each([
    ['невалідний борд', { board: 'KKK' }],
    ['невалідна рука', { hand: 'ZZZ' }],
    ['невалідні карти героя', { hole: 'AsKsQs' }],
    ['невалідна вулиця', { street: 'preflop' }],
    ['невалідна категорія', { category: 'STRONG' }],
    ['невалідна дія', { chosen: '3bet' }],
    ['нульовий банк', { pot_bb: 0 }],
    ['забагато опонентів', { n_opps: 9 }],
  ])('%s відхиляється', async (_name, over) => {
    const { error } = await alice.client.from('postflop_attempts').insert(decision(over))
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Запустити**

З кореня репозиторію, за піднятого `npm run db:start`:

```bash
npm run test:db -- postflop
```
Expected: PASS. `vitest.db.config.ts` підхоплює файл автоматично — його `include` це `supabase/tests/**/*.test.ts`.

- [ ] **Step 3: Прогнати всі тести бази**

```bash
npm run test:db
```
Expected: усі файли зелені, зокрема оновлений `sync.test.ts` із Task 6.

- [ ] **Step 4: Коміт**

```bash
git add supabase/tests/postflop.test.ts && git commit -m "post-3: тести RLS постфлоп-журналу"
```

---

### Task 9: Серверні зрізи і джерело цифр

SQL робить лише `GROUP BY`; діагностика лишається в TS (правило 4 CLAUDE.md).

**Files:**
- Create: `supabase/migrations/<timestamp>_postflop_stats.sql`
- Create: `web/src/api/serverPostProgress.ts`
- Create: `web/src/store/mergePostProgress.ts`
- Create: `web/src/store/mergePostProgress.test.ts`
- Create: `web/src/store/postStatsSource.ts`
- Modify: `web/src/pages/TrainPost.tsx`

- [ ] **Step 1: Створити міграцію зрізів**

```bash
npm run db:new postflop_stats
```

Вміст:

```sql
-- Зрізи постфлопу.
--
-- SQL рахує, TS вирішує: тут лише GROUP BY. Ворота, патерни й діагностика
-- лишаються в web/src/engine/, інакше джерел істини стало б два.
--
-- Мітка скидання діє так само, як у префлопі: рахується лише те, що після неї.

create or replace function public.postflop_totals()
returns table (
  dimension text,
  bucket    text,
  played    bigint,
  correct   bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with rows as (
    select *
    from public.postflop_attempts
    where user_id = (select auth.uid())
      and answered_at > coalesce(public.current_reset_at(), '-infinity'::timestamptz)
  )
  select 'street', street, count(*), count(*) filter (where is_correct) from rows group by street
  union all
  select 'category', category, count(*), count(*) filter (where is_correct) from rows group by category
  union all
  select 'texture', texture, count(*), count(*) filter (where is_correct) from rows group by texture
  union all
  select 'facing', facing, count(*), count(*) filter (where is_correct) from rows group by facing
  union all
  select 'mode',
         (case when n_opps >= 2 then 'MULTI' else 'HU' end) || '·' ||
         (case when ip then 'IP' else 'OOP' end),
         count(*), count(*) filter (where is_correct)
  from rows
  group by 2
$$;

comment on function public.postflop_totals is
  'Зіграно/правильно за пʼятьма зрізами Етапу 2 одним запитом.';

create or replace function public.postflop_summary()
returns table (
  total       bigint,
  correct     bigint,
  best_streak integer,
  reset_at    timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select coalesce(public.current_reset_at(), '-infinity'::timestamptz) as since,
           public.current_reset_at()                                     as marker
  ),
  counted as (
    select is_correct,
           row_number() over (order by answered_at, id)
             - row_number() over (partition by is_correct order by answered_at, id) as grp
    from public.postflop_attempts, bounds
    where user_id = (select auth.uid())
      and answered_at > bounds.since
  ),
  streaks as (
    select count(*) as len from counted where is_correct group by grp
  )
  select
    (select count(*) from public.postflop_attempts, bounds
      where user_id = (select auth.uid()) and answered_at > bounds.since)              as total,
    (select count(*) from public.postflop_attempts, bounds
      where user_id = (select auth.uid()) and is_correct and answered_at > bounds.since) as correct,
    coalesce((select max(len) from streaks), 0)::integer                                as best_streak,
    (select marker from bounds)                                                         as reset_at
$$;

create or replace function public.postflop_mistakes(max_rows integer default 500)
returns table (
  street      text,
  category    text,
  texture     text,
  facing      text,
  n_opps      smallint,
  ip          boolean,
  chosen      text,
  correct     text,
  answered_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.street, a.category, a.texture, a.facing, a.n_opps, a.ip,
         a.chosen, a.correct, a.answered_at
  from (
    select *
    from public.postflop_attempts
    where user_id = (select auth.uid())
      and not is_correct
      and answered_at > coalesce(public.current_reset_at(), '-infinity'::timestamptz)
    order by answered_at desc, id desc
    limit least(greatest(max_rows, 1), 2000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

comment on function public.postflop_mistakes is
  'Журнал помилок Етапу 2 — вхід для розбору в engine/.';
```

- [ ] **Step 2: Застосувати і перегенерувати типи**

```bash
npm run db:reset && npm run db:types
```
Expected: без помилок; у `database.types.ts` зʼявляються `postflop_totals`, `postflop_summary`, `postflop_mistakes`.

- [ ] **Step 3: Написати падаючий тест злиття**

`web/src/store/mergePostProgress.test.ts`:

```ts
/**
 * Серверні цифри відстають рівно на те, що ще в черзі. Злиття дописує
 * незакинуті події, щоб інтерфейс не показував менше, ніж користувач зіграв.
 */

import { describe, expect, it } from 'vitest'

import { emptyPostProgress } from '../engine/postflop/postProgress'
import type { QueuedPostAttempt } from '../api/postSync'
import { mergePostProgress } from './mergePostProgress'

const queued = (over: Partial<QueuedPostAttempt> = {}): QueuedPostAttempt =>
  ({
    client_id: 'c1',
    episode_id: 'e1',
    line: 'aggressor',
    scenario: 'rfi',
    hero_pos: 'CO',
    opp_pos: 'BB',
    n_opps: 1,
    ip: true,
    street: 'flop',
    board: 'Ks7d2c',
    hand: 'AKs',
    hole: 'AsKs',
    category: 'AIR',
    texture: 'DRY',
    facing: 'none',
    repeat_aggro: false,
    pot_bb: 7.5,
    chosen: 'check',
    correct: 'check',
    answered_at: '2026-08-01T10:00:00.000Z',
    ...over,
  }) as QueuedPostAttempt

describe('mergePostProgress', () => {
  it('порожня черга нічого не змінює', () => {
    const server = { ...emptyPostProgress(), total: 5, correct: 4 }
    const merged = mergePostProgress(server, [])
    expect(merged.total).toBe(5)
    expect(merged.correct).toBe(4)
  })

  it('події з черги додаються до серверних цифр', () => {
    const server = { ...emptyPostProgress(), total: 5, correct: 4 }
    const merged = mergePostProgress(server, [queued(), queued({ chosen: 'b66' })])
    expect(merged.total).toBe(7)
    expect(merged.correct).toBe(5)
    expect(merged.byStreet['flop']).toEqual({ t: 2, c: 1 })
    expect(merged.log).toHaveLength(1)
  })

  it('серверний обʼєкт не мутується', () => {
    const server = { ...emptyPostProgress(), total: 5, correct: 4 }
    mergePostProgress(server, [queued()])
    expect(server.total, 'вхідний прогрес має лишитись цілим').toBe(5)
  })
})
```

- [ ] **Step 4: Запустити — має впасти**

Run: `npm test -- mergePostProgress.test`
Expected: FAIL, `Failed to resolve import "./mergePostProgress"`.

- [ ] **Step 5: Реалізувати злиття**

`web/src/store/mergePostProgress.ts`:

```ts
/**
 * Серверний прогрес плюс те, що ще не доїхало.
 *
 * Без цього цифри «відкочувались» би після кожної відповіді, поки батч у
 * дорозі — і виглядало б це як загублений прогрес.
 */

import type { QueuedPostAttempt } from '../api/postSync'
import {
  recordPostAnswer,
  type PostProgress,
} from '../engine/postflop/postProgress'
import type { Facing, PostAction, PostCategory, Street, Texture } from '../engine/postflop/types'

export function mergePostProgress(
  server: PostProgress,
  queued: readonly QueuedPostAttempt[],
): PostProgress {
  if (queued.length === 0) return server
  const merged = structuredClone(server)
  let streak = 0
  for (const row of queued) {
    const result = recordPostAnswer(merged, streak, {
      street: row.street as Street,
      cat: row.category as PostCategory,
      texture: row.texture as Texture,
      facing: row.facing as Facing,
      nOpps: row.n_opps,
      ip: row.ip,
      chosen: row.chosen as PostAction,
      correct: row.correct as PostAction,
      at: Date.parse(row.answered_at),
    })
    streak = result.streak
  }
  return merged
}
```

- [ ] **Step 6: Реалізувати серверний прогрес**

`web/src/api/serverPostProgress.ts`:

```ts
/**
 * Серверний прогрес Етапу 2.
 *
 * Збирається в ту саму структуру PostProgress, що й локальний буфер, — тому
 * інтерфейс не знає, звідки взялись цифри, і працює однаковим кодом.
 */

import {
  emptyPostProgress,
  type PostMistakeEntry,
  type PostProgress,
} from '../engine/postflop/postProgress'
import type { Facing, PostAction, PostCategory, Street, Texture } from '../engine/postflop/types'
import { supabase } from './supabase'

const MISTAKES_LIMIT = 500

export interface ServerPostProgress {
  readonly progress: PostProgress
  readonly fetchedAt: number
  readonly resetAt: number | null
}

/** Ключ зрізу в SQL → поле PostProgress. Лише поля-таблиці, тому без приведень. */
type SliceField = 'byStreet' | 'byCat' | 'byTex' | 'byFacing' | 'byMode'

const DIMENSIONS: Readonly<Record<string, SliceField>> = {
  street: 'byStreet',
  category: 'byCat',
  texture: 'byTex',
  facing: 'byFacing',
  mode: 'byMode',
}

export async function fetchServerPostProgress(): Promise<ServerPostProgress> {
  const [summary, totals, mistakes] = await Promise.all([
    supabase.rpc('postflop_summary'),
    supabase.rpc('postflop_totals'),
    supabase.rpc('postflop_mistakes', { max_rows: MISTAKES_LIMIT }),
  ])

  const failed = [summary, totals, mistakes].find((r) => r.error)
  if (failed?.error) throw new Error(failed.error.message)

  const p = emptyPostProgress()
  let resetAt: number | null = null

  const s = summary.data?.[0]
  if (s) {
    p.total = Number(s.total)
    p.correct = Number(s.correct)
    p.best = Number(s.best_streak)
    resetAt = s.reset_at ? Date.parse(s.reset_at) : null
  }

  for (const row of totals.data ?? []) {
    const field = DIMENSIONS[row.dimension]
    if (!field) continue
    p[field][row.bucket] = { t: Number(row.played), c: Number(row.correct) }
  }

  p.log = (mistakes.data ?? []).map(
    (r): PostMistakeEntry => ({
      street: r.street as Street,
      cat: r.category as PostCategory,
      tex: r.texture as Texture,
      facing: r.facing as Facing,
      n: r.n_opps,
      ip: r.ip ? 1 : 0,
      ch: r.chosen as PostAction,
      co: r.correct as PostAction,
      t: Date.parse(r.answered_at),
    }),
  )

  return { progress: p, fetchedAt: Date.now(), resetAt }
}
```

- [ ] **Step 7: Реалізувати джерело цифр**

`web/src/store/postStatsSource.ts`:

```ts
/**
 * Звідки беруться цифри Етапу 2: сервер, якщо є логін, інакше локальний буфер.
 * Дзеркалить statsSource.ts префлопу — свідомо, щоб обидва етапи поводились
 * однаково і правились в одному місці подумки.
 */

import { useEffect, useMemo } from 'react'
import { create } from 'zustand'

import { fetchServerPostProgress } from '../api/serverPostProgress'
import { usePostSyncStore } from '../api/postSync'
import type { PostProgress } from '../engine/postflop/postProgress'
import { useAuthStore } from './authStore'
import { mergePostProgress } from './mergePostProgress'
import { useProgressStore } from './progressStore'

interface ServerPostState {
  progress: PostProgress | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  reset: () => void
}

export const useServerPostStats = create<ServerPostState>()((set) => ({
  progress: null,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const { progress } = await fetchServerPostProgress()
      set({ progress, loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'помилка мережі' })
    }
  },
  reset: () => set({ progress: null, error: null }),
}))

export interface PostStatsSource {
  readonly progress: PostProgress
  /** Дані з сервера — тобто зведені з усіх пристроїв. */
  readonly fromServer: boolean
  /** Скільки подій ще не доїхало. */
  readonly pending: number
  readonly error: string | null
}

export function usePostStatsSource(): PostStatsSource {
  const session = useAuthStore((s) => s.session)
  const local = useProgressStore((s) => s.post)
  const server = useServerPostStats((s) => s.progress)
  const error = useServerPostStats((s) => s.error)
  const refresh = useServerPostStats((s) => s.refresh)
  const reset = useServerPostStats((s) => s.reset)
  const queued = usePostSyncStore((s) => s.queued)
  const pending = usePostSyncStore((s) => s.pending)

  useEffect(() => {
    if (session) void refresh()
    else reset()
  }, [session, refresh, reset])

  const progress = useMemo(
    () => (server ? mergePostProgress(server, queued) : local),
    [server, local, queued],
  )

  return { progress, fromServer: server !== null, pending, error }
}
```

- [ ] **Step 8: Підключити до екрана**

У `web/src/pages/TrainPost.tsx` замінити
```ts
const post = useProgressStore((s) => s.post)
```
на
```ts
const post = usePostStatsSource().progress
```
з імпортом `import { usePostStatsSource } from '../store/postStatsSource'` і прибрати тепер невживаний імпорт `useProgressStore`.

- [ ] **Step 9: Перевірити**

Run: `npm test && npm run typecheck && npm run lint`
Expected: зелено. Тест `TrainPost.test` далі проходить: без сесії джерело віддає локальний прогрес.

```bash
npm run test:db
```
Expected: зелено.

- [ ] **Step 10: Коміт**

```bash
git add supabase/migrations web/src/api/database.types.ts web/src/api/serverPostProgress.ts web/src/store/mergePostProgress.ts web/src/store/mergePostProgress.test.ts web/src/store/postStatsSource.ts web/src/pages/TrainPost.tsx && git commit -m "post-3: серверні зрізи постфлопу і джерело цифр"
```

---

### Task 10: Скидання, видалення і закриття фази

**Files:**
- Create: `supabase/migrations/<timestamp>_postflop_reset.sql`
- Modify: `web/src/store/resetProgress.ts`
- Modify: `supabase/tests/postflop.test.ts`
- Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Розширити видалення на новий журнал**

```bash
npm run db:new postflop_reset
```

Вміст:

```sql
-- «Видалити все назавжди» має стирати обидва журнали.
--
-- reset_progress() чіпати не треба: він ставить мітку часу, а всі постфлоп-зрізи
-- вже читають її через current_reset_at().

create or replace function public.delete_all_progress()
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  removed_pre  bigint;
  removed_post bigint;
begin
  delete from public.attempts where user_id = (select auth.uid());
  get diagnostics removed_pre = row_count;

  delete from public.postflop_attempts where user_id = (select auth.uid());
  get diagnostics removed_post = row_count;

  update public.user_settings
     set reset_at = null, updated_at = now()
   where user_id = (select auth.uid());

  return removed_pre + removed_post;
end
$$;

comment on function public.delete_all_progress is
  'Видаляє всі спроби користувача — префлоп і постфлоп — і знімає мітку скидання.';
```

- [ ] **Step 2: Дописати тест видалення**

У кінець `supabase/tests/postflop.test.ts`:

```ts
describe('delete_all_progress', () => {
  it('стирає постфлоп-журнал і рахує його рядки', async () => {
    await alice.client.from('postflop_attempts').delete().gte('id', 0)
    await alice.client.from('postflop_attempts').insert([decision(), decision()])

    const { data, error } = await alice.client.rpc('delete_all_progress')
    expect(error).toBeNull()
    expect(Number(data ?? 0)).toBeGreaterThanOrEqual(2)

    const { data: left } = await alice.client.from('postflop_attempts').select('id')
    expect(left ?? []).toHaveLength(0)
  })

  it('чужі рядки не зникають', async () => {
    await bob.client.from('postflop_attempts').insert(decision())
    await alice.client.rpc('delete_all_progress')
    const { data } = await bob.client.from('postflop_attempts').select('id')
    expect((data ?? []).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Розширити локальне скидання**

У `web/src/store/resetProgress.ts`, у `clearLocal`:

```ts
const clearLocal = (): void => {
  useProgressStore.getState().reset()
  queue.clear()
  postQueue.clear()
  useSyncStore.setState({ pending: 0, queued: [] })
  usePostSyncStore.setState({ pending: 0, queued: [] })
  useSessionStore.getState().resetSession()
  usePostSessionStore.getState().deal()
}
```

Імпорти: `import { postQueue, usePostSyncStore } from '../api/postSync'`, `import { usePostSessionStore } from './postSessionStore'`.

У `resetProgress()` і `deleteProgress()` перед серверною частиною додати флаш постфлопної черги поряд із наявним `flushNow()`:
```ts
  await flushPostQueue()
```
з імпортом `import { flushPostQueue } from '../api/postSync'`.

Після серверної частини `resetProgress()` — оновити й постфлоп-джерело:
```ts
  void useServerPostStats.getState().refresh()
```
з імпортом `import { useServerPostStats } from './postStatsSource'`.

- [ ] **Step 4: Перевірити все**

Run (з `web/`): `npm test && npm run typecheck && npm run lint && npm run build`
Expected: усе зелене.

Run (з кореня, за піднятого `npm run db:start`): `npm run test:db`
Expected: усі файли зелені.

- [ ] **Step 5: Перевірити наскрізний сценарій у браузері**

1. `npm run dev`, увійти через Google.
2. Зіграти 5–6 постфлоп-рук.
3. У Supabase Studio (`http://localhost:54323`) виконати `select count(*) from postflop_attempts;` — число має відповідати кількості зроблених рішень (не рук!).
4. Вимкнути мережу в DevTools, зіграти ще 3 рішення, увімкнути мережу, зачекати до 30 с — рядки доїжджають без дублів.
5. Перезавантажити сторінку — цифри в смужці не зменшились.

- [ ] **Step 6: Оновити документацію**

У `CLAUDE.md`, у розділ «Архітектурні правила», пункт 1, після речення про лічильники додати:

```markdown
   Постфлоп живе в окремій таблиці `postflop_attempts` за тим самим принципом:
   один рядок — одне рішення героя, `episode_id` лише групує рішення роздачі.
```

У `README.md` — рядок про Етап 2 у переліку можливостей: «Етап 2 (постфлоп): роздача грається до шоудауну, вердикт після кожного рішення, прогрес зберігається в базі».

- [ ] **Step 7: Коміт**

```bash
git add supabase/migrations supabase/tests/postflop.test.ts web/src/store/resetProgress.ts web/src/api/database.types.ts CLAUDE.md README.md && git commit -m "post-3: скидання і видалення охоплюють постфлоп"
```

---

## Що лишається після цього плану

| Фаза | Зміст |
|---|---|
| post-4 | Лінія колера: матриця §5.4 спеки, семплінг vsraise-епізодів, контексти facing в UI |
| post-5 | Вкладка «Схема рішень» з матрицями, постфлоп-патерни в Розборі, перегляд роздачі за `episode_id` |
| пізніше | Еквіті в поясненнях (`equity.ts`), drill по постфлоп-помилках, 3бет-поти, мультивей-захист |

Кожна отримує власний план після того, як post-3 задеплоєно і прогрес справді лягає в базу.

