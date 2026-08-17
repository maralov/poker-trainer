import { describe, expect, it } from 'vitest'

import refPostflop from '../__fixtures__/ref-postflop.json'
import { decideBet } from './matrixBet'
import { POST_CATEGORIES, type BoardEvents, type PostCategory, type Texture } from './types'

interface RefCase {
  cat: string
  tex: string
  nOpp: number
  ip: boolean
  decide: string
}
const fixtures = refPostflop as unknown as RefCase[]

const QUIET: BoardEvents = { flushClosed: false, boardPaired: false, overcard: false }

const ctx = (over: Partial<Parameters<typeof decideBet>[0]> = {}): Parameters<typeof decideBet>[0] => ({
  street: 'flop',
  line: 'aggressor',
  cat: 'AIR',
  texture: 'DRY',
  events: QUIET,
  nOpps: 1,
  ip: true,
  delayed: false,
  madeFlush: false,
  ...over,
})

describe('флоп · еквівалентність decide() з референсу', () => {
  it('усі кейси еталона дають ту саму дію', () => {
    // Референс не знає розщеплення STRONG, тому обидва підтипи мають вести себе
    // однаково — перевіряємо кожен кейс двічі.
    fixtures.forEach((ref, i) => {
      const cats: PostCategory[] =
        ref.cat === 'STRONG' ? ['STRONG_MADE', 'STRONG_PAIR'] : [ref.cat as PostCategory]
      for (const cat of cats) {
        const got = decideBet(
          ctx({ cat, texture: ref.tex as Texture, nOpps: ref.nOpp, ip: ref.ip }),
        )
        expect(got.action, `кейс ${i} · ${cat}`).toBe(ref.decide)
        expect(got.why.length, `кейс ${i}: пояснення не має бути порожнім`).toBeGreaterThan(20)
      }
    })
  })
})

describe('терн · §5.2', () => {
  it('сильна рука ставить великим сайзом', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'STRONG_MADE' })).action).toBe('b66')
  })

  it('на закритій масті сильна рука без флеша сайзить менше', () => {
    const events = { ...QUIET, flushClosed: true }
    expect(decideBet(ctx({ street: 'turn', cat: 'STRONG_MADE', events })).action).toBe('b33')
    expect(
      decideBet(ctx({ street: 'turn', cat: 'STRONG_MADE', events, madeFlush: true })).action,
    ).toBe('b66')
  })

  it('дро барелить лише в позиції', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'DRAW', ip: true })).action).toBe('b66')
    expect(decideBet(ctx({ street: 'turn', cat: 'DRAW', ip: false })).action).toBe('check')
  })

  it('середня рука ставить тонко лише після чек-чеку без оверкарти', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'MEDIUM', delayed: true })).action).toBe('b33')
    expect(decideBet(ctx({ street: 'turn', cat: 'MEDIUM', delayed: false })).action).toBe('check')
    expect(
      decideBet(
        ctx({ street: 'turn', cat: 'MEDIUM', delayed: true, events: { ...QUIET, overcard: true } }),
      ).action,
    ).toBe('check')
  })

  it('порожня рука барелить лише як delayed c-bet у позиції', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'AIR', delayed: true, ip: true })).action).toBe('b33')
    expect(decideBet(ctx({ street: 'turn', cat: 'AIR', delayed: true, ip: false })).action).toBe('check')
    expect(decideBet(ctx({ street: 'turn', cat: 'AIR', delayed: false, ip: true })).action).toBe('check')
  })

  it('слабка пара і слабке дро мовчать', () => {
    expect(decideBet(ctx({ street: 'turn', cat: 'WEAK' })).action).toBe('check')
    expect(decideBet(ctx({ street: 'turn', cat: 'WEAKDRAW' })).action).toBe('check')
  })
})

describe('рівер · §5.3', () => {
  it('сильна рука забирає валью', () => {
    expect(decideBet(ctx({ street: 'river', cat: 'STRONG_MADE' })).action).toBe('b66')
    expect(decideBet(ctx({ street: 'river', cat: 'STRONG_PAIR' })).action).toBe('b66')
  })

  it('рівер не блефується ніколи — навіть у позиції на сухій дошці', () => {
    expect(decideBet(ctx({ street: 'river', cat: 'AIR', ip: true, delayed: true })).action).toBe('check')
  })

  it('середня і слабка руки йдуть на дешевий шоудаун', () => {
    expect(decideBet(ctx({ street: 'river', cat: 'MEDIUM' })).action).toBe('check')
    expect(decideBet(ctx({ street: 'river', cat: 'WEAK' })).action).toBe('check')
  })
})

describe('мультивей', () => {
  it('на всіх вулицях ставить лише сила, дро — лише в позиції на флопі й терні', () => {
    for (const street of ['flop', 'turn'] as const) {
      expect(decideBet(ctx({ street, cat: 'STRONG_MADE', nOpps: 3 })).action).toBe('b66')
      expect(decideBet(ctx({ street, cat: 'DRAW', nOpps: 3, ip: true })).action).toBe('b66')
      expect(decideBet(ctx({ street, cat: 'DRAW', nOpps: 3, ip: false })).action).toBe('check')
      expect(decideBet(ctx({ street, cat: 'AIR', nOpps: 3, ip: true })).action).toBe('check')
      expect(decideBet(ctx({ street, cat: 'MEDIUM', nOpps: 2, ip: true })).action).toBe('check')
    }
    expect(decideBet(ctx({ street: 'river', cat: 'STRONG_MADE', nOpps: 2 })).action).toBe('b66')
    expect(decideBet(ctx({ street: 'river', cat: 'MEDIUM', nOpps: 2 })).action).toBe('check')
  })
})

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
