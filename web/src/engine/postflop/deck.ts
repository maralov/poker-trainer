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
