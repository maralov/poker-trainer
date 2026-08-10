/**
 * buildSpot звіряється зі спотами, згенерованими самим poker-trainer.html
 * під тим самим детермінованим Math.random (__fixtures__/ref-spots.json).
 *
 * Якщо порт зміщує бодай один виклик rng або міняє порядок операцій —
 * ці тести падають. Це і є перевірка «перенесено 1:1».
 */

import { describe, expect, it } from 'vitest'

import { mulberry32, rangeSig } from '../test/rng'
import refSpots from './__fixtures__/ref-spots.json'
import { ISO, RFI, TIGHTER2, VS_3BET, VS_RAISE } from './ranges'
import { buildSpot } from './spots'
import { ACTION_ORDER, SCENARIO_KEYS, type Position, type Scenario, type Spot } from './types'

interface RefSpot {
  scen: string
  heroPos: string
  seats: Record<string, string | null>
  prompt: string
  potBB: number
  correct: string
  hand: string
  cards: { rk: string; v: number; s: number; g: string; red: number }[]
  explainExtra: string
  isControl: boolean
  raiseSize: number
  callSize: number
  raiseSig: string
  callSig: string
}

const fixtures = refSpots as unknown as {
  random: Record<string, RefSpot[]>
  forced: Record<string, { input: { heroPos: string; hand: string }; spot: RefSpot }[]>
  control: Record<string, { input: { heroPos: string; ban: string[] }; spot: RefSpot }[]>
}

/** Зводить наш Spot до тієї самої форми, що серіалізує генератор фікстур. */
const shape = (q: Spot): RefSpot => ({
  scen: q.scen,
  heroPos: q.heroPos,
  seats: q.seats,
  prompt: q.prompt,
  potBB: q.potBB,
  correct: q.correct,
  hand: q.hand,
  cards: q.cards.map((c) => ({ rk: c.rk, v: c.v, s: c.s, g: c.g, red: c.red })),
  explainExtra: q.explainExtra,
  isControl: q.isControl,
  raiseSize: q.ranges.raise.size,
  callSize: q.ranges.call.size,
  raiseSig: rangeSig(q.ranges.raise),
  callSig: rangeSig(q.ranges.call),
})

describe.each(SCENARIO_KEYS)('еквівалентність референсу · %s', (scen) => {
  it('випадкові споти збігаються посидно', () => {
    const expected = fixtures.random[scen] ?? []
    expect(expected.length).toBeGreaterThan(0)
    expected.forEach((ref, i) => {
      const got = buildSpot({ scenarios: [scen], rng: mulberry32(i + 1) })
      expect(shape(got), `${scen} seed=${i + 1}`).toEqual(ref)
    })
  })

  it('примусові споти (drill відтворює конкретну руку) збігаються', () => {
    const cases = fixtures.forced[scen] ?? []
    expect(cases.length).toBeGreaterThan(0)
    cases.forEach(({ input, spot: ref }, i) => {
      const got = buildSpot({
        force: { scen, heroPos: input.heroPos as Position, hand: input.hand },
        rng: mulberry32(i + 1),
      })
      expect(shape(got), `${scen} forced ${input.heroPos}/${input.hand}`).toEqual(ref)
      expect(got.drill).toBe(true)
      expect(got.isControl).toBe(false)
    })
  })

  it('контрольні споти (рука поза пулом помилок) збігаються', () => {
    const cases = fixtures.control[scen] ?? []
    expect(cases.length).toBeGreaterThan(0)
    cases.forEach(({ input, spot: ref }, i) => {
      const got = buildSpot({
        force: { scen, heroPos: input.heroPos as Position, hand: null, ban: input.ban },
        rng: mulberry32(500 + i),
      })
      expect(shape(got), `${scen} control ${input.heroPos}`).toEqual(ref)
      expect(got.isControl).toBe(true)
      expect(input.ban).not.toContain(got.hand)
    })
  })
})

