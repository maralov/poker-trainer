import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../test/rng'
import { DRILL, canDrill, drillPool, drillSpot, drillStats } from './drill'
import { emptyPreProgress, type MistakeEntry, type PreProgress } from './progress'
import type { Action, Hand, Position, Scenario } from './types'

/** Прогрес із заданими помилками: [позиція, рука, скільки разів]. */
function withMistakes(
  scen: Scenario,
  entries: readonly [Position, Hand, number][],
): PreProgress {
  const p = emptyPreProgress()
  for (const [pos, hand, n] of entries) {
    for (let i = 0; i < n; i++) {
      const e: MistakeEntry = {
        s: scen,
        p: pos,
        h: hand,
        ch: 'raise' as Action,
        co: 'fold' as Action,
        t: 1_700_000_000_000 + i,
      }
      p.log.push(e)
    }
  }
  return p
}

describe('drillPool', () => {
  it('групує помилки по позиції+руці й сортує за частотою', () => {
    const p = withMistakes('rfi', [
      ['BTN', '72o', 2],
      ['CO', 'K5s', 5],
      ['MP', 'A9o', 3],
    ])
    expect(drillPool(p, 'rfi')).toEqual([
      { pos: 'CO', hand: 'K5s', n: 5 },
      { pos: 'MP', hand: 'A9o', n: 3 },
      { pos: 'BTN', hand: '72o', n: 2 },
    ])
  })

  it('не змішує сценарії', () => {
    const p = withMistakes('rfi', [['BTN', '72o', 3]])
    p.log.push(...withMistakes('iso', [['CO', 'K5s', 4]]).log)
    expect(drillPool(p, 'rfi').map((x) => x.hand)).toEqual(['72o'])
    expect(drillPool(p, 'iso').map((x) => x.hand)).toEqual(['K5s'])
  })

  it('рука виходить з пулу після 5 правильних поспіль', () => {
    const p = withMistakes('rfi', [
      ['BTN', '72o', 3],
      ['CO', 'K5s', 2],
    ])
    expect(drillPool(p, 'rfi')).toHaveLength(2)

    p.drill.streaks['rfi|BTN|72o'] = DRILL.retire - 1
    expect(drillPool(p, 'rfi'), '4 правильних — ще в пулі').toHaveLength(2)

    p.drill.streaks['rfi|BTN|72o'] = DRILL.retire
    const pool = drillPool(p, 'rfi')
    expect(pool).toHaveLength(1)
    expect(pool[0]?.hand).toBe('K5s')
  })

  it('відкидає записи, з яких неможливо побудувати спот (RFI з BB)', () => {
    const p = withMistakes('rfi', [
      ['BB', 'AA', 4],
      ['BTN', '72o', 2],
    ])
    expect(drillPool(p, 'rfi').map((x) => x.pos)).toEqual(['BTN'])
  })

  it('відкидає пошкоджені руки з localStorage', () => {
    const p = withMistakes('rfi', [['BTN', '72o', 2]])
    p.log.push({ s: 'rfi', p: 'BTN' as Position, h: 'ZZZ', ch: 'raise', co: 'fold', t: 1 })
    expect(drillPool(p, 'rfi')).toHaveLength(1)
  })
})

describe('drillStats', () => {
  const withRecent = (scen: Scenario, values: (0 | 1)[]): PreProgress => {
    const p = emptyPreProgress()
    p.drill.recent[scen] = values
    return p
  }

  it('порожній стан — 0%', () => {
    expect(drillStats(emptyPreProgress(), 'rfi')).toEqual({ n: 0, acc: 0, done: false })
  })

  it('норму виконано при 90% на повному вікні з 50', () => {
    const values: (0 | 1)[] = Array.from({ length: 50 }, (_, i) => (i < 45 ? 1 : 0))
    const s = drillStats(withRecent('rfi', values), 'rfi')
    expect(s).toEqual({ n: 50, acc: 90, done: true })
  })

  it('89% на повному вікні — норму не виконано', () => {
    const values: (0 | 1)[] = Array.from({ length: 100 }, (_, i) => (i < 56 ? 1 : 0))
    // Останні 50: 6 одиниць… перевіряємо саме хвіст, а не всю історію.
    const s = drillStats(withRecent('rfi', values), 'rfi')
    expect(s.n).toBe(50)
    expect(s.acc).toBe(12)
    expect(s.done).toBe(false)
  })

  it('100% але вікно неповне — норму ще не виконано', () => {
    const values: (0 | 1)[] = Array.from({ length: 49 }, () => 1)
    expect(drillStats(withRecent('rfi', values), 'rfi')).toEqual({ n: 49, acc: 100, done: false })
  })

  it('рахує лише хвіст вікна', () => {
    const values: (0 | 1)[] = [...Array.from({ length: 100 }, () => 0 as const), ...Array.from({ length: 50 }, () => 1 as const)]
    expect(drillStats(withRecent('rfi', values), 'rfi').acc).toBe(100)
  })
})

