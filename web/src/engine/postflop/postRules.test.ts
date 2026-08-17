import { describe, expect, it } from 'vitest'

import { decideBet } from './matrixBet'
import { decideDefend } from './matrixDefend'
import {
  RULE_TABLES,
  allBetContexts,
  allDefendContexts,
  betRowFor,
  defendRowFor,
} from './postRules'
import { POST_ACT_LABEL, POST_CATEGORIES, TEXTURES, type BoardEvents } from './types'

const QUIET: BoardEvents = { flushClosed: false, boardPaired: false, overcard: false }

const table = (id: string) => {
  const t = RULE_TABLES.find((x) => x.id === id)
  if (!t) throw new Error(`немає таблиці ${id}`)
  return t
}

describe('таблиці правил', () => {
  it('кожна таблиця має заголовок, посилання на спеку і рядки', () => {
    expect(RULE_TABLES.length).toBeGreaterThan(6)
    for (const t of RULE_TABLES) {
      expect(t.title.length, t.title).toBeGreaterThan(5)
      expect(t.source, t.title).toMatch(/§5/)
      expect(t.rows.length, t.title).toBeGreaterThan(0)
      for (const r of t.rows) {
        expect(r.cat.length, `${t.title}: категорія`).toBeGreaterThan(2)
        expect(r.situation.length, `${t.title}/${r.cat}: ситуація`).toBeGreaterThan(2)
        expect(r.action.length, `${t.title}/${r.cat}: дія`).toBeGreaterThan(2)
        expect(r.why.length, `${t.title}/${r.cat}: чому`).toBeGreaterThan(20)
      }
    }
  })

  // Головний тест фази: показане на екрані дорівнює тому, що вирішує матриця —
  // для КОЖНОГО контексту, а не для вибраних прикладів. Якщо матриця почне
  // залежати від виміру, якого таблиця не оголосила, зведення стане
  // неоднорідним і саме тут це вилізе.
  it('дія і пояснення в таблиці збігаються з матрицею для кожного контексту', () => {
    for (const t of RULE_TABLES) {
      if (t.spec.kind === 'bet') {
        for (const c of allBetContexts(t)) {
          const row = betRowFor(t, c)
          const want = decideBet(c)
          expect(row, `${t.id}: нема рядка для ${c.cat}/${c.texture}/${c.ip ? 'ip' : 'oop'}`).toBeDefined()
          expect(row?.action, `${t.id}/${c.cat}`).toBe(POST_ACT_LABEL[want.action])
          expect(row?.why, `${t.id}/${c.cat}`).toBe(want.why)
        }
      } else {
        for (const c of allDefendContexts(t)) {
          const row = defendRowFor(t, c)
          const want = decideDefend(c)
          expect(row, `${t.id}: нема рядка для ${c.cat}/${c.street}/${c.facing}`).toBeDefined()
          expect(row?.action, `${t.id}/${c.cat}`).toBe(POST_ACT_LABEL[want.action])
          expect(row?.why, `${t.id}/${c.cat}`).toBe(want.why)
        }
      }
    }
  })

  it('§5.1а: колер у позиції грає ту саму матрицю, що агресор', () => {
    // Тому окремої таблиці для нього немає — примітка на екрані каже правду.
    for (const cat of POST_CATEGORIES) {
      for (const texture of TEXTURES) {
        const base = {
          street: 'flop',
          cat,
          texture,
          events: QUIET,
          nOpps: 1,
          ip: true,
          delayed: false,
          madeFlush: false,
        } as const
        expect(decideBet({ ...base, line: 'caller' }), `${cat}/${texture}`).toEqual(
          decideBet({ ...base, line: 'aggressor' }),
        )
      }
    }
  })

  it('зведення справді зводить: рядків помітно менше за комбінації', () => {
    // 7 категорій × 3 текстури × 2 позиції = 42 комбінації.
    expect(table('flop-hu').rows.length).toBeLessThan(14)
    // Колер OOP на флопі чекає з будь-якою рукою — це один рядок, не сім.
    expect(table('flop-caller-oop').rows).toHaveLength(1)
  })

  it('на рівері дро-категорій у таблицях немає — вони там не існують', () => {
    for (const id of ['river', 'vs-bet-river']) {
      const cats = table(id).rows.map((r) => r.cat).join(' ')
      expect(cats, id).not.toMatch(/дро/i)
    }
  })

  it('однакові рішення різних категорій зводяться в один рядок', () => {
    // Обидва підтипи STRONG на рівері ставлять 66% з тим самим поясненням —
    // два окремі рядки були б шумом.
    const strong = table('river').rows.filter((r) => r.action === POST_ACT_LABEL.b66)
    expect(strong).toHaveLength(1)
    expect(strong[0]?.cat).toBe('Сильна рука і Сильна пара')
  })
})
