import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { VILLAIN, villainBetFraction, villainDonk, villainOpen, villainVsBet } from './villain'
import type { PostCategory, Street } from './types'

/** Частка вибраної дії на великій вибірці — так перевіряються частоти. */
function share(n: number, run: (rng: () => number) => string, want: string): number {
  const rng = mulberry32(42)
  let hits = 0
  for (let i = 0; i < n; i++) if (run(rng) === want) hits++
  return hits / n
}

describe('villainOpen', () => {
  it('сильна рука ставить частіше за порожню на кожній вулиці', () => {
    for (const street of ['flop', 'turn', 'river'] as Street[]) {
      const strong = share(4000, (r) => villainOpen('STRONG_MADE', street, r), 'bet')
      const air = share(4000, (r) => villainOpen('AIR', street, r), 'bet')
      expect(strong, `${street}: сила`).toBeGreaterThan(air + 0.4)
    }
  })

  it('частоти збігаються з таблицею профілю ±0.03', () => {
    const cases: [PostCategory, Street][] = [
      ['STRONG_MADE', 'flop'],
      ['MEDIUM', 'flop'],
      ['DRAW', 'flop'],
      ['AIR', 'turn'],
      ['STRONG_PAIR', 'river'],
    ]
    for (const [cat, street] of cases) {
      const got = share(6000, (r) => villainOpen(cat, street, r), 'bet')
      const want = VILLAIN.bet[street][cat]
      expect(Math.abs(got - want), `${cat}/${street}: ${got} vs ${want}`).toBeLessThan(0.03)
    }
  })

  it('обидва підтипи STRONG поводяться однаково', () => {
    const made = share(4000, (r) => villainOpen('STRONG_MADE', 'flop', r), 'bet')
    const pair = share(4000, (r) => villainOpen('STRONG_PAIR', 'flop', r), 'bet')
    expect(Math.abs(made - pair)).toBeLessThan(0.03)
  })
})

describe('villainDonk', () => {
  it('частоти донку збігаються зі спекою: сила .30, дро .20, решта 0', () => {
    const strong = share(6000, (r) => villainDonk('STRONG_MADE', 'flop', r), 'bet')
    const draw = share(6000, (r) => villainDonk('DRAW', 'flop', r), 'bet')
    const medium = share(4000, (r) => villainDonk('MEDIUM', 'flop', r), 'bet')
    const weak = share(4000, (r) => villainDonk('WEAK', 'flop', r), 'bet')
    const weakdraw = share(4000, (r) => villainDonk('WEAKDRAW', 'flop', r), 'bet')
    const air = share(4000, (r) => villainDonk('AIR', 'flop', r), 'bet')

    expect(Math.abs(strong - 0.3)).toBeLessThan(0.03)
    expect(Math.abs(draw - 0.2)).toBeLessThan(0.03)
    expect(medium).toBe(0)
    expect(weak).toBe(0)
    expect(weakdraw).toBe(0)
    expect(air).toBe(0)
  })

  it('на рівері дро-категорії не донкають, навіть якщо їх передати', () => {
    // На рівері дро природно не існують, але функція має лишатись безпечною
    // до захисного виклику: не повинна почати «донкати повітрям».
    const draw = share(3000, (r) => villainDonk('DRAW', 'river', r), 'bet')
    const weakdraw = share(3000, (r) => villainDonk('WEAKDRAW', 'river', r), 'bet')
    expect(draw).toBe(0)
    expect(weakdraw).toBe(0)
  })
})

describe('villainVsBet', () => {
  it('сила ніколи не фолдить', () => {
    for (const big of [false, true]) {
      expect(share(3000, (r) => villainVsBet('STRONG_MADE', 'flop', big, false, r), 'fold')).toBe(0)
    }
  })

  it('сила ніколи не фолдить і на рівері — там рейз фіксований (.30), калл добирає решту', () => {
    for (const big of [false, true]) {
      expect(share(3000, (r) => villainVsBet('STRONG_MADE', 'river', big, false, r), 'fold')).toBe(0)
    }
  })

  it('порожня рука майже завжди фолдить, і частіше проти великої ставки', () => {
    const small = share(4000, (r) => villainVsBet('AIR', 'flop', false, false, r), 'fold')
    const big = share(4000, (r) => villainVsBet('AIR', 'flop', true, false, r), 'fold')
    expect(small).toBeGreaterThan(0.8)
    expect(big).toBeGreaterThan(small)
  })

  it('середня рука коллить забагато — профіль станції', () => {
    expect(share(4000, (r) => villainVsBet('MEDIUM', 'flop', false, false, r), 'call')).toBeGreaterThan(0.85)
  })

  it('рейз майже завжди означає силу', () => {
    const strong = share(4000, (r) => villainVsBet('STRONG_MADE', 'flop', false, false, r), 'raise')
    const air = share(4000, (r) => villainVsBet('AIR', 'flop', false, false, r), 'raise')
    expect(strong).toBeGreaterThan(0.4)
    expect(air).toBeLessThan(0.05)
  })

  it('на рівері сила рейзить рівно .30 незалежно від сайзу ставки', () => {
    const small = share(6000, (r) => villainVsBet('STRONG_MADE', 'river', false, false, r), 'raise')
    const big = share(6000, (r) => villainVsBet('STRONG_MADE', 'river', true, false, r), 'raise')
    expect(Math.abs(small - 0.3)).toBeLessThan(0.03)
    expect(Math.abs(big - 0.3)).toBeLessThan(0.03)
  })

  it('після рейзу на вулиці рейзів більше не буває — cap згортає їх у колл', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 500; i++) {
      expect(villainVsBet('STRONG_MADE', 'flop', false, true, rng)).not.toBe('raise')
    }
  })

  it('cap не перетворює силу на фолд: рейзова частка стає коллом', () => {
    const rng = mulberry32(11)
    for (let i = 0; i < 500; i++) {
      expect(villainVsBet('STRONG_MADE', 'flop', true, true, rng)).not.toBe('fold')
    }
  })
})

describe('villainBetFraction', () => {
  it('сила і дро ставлять 66%, решта 33% — сайз корелює з рукою', () => {
    expect(villainBetFraction('STRONG_MADE')).toBe(0.66)
    expect(villainBetFraction('DRAW')).toBe(0.66)
    expect(villainBetFraction('MEDIUM')).toBe(0.33)
    expect(villainBetFraction('AIR')).toBe(0.33)
  })

  it('слабкі категорії теж ставлять малим сайзом', () => {
    expect(villainBetFraction('WEAK')).toBe(0.33)
    expect(villainBetFraction('WEAKDRAW')).toBe(0.33)
  })
})
