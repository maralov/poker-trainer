/**
 * Діапазони звіряються з еталоном, знятим з poker-trainer.html
 * (див. __fixtures__/README.md). Це перевірка порту проти оригіналу,
 * а не проти чисел, вписаних з голови.
 */

import { describe, expect, it } from 'vitest'

import truth from './__fixtures__/ref-truth.json'
import { ALL_HANDS, WEIGHTED, combos, pct, union } from './cards'
import {
  ISO,
  RFI,
  SCENARIOS,
  TEMPTING,
  VS_3BET,
  VS_RAISE,
  WEAK_O,
  isHand,
  parseToken,
} from './ranges'
import type { HeroContext, RaiserBucket } from './ranges'

const sorted = (s: ReadonlySet<string>): string[] => [...s].sort()

describe('parseToken', () => {
  it('розгортає всі формати токенів так само, як референс', () => {
    for (const [token, expected] of Object.entries(truth.tokens)) {
      expect(parseToken(token), `токен ${token}`).toEqual(expected)
    }
  })

  it('66+ — усі пари від заданої і вище', () => {
    expect(parseToken('66+')).toEqual(['66', '77', '88', '99', 'TT', 'JJ', 'QQ', 'KK', 'AA'])
  })

  it('діапазон пар не залежить від порядку кінців', () => {
    expect(parseToken('22-JJ')).toEqual(parseToken('JJ-22'))
  })

  it('ATs+ доходить до AKs і не включає AAs', () => {
    expect(parseToken('ATs+')).toEqual(['ATs', 'AJs', 'AQs', 'AKs'])
  })

  it('A4s-A5s бере старшу карту з першої руки', () => {
    expect(parseToken('A4s-A5s')).toEqual(['A5s', 'A4s'])
  })

  it('K5s-K7s розгортається від молодшої до старшої', () => {
    expect(parseToken('K5s-K7s')).toEqual(['K7s', 'K6s', 'K5s'])
  })

  it('нерозпізнаний токен повертається як одна рука', () => {
    expect(parseToken('T9s')).toEqual(['T9s'])
    expect(parseToken('98o')).toEqual(['98o'])
  })
})

describe('RFI', () => {
  it('склад кожного діапазону збігається з еталоном', () => {
    for (const [pos, expected] of Object.entries(truth.rfi)) {
      const set = RFI[pos]
      expect(set, `RFI[${pos}] має існувати`).toBeDefined()
      expect(sorted(set as ReadonlySet<string>), `RFI[${pos}]`).toEqual(expected.hands)
    }
  })

  it('відсотки в комбо збігаються з еталоном', () => {
    for (const [pos, expected] of Object.entries(truth.rfi)) {
      expect(pct(RFI[pos] as ReadonlySet<string>), `RFI[${pos}] %`).toBeCloseTo(expected.pct, 4)
    }
  })

  it('BTN ≈ 42% — контрольне число з плану', () => {
    expect(pct(RFI['BTN'] as ReadonlySet<string>)).toBeCloseTo(42.38, 1)
  })

  it('діапазони кумулятивні: кожна пізніша позиція містить попередню', () => {
    const order = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN']
    for (let i = 1; i < order.length; i++) {
      const prev = RFI[order[i - 1] as string] as ReadonlySet<string>
      const cur = RFI[order[i] as string] as ReadonlySet<string>
      for (const h of prev) {
        expect(cur.has(h), `${order[i]} має містити ${h} з ${order[i - 1]}`).toBe(true)
      }
      expect(cur.size).toBeGreaterThan(prev.size)
    }
  })

  it('SB вужчий за BTN — грає без позиції', () => {
    expect(pct(RFI['SB'] as ReadonlySet<string>)).toBeLessThan(
      pct(RFI['BTN'] as ReadonlySet<string>),
    )
  })

  it('BB не відкриває пот', () => {
    expect(RFI['BB']).toBeUndefined()
  })
})

describe('ISO', () => {
  it('склад збігається з еталоном', () => {
    for (const [pos, expected] of Object.entries(truth.iso)) {
      expect(sorted(ISO[pos] as ReadonlySet<string>), `ISO[${pos}]`).toEqual(expected.hands)
    }
  })

  it('не містить жодної руки зі слабких офсьютів', () => {
    for (const pos of Object.keys(truth.iso)) {
      for (const h of ISO[pos] as ReadonlySet<string>) {
        expect(WEAK_O.has(h), `ISO[${pos}] не має містити ${h}`).toBe(false)
      }
    }
  })

  it('BB відсутній: проти самих лімперів на BB не буває фолду', () => {
    expect(ISO['BB']).toBeUndefined()
  })
})

