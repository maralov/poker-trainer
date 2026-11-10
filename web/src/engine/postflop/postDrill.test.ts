import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../test/rng'
import { POST_DRILL, fitsTarget, fixesOf, nextDrillSpot, pickDrillTarget, postDrillPool, startDrillEpisode } from './postDrill'
import { POST_DRILL_LOG_LIMIT, emptyPostProgress, recordPostAnswer, type PostAnswerInput, type PostProgress } from './postProgress'
import { POST_FIX, buildPostReview, type PostFixKey } from './postReview'
import { heroDecision } from './step'

const FIXES = Object.keys(POST_FIX) as PostFixKey[]

/** Помилка «блеф рівера»: рівер, ставки немає, правильно чек, а герой ставить. */
const riverBluff = (at: number, drill?: PostFixKey): PostAnswerInput => ({
  street: 'river',
  cat: 'AIR',
  texture: 'DRY',
  facing: 'none',
  nOpps: 1,
  ip: true,
  chosen: 'b66',
  correct: 'check',
  at,
  ...(drill === undefined ? {} : { drill }),
})

const drillAnswer = (p: PostProgress, fix: PostFixKey, ok: boolean, at: number): void => {
  recordPostAnswer(p, 0, { ...riverBluff(at, fix), chosen: ok ? 'check' : 'b66' })
}

describe('postDrillPool', () => {
  it('патерн іде в пул від двох помилок у звичайній грі', () => {
    const p = emptyPostProgress()
    recordPostAnswer(p, 0, riverBluff(1))
    expect(postDrillPool(p)).toEqual([])
    recordPostAnswer(p, 0, riverBluff(2))
    expect(postDrillPool(p)).toEqual([{ fix: 'riverBluff', n: 2, streak: 0 }])
  })

  it('drill-помилки пул не годують', () => {
    const p = emptyPostProgress()
    recordPostAnswer(p, 0, riverBluff(1))
    recordPostAnswer(p, 0, riverBluff(2, 'riverBluff'))
    expect(postDrillPool(p)).toEqual([])
  })

  it(`${POST_DRILL.retire} правильних поспіль закривають патерн, нові помилки відкривають знову`, () => {
    const p = emptyPostProgress()
    recordPostAnswer(p, 0, riverBluff(1))
    recordPostAnswer(p, 0, riverBluff(2))
    for (let i = 0; i < POST_DRILL.retire - 1; i++) drillAnswer(p, 'riverBluff', true, 10 + i)
    expect(postDrillPool(p)[0]?.streak).toBe(POST_DRILL.retire - 1)

    drillAnswer(p, 'riverBluff', true, 30)
    expect(postDrillPool(p)).toEqual([])

    recordPostAnswer(p, 0, riverBluff(40))
    expect(postDrillPool(p)).toEqual([])
    recordPostAnswer(p, 0, riverBluff(41))
    expect(postDrillPool(p)).toEqual([{ fix: 'riverBluff', n: 2, streak: 0 }])
  })

  it('помилка скидає серію', () => {
    const p = emptyPostProgress()
    recordPostAnswer(p, 0, riverBluff(1))
    recordPostAnswer(p, 0, riverBluff(2))
    for (let i = 0; i < 5; i++) drillAnswer(p, 'riverBluff', true, 10 + i)
    drillAnswer(p, 'riverBluff', false, 20)
    expect(postDrillPool(p)[0]?.streak).toBe(0)
  })
})

describe('postDrillPool: кілька патернів', () => {
  // Помилка «пропущене валью»: ставки немає, правильно ставити, а герой чекнув.
  const missValue = (at: number, drill?: PostFixKey): PostAnswerInput => ({
    ...riverBluff(at, drill),
    cat: 'STRONG_MADE',
    chosen: 'check',
    correct: 'b66',
  })

  it('серія одного патерну не залежить від помилок іншого, закриття обнуляє серію', () => {
    const p = emptyPostProgress()
    for (const at of [1, 2]) {
      recordPostAnswer(p, 0, riverBluff(at))
      recordPostAnswer(p, 0, missValue(at))
    }
    for (let i = 0; i < 3; i++) drillAnswer(p, 'riverBluff', true, 10 + i)
    recordPostAnswer(p, 0, missValue(20, 'missValue'))
    const pool = postDrillPool(p)
    expect(pool.find((x) => x.fix === 'riverBluff')?.streak).toBe(3)
    expect(pool.find((x) => x.fix === 'missValue')?.streak).toBe(0)
  })

  it('коли хвіст drill повний, гра старша за нього пул не відкриває', () => {
    const p = emptyPostProgress()
    recordPostAnswer(p, 0, riverBluff(1))
    recordPostAnswer(p, 0, riverBluff(2))
    for (let i = 0; i < POST_DRILL_LOG_LIMIT; i++) drillAnswer(p, 'missValue', true, 100 + i)
    expect(postDrillPool(p)).toEqual([])
    recordPostAnswer(p, 0, riverBluff(10_000))
    recordPostAnswer(p, 0, riverBluff(10_001))
    expect(postDrillPool(p).map((x) => x.fix)).toEqual(['riverBluff'])
  })
})

