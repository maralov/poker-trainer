/**
 * 6-max не має референсу: діапазони задає спека 2026-11-11-six-max-design.md.
 * Тут перевіряються властивості, а не конкретні руки: частки в межах цілей,
 * рейз і колл не перетинаються, кожен спот садить лише місця свого столу.
 */

import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../test/rng'
import { pct } from './cards'
import { drillSpot } from './drill'
import { gateStatus } from './gate'
import { buildEpisode } from './postflop'
import { emptyPreProgress, type RecentEntry } from './progress'
import { buildSpot } from './spots'
import { TABLES } from './tables'
import { SCENARIO_KEYS, type Position, type Scenario } from './types'

const T6 = TABLES['6max']
const SEATED: ReadonlySet<Position> = new Set(T6.seats)

describe('6-max: діапазони', () => {
  it.each([
    ['UTG', 13, 17],
    ['HJ', 17, 22],
    ['CO', 25, 30],
    ['BTN', 41, 48],
    ['SB', 36, 43],
  ] as const)('RFI %s у межах %d–%d%%', (pos, lo, hi) => {
    const p = pct(T6.rfi[pos] ?? new Set())
    expect(p).toBeGreaterThanOrEqual(lo)
    expect(p).toBeLessThanOrEqual(hi)
  })

  it('RFI кумулятивний: кожна наступна позиція містить попередню', () => {
    for (let i = 1; i < T6.openOrder.length; i++) {
      const prev = T6.rfi[T6.openOrder[i - 1] ?? 'UTG'] ?? new Set()
      const cur = T6.rfi[T6.openOrder[i] ?? 'UTG'] ?? new Set()
      for (const h of prev) expect(cur.has(h), `${h} у ${T6.openOrder[i]}`).toBe(true)
    }
  })

  it('проти рейзу колл і рейз не перетинаються', () => {
    for (const def of Object.values(T6.vsRaise)) {
      for (const ctx of ['POS', 'SB', 'BB'] as const) {
        for (const h of def.call[ctx]) expect(def.raise.has(h), h).toBe(false)
      }
    }
  })


  it('кожне місце, з якого бувають споти, має підказку', () => {
    for (const p of T6.seats) expect(T6.notes[p], p).toBeTruthy()
  })
})

describe.each(Object.values(TABLES))('$label: захист від 3-бету', (table) => {
  const BUCKETS = ['EARLY', 'MID', 'LATE'] as const
  // Хто з групи може відкритись і отримати 3-бет: усі, хто відкриває, крім SB.
  const openers = (b: (typeof BUCKETS)[number]) =>
    table.openOrder.filter((p) => p !== 'SB' && table.bucket(p) === b)

  it('LATE·OOP не існує, решта чотири клітинки є', () => {
    for (const b of BUCKETS) {
      expect(table.vs3bet[b].IP, `${b}·IP`).toBeDefined()
      expect(table.vs3bet[b].OOP !== undefined, `${b}·OOP`).toBe(b !== 'LATE')
    }
  })

  it('4-бет і колл не перетинаються і лежать у RFI групи опенера', () => {
    for (const b of BUCKETS) {
      const rfi = new Set(openers(b).flatMap((p) => [...(table.rfi[p] ?? [])]))
      for (const [side, cell] of Object.entries(table.vs3bet[b])) {
        for (const h of cell.call) expect(cell.raise.has(h), `${b}·${side} ${h}`).toBe(false)
        for (const h of [...cell.raise, ...cell.call]) expect(rfi.has(h), `${b}·${side} ${h} поза RFI`).toBe(true)
      }
    }
  })

  it('у позиції захищаєшся ширше, ніж без неї', () => {
    for (const b of ['EARLY', 'MID'] as const) {
      const { IP, OOP } = table.vs3bet[b]
      expect(pct(IP?.call ?? new Set())).toBeGreaterThan(pct(OOP?.call ?? new Set()))
    }
  })
})

describe('6-max: споти', () => {
  it.each(SCENARIO_KEYS)('%s садить лише місця 6-max і має непорожній діапазон', (scen) => {
    for (let i = 0; i < 400; i++) {
      const s = buildSpot({ table: T6, scenarios: [scen], rng: mulberry32(i + 1) })
      expect(s.table).toBe('6max')
      expect(SEATED.has(s.heroPos), s.heroPos).toBe(true)
      if (s.villainPos) expect(SEATED.has(s.villainPos), s.villainPos).toBe(true)
      for (const [pos, act] of Object.entries(s.seats)) {
        if (act !== null) expect(SEATED.has(pos as Position), pos).toBe(true)
      }
      expect(s.ranges.raise.size).toBeGreaterThan(0)
    }
  })

  it('покриває всі позиції, з яких сценарій можливий', () => {
    const expected: Record<Scenario, Position[]> = {
      rfi: ['UTG', 'HJ', 'CO', 'BTN', 'SB'],
      iso: ['HJ', 'CO', 'BTN', 'SB'],
      vsraise: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
      vs3bet: ['UTG', 'HJ', 'CO', 'BTN'],
    }
    for (const scen of SCENARIO_KEYS) {
      const seen = new Set<Position>()
      for (let i = 0; i < 400; i++) {
        seen.add(buildSpot({ table: T6, scenarios: [scen], rng: mulberry32(i + 7) }).heroPos)
      }
      expect([...seen].sort()).toEqual([...expected[scen]].sort())
    }
  })

  it('drill відтворює помилку з 6-max', () => {
    const p = emptyPreProgress()
    for (const h of ['72o', '83o', 'J2o']) {
      p.log.push({ s: 'rfi', p: 'CO', h, ch: 'raise', co: 'fold', t: 0 })
    }
    const spot = drillSpot(p, 'rfi', T6, mulberry32(1))
    expect(spot?.table).toBe('6max')
    expect(spot?.heroPos).toBe('CO')
  })

  it('drill ігнорує позицію, якої немає за 6-max столом', () => {
    const p = emptyPreProgress()
    p.log.push({ s: 'rfi', p: 'LJ', h: '72o', ch: 'raise', co: 'fold', t: 0 })
    expect(drillSpot(p, 'rfi', T6, mulberry32(1))).toBeNull()
  })
})

describe('6-max: ворота', () => {
  const window = (positions: readonly Position[]): RecentEntry[] =>
    positions.flatMap((p, pi) =>
      Array.from({ length: 25 }, (_, k) => ({
        s: SCENARIO_KEYS[(pi * 25 + k) % SCENARIO_KEYS.length] as Scenario,
        p,
        ok: 1 as const,
      })),
    )

  it('відкриваються з 5 позиціями з 6', () => {
    expect(gateStatus(window(['UTG', 'HJ', 'CO', 'BTN', 'SB']), 200, T6).ok).toBe(true)
  })

  it('не відкриваються з 4 позиціями', () => {
    expect(gateStatus(window(['UTG', 'HJ', 'CO', 'BTN']), 200, T6).c4).toBe(false)
  })
})

describe('6-max: постфлоп', () => {
  it.each(['rfi', 'iso', 'vsraise'] as const)('%s роздає лише місця 6-max', (scenario) => {
    for (let i = 0; i < 150; i++) {
      const ep = buildEpisode({ table: T6, scenario, rng: mulberry32(i + 3) })
      expect(ep.table).toBe('6max')
      for (const s of ep.seats) expect(SEATED.has(s.pos), s.pos).toBe(true)
    }
  })
})
