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