describe('canDrill', () => {
  it('пул менший за 3 руки не запускає drill', () => {
    const p = withMistakes('rfi', [
      ['BTN', '72o', 9],
      ['CO', 'K5s', 9],
    ])
    expect(canDrill(p, 'rfi')).toBe(false)
    p.log.push(...withMistakes('rfi', [['MP', 'A9o', 1]]).log)
    expect(canDrill(p, 'rfi')).toBe(true)
  })
})

describe('drillSpot', () => {
  const pool = withMistakes('rfi', [
    ['BTN', '72o', 4],
    ['CO', 'K5s', 3],
    ['MP', 'A9o', 2],
  ])

  it('порожній пул повертає null', () => {
    expect(drillSpot(emptyPreProgress(), 'rfi', mulberry32(1))).toBeNull()
  })

  it('приблизно 70% рук з пулу, 30% контролів', () => {
    let fromPool = 0
    let control = 0
    for (let i = 1; i <= 2000; i++) {
      const q = drillSpot(pool, 'rfi', mulberry32(i))
      expect(q).not.toBeNull()
      if (!q) continue
      if (q.isControl) control++
      else fromPool++
    }
    const share = fromPool / (fromPool + control)
    expect(share).toBeGreaterThan(DRILL.poolShare - 0.05)
    expect(share).toBeLessThan(DRILL.poolShare + 0.05)
  })

  it('руки з пулу приходять з тієї самої позиції, де були помилки', () => {
    const expected = new Map([
      ['72o', 'BTN'],
      ['K5s', 'CO'],
      ['A9o', 'MP'],
    ])
    for (let i = 1; i <= 500; i++) {
      const q = drillSpot(pool, 'rfi', mulberry32(i))
      if (!q || q.isControl) continue
      expect(q.heroPos).toBe(expected.get(q.hand))
      expect(q.drill).toBe(true)
    }
  })

  it('вибір з пулу зважений за частотою помилок', () => {
    const counts = new Map<string, number>()
    for (let i = 1; i <= 4000; i++) {
      const q = drillSpot(pool, 'rfi', mulberry32(i))
      if (!q || q.isControl) continue
      counts.set(q.hand, (counts.get(q.hand) ?? 0) + 1)
    }
    const n72 = counts.get('72o') ?? 0
    const nK5 = counts.get('K5s') ?? 0
    const nA9 = counts.get('A9o') ?? 0
    expect(n72).toBeGreaterThan(nK5)
    expect(nK5).toBeGreaterThan(nA9)
    // Ваги 4:3:2 — перевіряємо порядок величин, а не точну пропорцію.
    expect(n72 / nA9).toBeGreaterThan(1.5)
  })

  it('контрольна рука ніколи не збігається з рукою з пулу тієї ж позиції', () => {
    const banned = new Map([
      ['BTN', '72o'],
      ['CO', 'K5s'],
      ['MP', 'A9o'],
    ])
    let seen = 0
    for (let i = 1; i <= 2000; i++) {
      const q = drillSpot(pool, 'rfi', mulberry32(i))
      if (!q || !q.isControl) continue
      seen++
      expect(q.hand).not.toBe(banned.get(q.heroPos))
    }
    expect(seen).toBeGreaterThan(100)
  })
})
