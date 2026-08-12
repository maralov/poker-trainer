import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { BUCKET, HERO_CTX, RFI, VS_RAISE } from '../ranges'
import { POSTFLOP_ORDER } from '../types'
import { BUILD, buildEpisode } from './build'
import { cardCode } from './deck'
import { evalHand } from './evaluate'
import { isStrong } from './types'

const sample = (n: number, seed = 1) =>
  Array.from({ length: n }, (_, i) => buildEpisode({ rng: mulberry32(seed + i) }))

/** Канонічна рука з двох карт: 'AKs', 'AKo', '77'. */
function handOf(hole: readonly { rk: string; s: number }[]): string {
  const ORDER = 'AKQJT98765432'
  const a = hole[0]
  const b = hole[1]
  if (!a || !b) throw new Error('порожня рука')
  const [hi, lo] = ORDER.indexOf(a.rk) <= ORDER.indexOf(b.rk) ? [a, b] : [b, a]
  if (hi.rk === lo.rk) return `${hi.rk}${lo.rk}`
  return `${hi.rk}${lo.rk}${hi.s === lo.s ? 's' : 'o'}`
}

describe('buildEpisode · rfi', () => {
  it('той самий seed дає той самий епізод', () => {
    const a = buildEpisode({ rng: mulberry32(11) })
    const b = buildEpisode({ rng: mulberry32(11) })
    expect(a.board.map(cardCode)).toEqual(b.board.map(cardCode))
    expect(a.seats.map((s) => s.hole.map(cardCode))).toEqual(b.seats.map((s) => s.hole.map(cardCode)))
  })

  it('рука героя завжди з його RFI-діапазону', () => {
    for (const ep of sample(300)) {
      const hero = ep.seats[ep.heroIdx]
      expect(hero).toBeDefined()
      expect(RFI[ep.heroPos]?.has(handOf(hero!.hole)), `${ep.heroPos}`).toBe(true)
    }
  })

  it('руки колерів завжди з їхніх діапазонів захисту', () => {
    for (const ep of sample(300, 500)) {
      const bucket = BUCKET(ep.heroPos)
      for (const seat of ep.seats) {
        if (seat.hero) continue
        const range = VS_RAISE[bucket].call[HERO_CTX(seat.pos)]
        expect(range.has(handOf(seat.hole)), `${seat.pos} проти ${ep.heroPos}`).toBe(true)
      }
    }
  })

  it('карти ніде не повторюються', () => {
    for (const ep of sample(200, 900)) {
      const all = [...ep.board, ...ep.seats.flatMap((s) => [...s.hole])].map(cardCode)
      expect(new Set(all).size, `дублікат у ${all.join(' ')}`).toBe(all.length)
    }
  })

  it('BB героєм не буває, опонентів від одного до трьох', () => {
    for (const ep of sample(300, 1300)) {
      expect(ep.heroPos).not.toBe('BB')
      const n = ep.seats.filter((s) => !s.hero).length
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(3)
    }
  })

  it('ip рахується за постфлоп-порядком', () => {
    for (const ep of sample(200, 1700)) {
      const heroIdx = POSTFLOP_ORDER.indexOf(ep.heroPos as (typeof POSTFLOP_ORDER)[number])
      const want = ep.seats
        .filter((s) => !s.hero)
        .every((s) => POSTFLOP_ORDER.indexOf(s.pos as (typeof POSTFLOP_ORDER)[number]) < heroIdx)
      expect(ep.ip, `${ep.heroPos} проти ${ep.seats.map((s) => s.pos).join(',')}`).toBe(want)
    }
  })

  it('банк рахується за формулою референсу', () => {
    for (const ep of sample(200, 2100)) {
      const callers = ep.seats.filter((s) => !s.hero).map((s) => s.pos)
      const dead = callers.includes('SB') || callers.includes('BB') ? 0.5 : 1.5
      expect(ep.potBB).toBe(Math.round((3 * (1 + callers.length) + dead) * 2) / 2)
    }
  })

  it('стеки зменшені на префлоп-внесок', () => {
    for (const ep of sample(100, 2500)) {
      for (const seat of ep.seats) expect(seat.stack).toBe(BUILD.startStack - 3)
    }
  })

  it('починається з флопу без ставок', () => {
    const ep = buildEpisode({ rng: mulberry32(33) })
    expect(ep.street).toBe('flop')
    expect(ep.board).toHaveLength(3)
    expect(ep.bet).toBe(0)
    expect(ep.raised).toBe(false)
    expect(ep.finished).toBeNull()
    expect(ep.history[0]).toMatch(/відкрив/)
  })

  it('частка епізодів із сильним опонентом близька до цільової', () => {
    const eps = sample(1500, 4000)
    const strong = eps.filter((ep) =>
      ep.seats.some((s) => !s.hero && isStrong(evalHand(s.hole, ep.board).cat)),
    ).length
    const share = strong / eps.length
    expect(share, `частка ${share}`).toBeGreaterThan(0.24)
    expect(share, `частка ${share}`).toBeLessThan(0.37)
  })
})
