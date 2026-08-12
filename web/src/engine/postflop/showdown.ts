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

  // Флеш і каре несумісні в 7 картах (масть з 5+ картами лишає для каре
  // максимум 4 карти тієї самої масті), так само як флеш і фул-хаус — тому
  // ранній return тут безпечний і не ховає вищу комбінацію.
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
