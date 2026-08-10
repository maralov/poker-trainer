/**
 * Drill — вузьке тренування по накопичених помилках («ліках»).
 * Порт розділу DRILL з poker-trainer.html.
 *
 * Логіка: 70% рук беруться з пулу помилок (зважено за частотою), 30% —
 * контрольні руки з тих самих позицій. Рука виходить з пулу після 5 правильних
 * поспіль. Норма виходу з drill: 90% на вікні з 50 відповідей.
 */

import { pick } from './cards'
import { isHand } from './ranges'
import type { PreProgress } from './progress'
import { buildSpot } from './spots'
import { ACTION_ORDER, type Hand, type Position, type Scenario, type Rng, type Spot } from './types'

export const DRILL = {
  /** Частка рук із пулу помилок. */
  poolShare: 0.7,
  /** Скільки правильних поспіль закривають руку. */
  retire: 5,
  /** Вікно для підрахунку точності drill. */
  window: 50,
  /** Точність, при якій норму виконано, %. */
  exitAcc: 90,
  /** Менший пул не має сенсу тренувати. */
  minKeys: 3,
} as const

export interface PoolItem {
  readonly pos: Position
  readonly hand: Hand
  /** Скільки разів помилявся на цій руці з цієї позиції. */
  readonly n: number
}

export const drillKey = (scen: Scenario, pos: Position, hand: Hand): string =>
  `${scen}|${pos}|${hand}`

const POSITION_SET: ReadonlySet<string> = new Set(ACTION_ORDER)

/**
 * Чи можна побудувати спот цього сценарію з цієї позиції.
 * RFI з BB не існує — такий запис у журналі означав би пошкоджені дані,
 * і без цієї перевірки drill упав би на побудові споту.
 */
function positionFits(scen: Scenario, pos: Position): boolean {
  if (scen === 'rfi') return pos !== 'BB'
  return true
}

/** Пул помилок сценарію, крім тих, що вже закриті 5 правильними поспіль. */
export function drillPool(progress: PreProgress, scen: Scenario): PoolItem[] {
  const streaks = progress.drill.streaks
  const agg = new Map<string, number>()

  for (const e of progress.log) {
    if (e.s !== scen) continue
    if (!POSITION_SET.has(e.p) || !isHand(e.h)) continue
    if (!positionFits(scen, e.p)) continue
    const k = `${e.p}|${e.h}`
    agg.set(k, (agg.get(k) ?? 0) + 1)
  }

  return [...agg]
    .filter(([k]) => (streaks[`${scen}|${k}`] ?? 0) < DRILL.retire)
    .map(([k, n]) => {
      const [pos, hand] = k.split('|')
      return { pos: pos as Position, hand: hand as Hand, n }
    })
    .sort((a, b) => b.n - a.n)
}

export interface DrillStats {
  /** Скільки відповідей у вікні. */
  readonly n: number
  /** Точність у вікні, %. */
  readonly acc: number
  /** Норму виконано: вікно заповнене і точність не нижча за поріг. */
  readonly done: boolean
}

export function drillStats(progress: PreProgress, scen: Scenario): DrillStats {
  const w = (progress.drill.recent[scen] ?? []).slice(-DRILL.window)
  const acc = w.length ? Math.round((w.filter((x) => x).length / w.length) * 100) : 0
  return { n: w.length, acc, done: w.length >= DRILL.window && acc >= DRILL.exitAcc }
}

/** Чи достатньо великий пул, щоб запускати drill. */
export const canDrill = (progress: PreProgress, scen: Scenario): boolean =>
  drillPool(progress, scen).length >= DRILL.minKeys

/**
 * Наступний спот у drill-режимі. `null` — пул порожній, drill треба вимкнути.
 */
export function drillSpot(
  progress: PreProgress,
  scen: Scenario,
  rng: Rng = Math.random,
): Spot | null {
  const pool = drillPool(progress, scen)
  if (!pool.length) return null

  if (rng() < DRILL.poolShare) {
    // Зважений вибір: чим частіше помилявся, тим більше копій у мішку.
    const bag: PoolItem[] = []
    for (const it of pool) for (let i = 0; i < it.n; i++) bag.push(it)
    const it = pick(bag, rng)
    return buildSpot({ force: { scen, heroPos: it.pos, hand: it.hand }, rng })
  }

  const positions = [...new Set(pool.map((x) => x.pos))]
  const pos = pick(positions, rng)
  const ban = pool.filter((x) => x.pos === pos).map((x) => x.hand)
  return buildSpot({ force: { scen, heroPos: pos, hand: null, ban }, rng })
}
