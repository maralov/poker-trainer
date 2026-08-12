import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../test/rng'
import { ALL_HANDS, dealFromHand, handOf } from './cards'

describe('handOf', () => {
  it('обертає dealFromHand: рука → конкретні карти → та сама канонічна рука', () => {
    for (let i = 0; i < ALL_HANDS.length; i++) {
      const h = ALL_HANDS[i]
      if (h === undefined) continue
      const cards = dealFromHand(h, mulberry32(i + 1))
      expect(handOf(cards), h).toBe(h)
    }
  })

  it('порядок карт на вході не має значення', () => {
    const cards = dealFromHand('AKs', mulberry32(1))
    const [a, b] = cards
    if (!a || !b) throw new Error('dealFromHand не дав дві карти')
    expect(handOf([a, b])).toBe(handOf([b, a]))
  })

  it('кидає, якщо карт не дві', () => {
    const cards = dealFromHand('AKs', mulberry32(1))
    expect(() => handOf([])).toThrow()
    expect(() => handOf(cards.slice(0, 1))).toThrow()
  })
})