describe('інваріанти споту', () => {
  const sample = (scen: Scenario, n = 300): Spot[] =>
    Array.from({ length: n }, (_, i) => buildSpot({ scenarios: [scen], rng: mulberry32(i + 1) }))

  it('correct завжди узгоджений з діапазонами', () => {
    for (const scen of SCENARIO_KEYS) {
      for (const q of sample(scen)) {
        const expected = q.ranges.raise.has(q.hand)
          ? 'raise'
          : q.ranges.call.has(q.hand)
            ? 'call'
            : 'fold'
        expect(q.correct, `${scen} ${q.hand}`).toBe(expected)
      }
    }
  })

  it('роздані карти відповідають канонічній руці', () => {
    for (const scen of SCENARIO_KEYS) {
      for (const q of sample(scen)) {
        const [c1, c2] = q.cards
        expect(c1).toBeDefined()
        expect(c2).toBeDefined()
        if (!c1 || !c2) continue
        expect(c1.rk).toBe(q.hand[0])
        expect(c2.rk).toBe(q.hand[1])
        if (q.hand.endsWith('s')) expect(c1.s).toBe(c2.s)
        else expect(c1.s).not.toBe(c2.s)
      }
    }
  })

  it('rfi: усі перед героєм скинули, банк 1.5bb, опонента немає', () => {
    for (const q of sample('rfi')) {
      expect(q.heroPos).not.toBe('BB')
      expect(q.potBB).toBe(1.5)
      expect(q.villainPos).toBeNull()
      expect(q.limpers).toBeNull()
      const hi = ACTION_ORDER.indexOf(q.heroPos)
      for (const p of ACTION_ORDER.slice(0, hi)) expect(q.seats[p]).toBe('fold')
      for (const p of ACTION_ORDER.slice(hi)) expect(q.seats[p]).not.toBe('fold')
      expect(q.ranges.raise).toBe(RFI[q.heroPos])
      expect(q.ranges.call.size).toBe(0)
    }
  })

  it('iso: 1–2 лімпери, банк росте з кожним, проти двох діапазон звужується', () => {
    let sawTwo = false
    for (const q of sample('iso')) {
      const limpers = ACTION_ORDER.filter((p) => q.seats[p] === 'limp')
      expect(limpers.length).toBeGreaterThanOrEqual(1)
      expect(limpers.length).toBeLessThanOrEqual(2)
      expect(q.limpers).toBe(limpers.length)
      expect(q.villainPos).toBeNull()
      expect(q.potBB).toBe(1.5 + limpers.length)
      // Лімпери завжди перед героєм.
      const hi = ACTION_ORDER.indexOf(q.heroPos)
      for (const p of limpers) expect(ACTION_ORDER.indexOf(p)).toBeLessThan(hi)
      if (limpers.length === 2) {
        sawTwo = true
        expect(q.ranges.raise).toBe(ISO[TIGHTER2[q.heroPos]])
      } else {
        expect(q.ranges.raise).toBe(ISO[q.heroPos])
      }
    }
    expect(sawTwo, 'вибірка має містити спот із двома лімперами').toBe(true)
  })

  it('vsraise: рівно один рейзер, він діє раніше героя, банк 4.5bb', () => {
    for (const q of sample('vsraise')) {
      const raisers = ACTION_ORDER.filter((p) => q.seats[p] === 'raise')
      expect(raisers).toHaveLength(1)
      const raiser = raisers[0] as Position
      expect(q.villainPos).toBe(raiser)
      expect(q.limpers).toBeNull()
      expect(ACTION_ORDER.indexOf(raiser)).toBeLessThan(ACTION_ORDER.indexOf(q.heroPos))
      expect(q.potBB).toBe(4.5)
      const bucket = (['UTG', 'UTG+1', 'MP'] as string[]).includes(raiser)
        ? 'EARLY'
        : (['LJ', 'HJ', 'CO'] as string[]).includes(raiser)
          ? 'MID'
          : 'LATE'
      expect(q.ranges.raise).toBe(VS_RAISE[bucket].raise)
    }
  })

  it('vs3bet: герой відкрив, 3-бетор пізніше, банк 14.5bb', () => {
    for (const q of sample('vs3bet')) {
      expect(q.seats[q.heroPos]).toBe('raise')
      const tb = ACTION_ORDER.filter((p) => q.seats[p] === '3bet')
      expect(tb).toHaveLength(1)
      const threeBettor = tb[0] as Position
      expect(q.villainPos).toBe(threeBettor)
      expect(q.limpers).toBeNull()
      expect(ACTION_ORDER.indexOf(threeBettor)).toBeGreaterThan(ACTION_ORDER.indexOf(q.heroPos))
      expect(q.potBB).toBe(14.5)
      expect(q.ranges.raise).toBe(VS_3BET.raise)
      expect(q.ranges.call).toBe(VS_3BET.call)
    }
  })

  it('mixed: при кількох активних сценаріях трапляються всі', () => {
    const seen = new Set<Scenario>()
    for (let i = 1; i <= 400; i++) {
      seen.add(buildSpot({ scenarios: [...SCENARIO_KEYS], rng: mulberry32(i) }).scen)
    }
    expect([...seen].sort()).toEqual([...SCENARIO_KEYS].sort())
  })

  it('пул помилок підмішується: рука з missed трапляється частіше за випадкову', () => {
    // Чотири ключі — мінімум, при якому референс вмикає підмішування (r < 0.25).
    const missed = {
      'rfi|BTN|72o': 4,
      'rfi|BTN|83o': 3,
      'rfi|BTN|94o': 2,
      'rfi|BTN|J2o': 2,
    }
    let hits = 0
    for (let i = 1; i <= 2000; i++) {
      const q = buildSpot({ scenarios: ['rfi'], missed, rng: mulberry32(i) })
      if (['72o', '83o', '94o', 'J2o'].includes(q.hand)) hits++
    }
    // Без підмішування ці чотири руки випадали б одиниці разів на 2000.
    expect(hits).toBeGreaterThan(200)
  })
})
