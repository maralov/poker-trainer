/**
 * Ворота між етапами. Порт gateStatus з poker-trainer.html.
 *
 * Важливо: умови рахуються по ковзному вікну останніх 150 рук — це поточна форма,
 * а не вся історія. Невдалий старт нічого не блокує назавжди.
 */

import type { RecentEntry } from './progress'
import type { Position, Scenario } from './types'

export const GATE = {
  /** Скільки рук треба зіграти всього. */
  hands: 100,
  /** Поріг точності, %. */
  acc: 80,
  /** Мінімум рук у вікні, щоб сценарій рахувався. */
  scenMin: 15,
  /** Мінімум рук у вікні, щоб позиція рахувалась. */
  posMin: 8,
  /** Скільки позицій мають набрати норму. */
  posCount: 8,
  /** Розмір ковзного вікна. */
  window: 150,
} as const

export interface SliceStat<K extends string = string> {
  readonly k: K
  /** Точність, %. */
  readonly p: number
  /** Скільки рук у вікні. */
  readonly t: number
}

export interface GateStatus {
  readonly c1: boolean
  readonly c2: boolean
  readonly c3: boolean
  readonly c4: boolean
  readonly ok: boolean
  readonly total: number
  /** Точність у вікні, %. */
  readonly acc: number
  readonly scen: readonly SliceStat<Scenario>[]
  readonly pos: readonly SliceStat<Position>[]
  /** Скільки рук реально потрапило у вікно. */
  readonly win: number
}

function aggregate<K extends string>(entries: readonly RecentEntry[], key: 's' | 'p'): Map<K, { t: number; c: number }> {
  const out = new Map<K, { t: number; c: number }>()
  for (const e of entries) {
    const k = e[key] as K
    const d = out.get(k) ?? { t: 0, c: 0 }
    d.t++
    if (e.ok) d.c++
    out.set(k, d)
  }
  return out
}

export function gateStatus(recent: readonly RecentEntry[], total: number): GateStatus {
  const w = recent.slice(-GATE.window)
  const acc = w.length ? (w.filter((e) => e.ok).length / w.length) * 100 : 0

  const scen = [...aggregate<Scenario>(w, 's')]
    .filter(([, d]) => d.t >= GATE.scenMin)
    .map(([k, d]) => ({ k, p: (d.c / d.t) * 100, t: d.t }))
  const pos = [...aggregate<Position>(w, 'p')]
    .filter(([, d]) => d.t >= GATE.posMin)
    .map(([k, d]) => ({ k, p: (d.c / d.t) * 100, t: d.t }))

  const c1 = total >= GATE.hands
  const c2 = w.length >= GATE.hands && acc >= GATE.acc
  const c3 = w.length >= GATE.hands && scen.length > 0 && scen.every((s) => s.p >= GATE.acc)
  const c4 =
    w.length >= GATE.hands && pos.length >= GATE.posCount && pos.every((s) => s.p >= GATE.acc)

  return { c1, c2, c3, c4, ok: c1 && c2 && c3 && c4, total, acc, scen, pos, win: w.length }
}
