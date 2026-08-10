import { describe, expect, it } from 'vitest'

import { GATE, gateStatus } from './gate'
import type { RecentEntry } from './progress'
import { ACTION_ORDER, SCENARIO_KEYS, type Position, type Scenario } from './types'

const entry = (s: Scenario, p: Position, ok: boolean): RecentEntry => ({ s, p, ok: ok ? 1 : 0 })

/**
 * Вікно, яке проходить усі чотири умови: 8 позицій × 15 рук = 120 записів,
 * сценарії розподілені так, щоб кожен мав ≥ 15 рук.
 */
function passingWindow(accuracy = 1): RecentEntry[] {
  const out: RecentEntry[] = []
  const positions = ACTION_ORDER.slice(0, 8)
  let i = 0
  for (const p of positions) {
    for (let k = 0; k < 15; k++) {
      const scen = SCENARIO_KEYS[i % SCENARIO_KEYS.length] as Scenario
      out.push(entry(scen, p, i % 100 < accuracy * 100))
      i++
    }
  }
  return out
}

describe('gateStatus', () => {
  it('порожній стан — жодної умови', () => {
    const g = gateStatus([], 0)
    expect([g.c1, g.c2, g.c3, g.c4, g.ok]).toEqual([false, false, false, false, false])
    expect(g.acc).toBe(0)
    expect(g.win).toBe(0)
  })

  it('усі чотири умови виконуються на ідеальному вікні', () => {
    const w = passingWindow()
    const g = gateStatus(w, 120)
    expect(g.win).toBe(120)
    expect(g.acc).toBe(100)
    expect([g.c1, g.c2, g.c3, g.c4, g.ok]).toEqual([true, true, true, true, true])
  })

  it('c1 залежить від загальної кількості рук, а не від вікна', () => {
    const w = passingWindow()
    expect(gateStatus(w, GATE.hands - 1).c1).toBe(false)
    expect(gateStatus(w, GATE.hands).c1).toBe(true)
  })

  it('вікно обрізається до останніх 150 рук', () => {
    const old: RecentEntry[] = Array.from({ length: 200 }, () => entry('rfi', 'UTG', false))
    const fresh = passingWindow()
    const g = gateStatus([...old, ...fresh], 320)
    expect(g.win).toBe(GATE.window)
    // Старі помилки поза вікном не тягнуть точність униз до нуля.
    expect(g.acc).toBeGreaterThan(0)
  })

  it('точність 79% не проходить поріг, 80% проходить', () => {
    const mk = (correct: number): RecentEntry[] =>
      Array.from({ length: 100 }, (_, i) => entry('rfi', 'UTG', i < correct))
    expect(gateStatus(mk(79), 100).c2).toBe(false)
    expect(gateStatus(mk(80), 100).c2).toBe(true)
  })

  it('c3: один провалений сценарій блокує ворота попри високе середнє', () => {
    const w: RecentEntry[] = []
    // Три сценарії ідеальні, четвертий — 50%.
    for (const scen of ['rfi', 'iso', 'vsraise'] as Scenario[]) {
      for (let i = 0; i < 30; i++) w.push(entry(scen, ACTION_ORDER[i % 8] as Position, true))
    }
    for (let i = 0; i < 30; i++) w.push(entry('vs3bet', ACTION_ORDER[i % 8] as Position, i % 2 === 0))
    const g = gateStatus(w, 200)
    expect(g.acc).toBeGreaterThan(GATE.acc)
    expect(g.c2).toBe(true)
    expect(g.c3, 'слабкий сценарій має блокувати').toBe(false)
    expect(g.ok).toBe(false)
  })

  it('c3: сценарій із менш ніж 15 руками у вікні не рахується', () => {
    const w: RecentEntry[] = []
    for (let i = 0; i < 110; i++) w.push(entry('rfi', ACTION_ORDER[i % 8] as Position, true))
    // 14 провалених рук iso — замало, щоб сценарій потрапив у розрахунок.
    for (let i = 0; i < 14; i++) w.push(entry('iso', ACTION_ORDER[i % 8] as Position, false))
    const g = gateStatus(w, 200)
    expect(g.scen.map((s) => s.k)).toEqual(['rfi'])
    expect(g.c3).toBe(true)
  })

  it('c4: потрібно щонайменше 8 позицій із нормою', () => {
    const w: RecentEntry[] = []
    // Лише 7 позицій по 15 рук.
    for (const p of ACTION_ORDER.slice(0, 7)) {
      for (let i = 0; i < 16; i++) w.push(entry(SCENARIO_KEYS[i % 4] as Scenario, p, true))
    }
    const g = gateStatus(w, 200)
    expect(g.pos).toHaveLength(7)
    expect(g.c4).toBe(false)
  })

  it('c4: слабка позиція блокує, навіть якщо позицій достатньо', () => {
    const w = passingWindow()
    // Псуємо UTG: перші 15 записів вікна — це саме UTG.
    for (let i = 0; i < 15; i++) w[i] = entry(w[i]!.s, 'UTG', i < 5)
    const g = gateStatus(w, 200)
    expect(g.pos.length).toBeGreaterThanOrEqual(GATE.posCount)
    expect(g.c4).toBe(false)
    expect(g.pos.find((x) => x.k === 'UTG')?.p).toBeLessThan(GATE.acc)
  })

  it('позиція з менш ніж 8 руками у вікні не рахується', () => {
    const w: RecentEntry[] = []
    for (const p of ACTION_ORDER.slice(0, 8)) {
      for (let i = 0; i < 15; i++) w.push(entry(SCENARIO_KEYS[i % 4] as Scenario, p, true))
    }
    // BB з'являється 7 разів і весь час помилково — має бути проігнорований.
    for (let i = 0; i < 7; i++) w.push(entry('vsraise', 'BB', false))
    const g = gateStatus(w, 200)
    expect(g.pos.map((x) => x.k)).not.toContain('BB')
    expect(g.c4).toBe(true)
  })

  it('вікно менше за 100 рук не відкриває нічого, крім c1', () => {
    const w: RecentEntry[] = Array.from({ length: 99 }, (_, i) =>
      entry(SCENARIO_KEYS[i % 4] as Scenario, ACTION_ORDER[i % 8] as Position, true),
    )
    const g = gateStatus(w, 500)
    expect(g.c1).toBe(true)
    expect([g.c2, g.c3, g.c4]).toEqual([false, false, false])
  })
})
