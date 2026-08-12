/**
 * Примітиви над картами і руками. Порт з poker-trainer.html, розділ
 * «СПІЛЬНІ ПРИМІТИВИ», 1:1 за поведінкою.
 */

import { RANKS, type Card, type Hand, type Rank, type Rng, type Suit } from './types'

export const VAL: Readonly<Record<Rank, number>> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
}

export const SUITS: readonly Suit[] = [
  { g: '♠', red: 0 },
  { g: '♥', red: 1 },
  { g: '♦', red: 1 },
  { g: '♣', red: 0 },
]

/** Індекс рангу; -1 якщо символ не ранг (як RANKS.indexOf у референсі). */
export const RI = (r: string): number => RANKS.indexOf(r as Rank)

/** Ранг за індексом. Кидає на виході за межі — це помилка програміста, не даних. */
export function rankAt(i: number): Rank {
  const r = RANKS[i]
  if (r === undefined) throw new RangeError(`rank index out of range: ${i}`)
  return r
}

/** Скільки комбінацій дає рука: пара — 6, у масті — 4, офсьют — 12. */
export const combos = (h: Hand): number => (h.length === 2 ? 6 : h.endsWith('s') ? 4 : 12)

/** Рука в комірці сітки 13×13: над діагоналлю — suited, під нею — offsuit. */
export const handAt = (i: number, j: number): Hand =>
  i === j
    ? `${rankAt(i)}${rankAt(i)}`
    : j > i
      ? `${rankAt(i)}${rankAt(j)}s`
      : `${rankAt(j)}${rankAt(i)}o`

/** Усі 169 рук у порядку обходу сітки. */
export const ALL_HANDS: readonly Hand[] = (() => {
  const out: Hand[] = []
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) out.push(handAt(i, j))
  return out
})()

/** Частка комбінацій у наборі, у відсотках від 1326. */
export const pct = (set: ReadonlySet<Hand>): number =>
  ([...set].reduce((s, h) => s + combos(h), 0) / 1326) * 100

export const union = (...sets: ReadonlySet<Hand>[]): Set<Hand> =>
  new Set(sets.flatMap((s) => [...s]))

export const minus = (a: ReadonlySet<Hand>, b: ReadonlySet<Hand>): Set<Hand> =>
  new Set([...a].filter((h) => !b.has(h)))

/**
 * Мішок рук, зважений за кількістю комбінацій (combos/2 копій кожної).
 * Дає реалістичний розподіл роздач: офсьютних рук випадає більше за suited.
 */
export const WEIGHTED: readonly Hand[] = (() => {
  const out: Hand[] = []
  for (const h of ALL_HANDS) {
    const n = combos(h) / 2
    for (let k = 0; k < n; k++) out.push(h)
  }
  return out
})()

export function pick<T>(a: readonly T[], rng: Rng = Math.random): T {
  const item = a[Math.floor(rng() * a.length)]
  if (item === undefined) throw new RangeError('pick() from empty array')
  return item
}

/**
 * Роздає конкретні карти під канонічну руку.
 * Пари й офсьюти — різні масті, suited — однакова.
 */
export function dealFromHand(hand: Hand, rng: Rng = Math.random): Card[] {
  const a = rankAt(RI(hand[0] ?? ''))
  const b = rankAt(RI(hand[1] ?? ''))
  const mk = (rk: Rank, si: number): Card => {
    const suit = SUITS[si]
    if (suit === undefined) throw new RangeError(`suit index out of range: ${si}`)
    return { rk, v: VAL[rk], s: si, g: suit.g, red: suit.red }
  }
  if (hand.length === 2 || hand.endsWith('o')) {
    const i = Math.floor(rng() * 4)
    let j = Math.floor(rng() * 4)
    if (j === i) j = (j + 1 + Math.floor(rng() * 3)) % 4
    return [mk(a, i), mk(b, j)]
  }
  const i = Math.floor(rng() * 4)
  return [mk(a, i), mk(b, i)]
}

/**
 * Обернена до dealFromHand: дві конкретні карти → канонічна рука ('AKs',
 * 'AKo', '77'). Раніше жила приватно в build.test.ts — постфлопу вона
 * потрібна публічно, щоб журнал писав ту саму канонічну руку, яку тренує
 * префлоп (`hand` у постфлоп-таблиці, спека §8).
 */
export function handOf(cards: readonly Card[]): Hand {
  const a = cards[0]
  const b = cards[1]
  if (cards.length !== 2 || a === undefined || b === undefined) {
    throw new RangeError(`handOf: потрібно рівно дві карти, отримано ${cards.length}`)
  }
  const [hi, lo] = RI(a.rk) <= RI(b.rk) ? [a, b] : [b, a]
  if (hi.rk === lo.rk) return `${hi.rk}${lo.rk}`
  return `${hi.rk}${lo.rk}${hi.s === lo.s ? 's' : 'o'}`
}
