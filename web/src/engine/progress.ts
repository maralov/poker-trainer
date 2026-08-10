/**
 * Локальний прогрес префлопу і чистий редюсер відповіді.
 *
 * Форма стану успадкована від poker-trainer.html — це дозволяє імпортувати
 * старий localStorage без втрат. Серверна модель інша (сирі події, див. PLAN.md):
 * ці локальні агрегати — офлайн-фолбек, поки синк не догнав.
 */

import type { Action, Hand, Position, Scenario } from './types'

/** Запис помилки. Ключі однолітерні — так було в референсі, і так їх пише v3. */
export interface MistakeEntry {
  /** scenario */
  readonly s: Scenario
  /** position */
  readonly p: Position
  /** hand */
  readonly h: Hand
  /** chosen */
  readonly ch: Action
  /** correct */
  readonly co: Action
  /** timestamp (ms) */
  readonly t: number
}

/** Компактний запис для ковзного вікна воріт. */
export interface RecentEntry {
  readonly s: Scenario
  readonly p: Position
  readonly ok: 0 | 1
}

export interface Tally {
  t: number
  c: number
}

export interface DrillState {
  /** Ключ `scen|pos|hand` → скільки правильних поспіль. */
  streaks: Record<string, number>
  /** Сценарій → останні відповіді в drill (1/0). */
  recent: Record<string, (0 | 1)[]>
}

export interface PreProgress {
  total: number
  correct: number
  best: number
  byPos: Record<string, Tally>
  byScenPos: Record<string, Record<string, Tally>>
  byScen: Record<string, Tally>
  /** Ключ `scen|pos|hand` → вага помилки (+2 за помилку, −1 за правильну). */
  missed: Record<string, number>
  log: MistakeEntry[]
  recent: RecentEntry[]
  drill: DrillState
}

export const LOG_LIMIT = 500
export const RECENT_LIMIT = 400
export const DRILL_RECENT_LIMIT = 200

export const emptyPreProgress = (): PreProgress => ({
  total: 0,
  correct: 0,
  best: 0,
  byPos: {},
  byScenPos: {},
  byScen: {},
  missed: {},
  log: [],
  recent: [],
  drill: { streaks: {}, recent: {} },
})

export const missKey = (scen: Scenario, pos: Position, hand: Hand): string =>
  `${scen}|${pos}|${hand}`

const bump = (table: Record<string, Tally>, key: string, ok: boolean): void => {
  const d = table[key] ?? { t: 0, c: 0 }
  d.t++
  if (ok) d.c++
  table[key] = d
}

export interface AnswerInput {
  readonly scen: Scenario
  readonly heroPos: Position
  readonly hand: Hand
  readonly chosen: Action
  readonly correct: Action
  readonly drill: boolean
  readonly isControl: boolean
  /** Час відповіді (ms). Інжектується, щоб тести були детермінованими. */
  readonly at?: number
}

export interface AnswerResult {
  readonly progress: PreProgress
  readonly ok: boolean
  readonly streak: number
  /** Серія правильних по цій конкретній руці в drill — для підпису «лік · 3/5». */
  readonly handStreak: number
}

/**
 * Записує відповідь у прогрес. Мутує переданий об'єкт — так само, як референс:
 * zustand-стор клонує стан перед викликом.
 */
export function recordAnswer(
  progress: PreProgress,
  streakBefore: number,
  input: AnswerInput,
): AnswerResult {
  const { scen, heroPos, hand, chosen, correct, drill, isControl } = input
  const ok = chosen === correct
  const key = missKey(scen, heroPos, hand)

  progress.total++
  if (ok) progress.correct++

  bump(progress.byPos, heroPos, ok)
  bump(progress.byScen, scen, ok)

  // Окремий зріз: позиція В МЕЖАХ сценарію. Саме він показується в «Розборі»,
  // бо позиції не мають текти між сценаріями.
  const scenPos = progress.byScenPos[scen] ?? {}
  bump(scenPos, heroPos, ok)
  progress.byScenPos[scen] = scenPos

  progress.missed[key] = Math.max(0, (progress.missed[key] ?? 0) + (ok ? -1 : 2))
  if (progress.missed[key] === 0) delete progress.missed[key]

  if (!ok) {
    progress.log.push({
      s: scen,
      p: heroPos,
      h: hand,
      ch: chosen,
      co: correct,
      t: input.at ?? Date.now(),
    })
    if (progress.log.length > LOG_LIMIT) {
      progress.log.splice(0, progress.log.length - LOG_LIMIT)
    }
  }

  // Серія по конкретній руці: рахується лише на «ліках», не на контролях.
  if (ok) {
    if (drill && !isControl) {
      progress.drill.streaks[key] = (progress.drill.streaks[key] ?? 0) + 1
    }
  } else {
    progress.drill.streaks[key] = 0
  }

  if (drill) {
    const r = progress.drill.recent[scen] ?? []
    r.push(ok ? 1 : 0)
    if (r.length > DRILL_RECENT_LIMIT) r.splice(0, r.length - DRILL_RECENT_LIMIT)
    progress.drill.recent[scen] = r
  }

  progress.recent.push({ s: scen, p: heroPos, ok: ok ? 1 : 0 })
  if (progress.recent.length > RECENT_LIMIT) {
    progress.recent.splice(0, progress.recent.length - RECENT_LIMIT)
  }

  const streak = ok ? streakBefore + 1 : 0
  progress.best = Math.max(progress.best, streak)

  return { progress, ok, streak, handStreak: progress.drill.streaks[key] ?? 0 }
}
