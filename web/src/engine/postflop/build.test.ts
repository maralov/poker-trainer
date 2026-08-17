import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { handOf } from '../cards'
import { BUCKET, HERO_CTX, ISO, RFI, VS_RAISE } from '../ranges'
import { ACTION_ORDER, POSTFLOP_ORDER } from '../types'
import { BUILD, LIMP_CALL, LIMP_RANGE, buildEpisode } from './build'
import { cardCode } from './deck'
import { evalHand } from './evaluate'
import { isStrong } from './types'

const sample = (n: number, seed = 1) =>
  Array.from({ length: n }, (_, i) => buildEpisode({ rng: mulberry32(seed + i) }))

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

  it('id за замовчуванням порожній — engine не генерує ідентифікатори сам', () => {
    // Правило 5 CLAUDE.md: engine/ не тягне зовнішніх залежностей, а crypto.randomUUID
    // саме такою залежністю і був би. id заповнює стор — engine лише носить поле.
    const ep = buildEpisode({ rng: mulberry32(1) })
    expect(ep.id).toBe('')
  })

  it('переданий id потрапляє в епізод незмінним', () => {
    const ep = buildEpisode({ rng: mulberry32(1), id: 'episode-abc-123' })
    expect(ep.id).toBe('episode-abc-123')
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

/** Шукає конкретний спот лінії колера серед сідів і перевіряє банк. */
function expectPot(opener: string, hero: string, want: number): void {
  for (let s = 1; s <= 8000; s++) {
    const ep = buildEpisode({ scenario: 'vsraise', rng: mulberry32(s) })
    if (ep.heroPos !== hero) continue
    if (ep.seats.find((x) => !x.hero)?.pos !== opener) continue
    expect(ep.potBB).toBe(want)
    return
  }
  throw new Error(`не знайшлось споту ${opener} проти ${hero}`)
}

describe('buildEpisode · vsraise (лінія колера)', () => {
  const callerSample = (n: number, seed = 1) =>
    Array.from({ length: n }, (_, i) =>
      buildEpisode({ scenario: 'vsraise', rng: mulberry32(seed + i) }),
    )

  it('епізод підписаний лінією колера', () => {
    for (const ep of callerSample(50)) {
      expect(ep.line).toBe('caller')
      expect(ep.scenario).toBe('vsraise')
    }
  })

  it('завжди хедз-ап: опонент один', () => {
    for (const ep of callerSample(200, 300)) {
      expect(ep.seats.filter((s) => !s.hero)).toHaveLength(1)
    }
  })

  it('рука опенера з його RFI, рука героя — з чарта захисту проти цього бакета', () => {
    for (const ep of callerSample(300, 700)) {
      const opener = ep.seats.find((s) => !s.hero)
      const hero = ep.seats[ep.heroIdx]
      expect(opener).toBeDefined()
      expect(hero).toBeDefined()
      expect(RFI[opener!.pos]?.has(handOf(opener!.hole)), `опенер ${opener!.pos}`).toBe(true)
      const range = VS_RAISE[BUCKET(opener!.pos)].call[HERO_CTX(ep.heroPos)]
      expect(range.has(handOf(hero!.hole)), `${ep.heroPos} проти ${opener!.pos}`).toBe(true)
    }
  })

  it('опенер завжди діє до героя за префлоп-порядком', () => {
    for (const ep of callerSample(300, 1100)) {
      const opener = ep.seats.find((s) => !s.hero)
      expect(ACTION_ORDER.indexOf(opener!.pos), `${opener!.pos} до ${ep.heroPos}`).toBeLessThan(
        ACTION_ORDER.indexOf(ep.heroPos),
      )
    }
  })

  it('ip рахується за постфлоп-порядком', () => {
    for (const ep of callerSample(200, 1500)) {
      const opener = ep.seats.find((s) => !s.hero)
      const want =
        POSTFLOP_ORDER.indexOf(ep.heroPos as (typeof POSTFLOP_ORDER)[number]) >
        POSTFLOP_ORDER.indexOf(opener!.pos as (typeof POSTFLOP_ORDER)[number])
      expect(ep.ip, `${ep.heroPos} проти ${opener!.pos}`).toBe(want)
    }
  })

  it('карти ніде не повторюються', () => {
    for (const ep of callerSample(200, 1900)) {
      const all = [...ep.board, ...ep.seats.flatMap((s) => [...s.hole])].map(cardCode)
      expect(new Set(all).size, `дублікат у ${all.join(' ')}`).toBe(all.length)
    }
  })

  it('той самий seed дає той самий епізод', () => {
    const a = buildEpisode({ scenario: 'vsraise', rng: mulberry32(77) })
    const b = buildEpisode({ scenario: 'vsraise', rng: mulberry32(77) })
    expect(a.heroPos).toBe(b.heroPos)
    expect(a.board.map(cardCode)).toEqual(b.board.map(cardCode))
  })

  // Числа пораховані вручну: 3bb опен + 3bb колл + блайнди, які не поклали 3bb.
  it('банк: CO відкрив, BTN заколлював → 7.5bb (обидва блайнди мертві)', () => {
    expectPot('CO', 'BTN', 7.5)
  })

  it('банк: CO відкрив, BB заколлював → 6.5bb (блайнд BB уже в його 3bb)', () => {
    expectPot('CO', 'BB', 6.5)
  })

  it('банк: CO відкрив, SB заколлював → 7bb (мертвий лише блайнд BB)', () => {
    expectPot('CO', 'SB', 7)
  })

  it('стеки зменшені на префлоп-внесок', () => {
    for (const ep of callerSample(100, 2500)) {
      for (const seat of ep.seats) expect(seat.stack).toBe(BUILD.startStack - BUILD.openBB)
    }
  })

  it('стрічка історії описує префлоп колера', () => {
    const ep = buildEpisode({ scenario: 'vsraise', rng: mulberry32(31) })
    expect(ep.history[0]).toMatch(/відкрив/)
    expect(ep.history[0]).toMatch(/заколлював/)
  })

  it('частка епізодів із сильним опонентом близька до цільової', () => {
    const eps = callerSample(1200, 4000)
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
