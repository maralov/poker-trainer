import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { BUCKET, HERO_CTX, ISO, RFI, VS_RAISE } from '../ranges'
import { ACTION_ORDER, POSTFLOP_ORDER } from '../types'
import { BUILD, LIMP_CALL, LIMP_RANGE, buildEpisode } from './build'
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

  // Попередній варіант цього тесту дослівно повторював вираз із build.ts —
  // такий тест проходить за будь-якої (навіть неправильної) формули банку.
  // Тут — конкретні числа для конкретних спотів, пораховані вручну.
  it('банк: CO відкрив 3bb, один колер BTN → 7.5bb', () => {
    let found = false
    for (let s = 1; s <= 5000 && !found; s++) {
      const ep = buildEpisode({ rng: mulberry32(s) })
      if (ep.heroPos !== 'CO') continue
      const callers = ep.seats.filter((x) => !x.hero).map((x) => x.pos)
      if (callers.length !== 1 || callers[0] !== 'BTN') continue
      expect(ep.potBB).toBe(7.5)
      found = true
    }
    expect(found, 'має знайтись CO проти одного колера BTN').toBe(true)
  })

  it('банк: CO відкрив 3bb, один колер BB → 6.5bb (мертві гроші менші — блайнд уже в поті)', () => {
    let found = false
    for (let s = 1; s <= 5000 && !found; s++) {
      const ep = buildEpisode({ rng: mulberry32(s) })
      if (ep.heroPos !== 'CO') continue
      const callers = ep.seats.filter((x) => !x.hero).map((x) => x.pos)
      if (callers.length !== 1 || callers[0] !== 'BB') continue
      expect(ep.potBB).toBe(6.5)
      found = true
    }
    expect(found, 'має знайтись CO проти одного колера BB').toBe(true)
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

describe('buildEpisode · iso', () => {
  const isoSample = (n: number, seed = 1) =>
    Array.from({ length: n }, (_, i) => buildEpisode({ scenario: 'iso', rng: mulberry32(seed + i) }))

  it('рука героя з ISO-діапазону, а не з RFI', () => {
    for (const ep of isoSample(200)) {
      expect(ep.scenario).toBe('iso')
      const hero = ep.seats[ep.heroIdx]
      expect(ISO[ep.heroPos]?.has(handOf(hero!.hole)), `${ep.heroPos}`).toBe(true)
    }
  })

  it('опоненти — лімпери, що заколлювали ізолейт', () => {
    for (const ep of isoSample(200, 700)) {
      for (const seat of ep.seats) {
        if (seat.hero) continue
        const hand = handOf(seat.hole)
        expect(LIMP_RANGE.has(hand), `${hand} має бути в лімп-діапазоні`).toBe(true)
        expect(LIMP_CALL.has(hand), `${hand} мав би сфолдити ізолейт`).toBe(true)
      }
    }
  })

  it('лімперів один-два, банк більший за rfi', () => {
    for (const ep of isoSample(200, 1500)) {
      const n = ep.seats.filter((s) => !s.hero).length
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(2)
      expect(ep.potBB).toBeGreaterThan(9)
    }
  })

  it('стрічка історії згадує ізо-рейз', () => {
    const ep = buildEpisode({ scenario: 'iso', rng: mulberry32(21) })
    expect(ep.history[0]).toMatch(/ізо-рейз/)
  })

  // Регресія на дефект: пул лімперів брався з ACTION_ORDER.slice(hi + 1) —
  // тих, хто діє ПІСЛЯ героя. Але лімпують ті, хто діє ДО ізолятора; інакше
  // ізолювати нікого. Саме цього тесту бракувало, і саме тому дефект пройшов.
  it('лімпер завжди діє до героя за ACTION_ORDER', () => {
    for (const ep of isoSample(300, 3000)) {
      const heroOrder = ACTION_ORDER.indexOf(ep.heroPos)
      for (const seat of ep.seats) {
        if (seat.hero) continue
        expect(
          ACTION_ORDER.indexOf(seat.pos),
          `${seat.pos} має діяти до ${ep.heroPos}`,
        ).toBeLessThan(heroOrder)
      }
    }
  })

  it('героєм не буває позиція, перед якою нікого немає (UTG)', () => {
    for (const ep of isoSample(300, 3500)) {
      expect(ep.heroPos).not.toBe('UTG')
    }
  })

  it('банк: BTN ізолює одного лімпера HJ на 5bb → 11.5bb', () => {
    let found = false
    for (let s = 1; s <= 5000 && !found; s++) {
      const ep = buildEpisode({ scenario: 'iso', rng: mulberry32(s) })
      if (ep.heroPos !== 'BTN') continue
      const callers = ep.seats.filter((x) => !x.hero).map((x) => x.pos)
      if (callers.length !== 1 || callers[0] !== 'HJ') continue
      expect(ep.potBB).toBe(11.5)
      found = true
    }
    expect(found, 'має знайтись BTN проти одного лімпера HJ').toBe(true)
  })
})