describe('VS_RAISE', () => {
  it('рейз- і колл-діапазони збігаються з еталоном', () => {
    for (const [bucket, expected] of Object.entries(truth.vsRaise)) {
      const def = VS_RAISE[bucket as RaiserBucket]
      expect(sorted(def.raise), `${bucket}.raise`).toEqual(expected.raise)
      for (const [ctx, exp] of Object.entries(expected.call)) {
        expect(sorted(def.call[ctx as HeroContext]), `${bucket}.call.${ctx}`).toEqual(exp.hands)
      }
    }
  })

  it('жодна рука не лежить водночас у рейзі й у коллі', () => {
    for (const bucket of ['EARLY', 'MID', 'LATE'] as const) {
      const def = VS_RAISE[bucket]
      for (const ctx of ['POS', 'SB', 'BB'] as const) {
        const both = [...def.call[ctx]].filter((h) => def.raise.has(h))
        expect(both, `${bucket}.call.${ctx} перетинається з рейзом`).toEqual([])
      }
    }
  })

  it('відсотки в шапці сходяться: рейз + колл дорівнює сумарному', () => {
    for (const bucket of ['EARLY', 'MID', 'LATE'] as const) {
      const def = VS_RAISE[bucket]
      for (const ctx of ['POS', 'SB', 'BB'] as const) {
        const total = pct(union(def.raise, def.call[ctx]))
        expect(total, `${bucket}·${ctx}`).toBeCloseTo(pct(def.raise) + pct(def.call[ctx]), 6)
      }
    }
  })

  it('BB захищається ширше за SB у кожному бакеті', () => {
    for (const bucket of ['EARLY', 'MID', 'LATE'] as const) {
      const def = VS_RAISE[bucket]
      expect(pct(def.call.BB), `${bucket}: BB ширше за SB`).toBeGreaterThan(pct(def.call.SB))
    }
  })

  it('чим пізніший рейзер, тим ширший 3-бет', () => {
    expect(pct(VS_RAISE.MID.raise)).toBeGreaterThan(pct(VS_RAISE.EARLY.raise))
    expect(pct(VS_RAISE.LATE.raise)).toBeGreaterThan(pct(VS_RAISE.MID.raise))
  })
})

describe('VS_3BET', () => {
  it('збігається з еталоном', () => {
    expect(sorted(VS_3BET.raise)).toEqual(truth.vs3bet.raise)
    expect(sorted(VS_3BET.call)).toEqual(truth.vs3bet.call)
  })

  it('рейз і колл не перетинаються', () => {
    for (const h of VS_3BET.raise) expect(VS_3BET.call.has(h)).toBe(false)
  })
})

describe('примітиви', () => {
  it('169 рук у сітці, 663 у зваженому мішку', () => {
    expect(ALL_HANDS).toHaveLength(truth.allHandsN)
    expect(WEIGHTED).toHaveLength(truth.weightedN)
  })

  it('усі комбінації складаються в 1326', () => {
    const total = ALL_HANDS.reduce((s, h) => s + combos(h), 0)
    expect(total).toBe(1326)
  })

  it('pct повного набору = 100%', () => {
    expect(pct(new Set(ALL_HANDS))).toBeCloseTo(100, 10)
  })

  it('union не дублює руки', () => {
    const u = union(RFI['BTN'] as ReadonlySet<string>, TEMPTING)
    expect(u.size).toBe(truth.unionRfiBtnTempting)
  })

  it('TEMPTING збігається з еталоном', () => {
    expect(sorted(TEMPTING)).toEqual(truth.tempting.hands)
  })

  it('isHand приймає лише канонічні руки', () => {
    expect(isHand('AKs')).toBe(true)
    expect(isHand('AA')).toBe(true)
    expect(isHand('T9o')).toBe(true)
    expect(isHand('AAs')).toBe(false)
    expect(isHand('KAs')).toBe(false)
    expect(isHand('')).toBe(false)
  })

  it('усі чотири сценарії мають підписи', () => {
    expect(Object.keys(SCENARIOS)).toEqual(['rfi', 'iso', 'vsraise', 'vs3bet'])
  })
})