describe('drill і статистика', () => {
  it('drill-відповідь не рухає total, зрізи і рекорд, але лягає в drillLog і журнал помилок', () => {
    const p = emptyPostProgress()
    recordPostAnswer(p, 5, { ...riverBluff(1, 'riverBluff'), chosen: 'check' })
    recordPostAnswer(p, 0, riverBluff(2, 'riverBluff'))
    expect(p.total).toBe(0)
    expect(p.best).toBe(0)
    expect(p.byStreet).toEqual({})
    expect(p.drillLog).toEqual([
      { f: 'riverBluff', ok: 1, t: 1 },
      { f: 'riverBluff', ok: 0, t: 2 },
    ])
    expect(p.log).toHaveLength(1)
    expect(p.log[0]?.d).toBe(1)
  })

  it('drill не рухає серію гри: рекорд після виходу з drill не стрибає', () => {
    const p = emptyPostProgress()
    let streak = 0
    for (let i = 0; i < 5; i++) {
      streak = recordPostAnswer(p, streak, { ...riverBluff(i, 'riverBluff'), chosen: 'check' }).streak
    }
    expect(streak).toBe(0)
    streak = recordPostAnswer(p, streak, { ...riverBluff(9), chosen: 'check' }).streak
    expect(p.best).toBe(1)
  })

  it('точність розбору не враховує drill-помилки', () => {
    const p = emptyPostProgress()
    recordPostAnswer(p, 0, { ...riverBluff(1), chosen: 'check' })
    recordPostAnswer(p, 0, riverBluff(2, 'riverBluff'))
    expect(buildPostReview(p).acc).toBe(100)
    expect(buildPostReview(p).mistakes).toBe(0)
  })
})

describe('pickDrillTarget', () => {
  it('зважує патерни кількістю помилок і пропускає виключені', () => {
    const pool = [
      { fix: 'riverBluff' as const, n: 3, streak: 0 },
      { fix: 'missValue' as const, n: 1, streak: 0 },
    ]
    const rng = mulberry32(7)
    const hits = { riverBluff: 0, missValue: 0 }
    for (let i = 0; i < 4000; i++) {
      const t = pickDrillTarget(pool, rng)
      if (t?.fix === 'riverBluff' || t?.fix === 'missValue') hits[t.fix]++
    }
    expect(hits.riverBluff / 4000).toBeCloseTo(0.75, 1)
    expect(pickDrillTarget(pool, rng, new Set(['riverBluff']))?.fix).toBe('missValue')
    expect(pickDrillTarget(pool, rng, new Set(['riverBluff', 'missValue']))).toBeNull()
  })
})

describe('генерація drill-спотів', () => {
  // Головний ризик спеки (§3): рідкісний патерн чи його контраст не знаходиться
  // за ліміт роздач. Тут кожен патерн і кожен контраст мусять знайтись.
  for (const fix of FIXES) {
    for (const contrast of [false, true]) {
      it(`${fix}${contrast ? ' · контраст' : ''} знаходиться за ліміт`, () => {
        const target = { fix, contrast }
        const ep = startDrillEpisode(target, { rng: mulberry32(fix.length * 31 + (contrast ? 1 : 0)) })
        expect(ep).not.toBeNull()
        const d = ep && heroDecision(ep)
        expect(d).not.toBeNull()
        if (!d) return
        expect(fitsTarget(target, d)).toBe(true)
        if (contrast) {
          expect(fixesOf(d).has(fix)).toBe(false)
        } else {
          // Спот патерну справді має неправильну дію, яку розбір назвав би цим патерном.
          expect(fixesOf(d).has(fix)).toBe(true)
        }
      })
    }
  }

  it('nextDrillSpot повертає спот цілі з пулу', () => {
    const pool = [{ fix: 'riverBluff' as const, n: 2, streak: 0 }]
    const spot = nextDrillSpot(pool, { rng: mulberry32(3), id: 'e1' })
    expect(spot?.target.fix).toBe('riverBluff')
    expect(spot?.episode.id).toBe('e1')
    const d = spot && heroDecision(spot.episode)
    expect(d?.street).toBe('river')
  })

  it('порожній пул — спота немає', () => {
    expect(nextDrillSpot([], { rng: mulberry32(1) })).toBeNull()
  })
})
