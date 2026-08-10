/**
 * Дані зі старого localStorage — недовірені. Ці тести фіксують, що імпорт
 * приймає валідний прогрес і мовчки відкидає сміття, а не падає на ньому.
 */

import { describe, expect, it } from 'vitest'

import { LEGACY_KEY, parseLegacy, readLegacy } from './legacyImport'

/** Прогрес у форматі standalone-версії. */
const legacyFixture = {
  pre: {
    total: 120,
    correct: 96,
    best: 14,
    byPos: { UTG: { t: 20, c: 15 }, BTN: { t: 30, c: 28 } },
    byScen: { rfi: { t: 80, c: 66 }, iso: { t: 40, c: 30 } },
    byScenPos: { rfi: { UTG: { t: 20, c: 15 } } },
    missed: { 'rfi|UTG|A5o': 4, 'rfi|BTN|72o': 2 },
    log: [
      { s: 'rfi', p: 'UTG', h: 'A5o', ch: 'raise', co: 'fold', t: 1700000000000 },
      { s: 'iso', p: 'CO', h: 'K5s', ch: 'fold', co: 'raise', t: 1700000000001 },
    ],
    recent: [
      { s: 'rfi', p: 'UTG', ok: 1 },
      { s: 'rfi', p: 'BTN', ok: 0 },
    ],
    drill: {
      streaks: { 'rfi|UTG|A5o': 3 },
      recent: { rfi: [1, 1, 0, 1] },
    },
  },
  post: { unlocked: true, seen: true, total: 40, correct: 30 },
}

describe('parseLegacy', () => {
  it('переносить прогрес зі standalone-версії', () => {
    const r = parseLegacy(JSON.stringify(legacyFixture))
    expect(r).not.toBeNull()
    if (!r) return

    expect(r.pre.total).toBe(120)
    expect(r.pre.correct).toBe(96)
    expect(r.pre.best).toBe(14)
    expect(r.pre.byPos).toEqual({ UTG: { t: 20, c: 15 }, BTN: { t: 30, c: 28 } })
    expect(r.pre.byScenPos['rfi']?.['UTG']).toEqual({ t: 20, c: 15 })
    expect(r.pre.missed).toEqual({ 'rfi|UTG|A5o': 4, 'rfi|BTN|72o': 2 })
    expect(r.pre.log).toHaveLength(2)
    expect(r.pre.recent).toHaveLength(2)
    expect(r.pre.drill.streaks['rfi|UTG|A5o']).toBe(3)
    expect(r.pre.drill.recent['rfi']).toEqual([1, 1, 0, 1])
    expect(r.postUnlocked).toBe(true)
    expect(r.importedMistakes).toBe(2)
  })

  it('відкидає невалідний JSON', () => {
    expect(parseLegacy('{')).toBeNull()
    expect(parseLegacy('')).toBeNull()
    expect(parseLegacy('null')).toBeNull()
    expect(parseLegacy('[1,2,3]')).toBeNull()
    expect(parseLegacy('"рядок"')).toBeNull()
  })

  it('відкидає об’єкт без секції pre', () => {
    expect(parseLegacy(JSON.stringify({ post: { unlocked: true } }))).toBeNull()
  })

  it('порожній прогрес не вважається вартим імпорту', () => {
    const empty = { pre: { total: 0, log: [], recent: [] } }
    expect(parseLegacy(JSON.stringify(empty))).toBeNull()
  })

  it('відкидає записи журналу з невідомими позиціями, руками і діями', () => {
    const dirty = {
      pre: {
        total: 5,
        log: [
          { s: 'rfi', p: 'UTG', h: 'A5o', ch: 'raise', co: 'fold', t: 1 },
          { s: 'rfi', p: 'DEALER', h: 'A5o', ch: 'raise', co: 'fold', t: 2 },
          { s: 'holdem', p: 'UTG', h: 'A5o', ch: 'raise', co: 'fold', t: 3 },
          { s: 'rfi', p: 'UTG', h: 'ZZZ', ch: 'raise', co: 'fold', t: 4 },
          { s: 'rfi', p: 'UTG', h: 'A5o', ch: 'shove', co: 'fold', t: 5 },
          { s: 'rfi', p: 'UTG', h: 'AAs', ch: 'raise', co: 'fold', t: 6 },
          'не об’єкт',
          null,
        ],
      },
    }
    const r = parseLegacy(JSON.stringify(dirty))
    expect(r?.pre.log).toHaveLength(1)
    expect(r?.pre.log[0]?.h).toBe('A5o')
  })

  it('відкидає пошкоджені ключі missed і streaks', () => {
    const dirty = {
      pre: {
        total: 5,
        missed: { 'rfi|UTG|A5o': 4, 'rfi|UTG': 2, 'bad|UTG|A5o': 1, 'rfi|UTG|ZZZ': 3 },
        drill: { streaks: { 'rfi|UTG|A5o': 2, 'rfi|NOPE|A5o': 9 }, recent: { bad: [1] } },
      },
    }
    const r = parseLegacy(JSON.stringify(dirty))
    expect(r?.pre.missed).toEqual({ 'rfi|UTG|A5o': 4 })
    expect(r?.pre.drill.streaks).toEqual({ 'rfi|UTG|A5o': 2 })
    expect(r?.pre.drill.recent).toEqual({})
  })

  it('лагодить неможливі числа замість того, щоб падати', () => {
    const weird = {
      pre: {
        total: -5,
        correct: 999,
        best: 'багато',
        byPos: { UTG: { t: 10, c: 50 }, BTN: { t: 0, c: 0 }, XX: { t: 5, c: 5 } },
        log: [{ s: 'rfi', p: 'UTG', h: 'A5o', ch: 'raise', co: 'fold', t: 'вчора' }],
      },
    }
    const r = parseLegacy(JSON.stringify(weird))
    expect(r?.pre.total).toBe(0)
    expect(r?.pre.correct).toBe(0)
    expect(r?.pre.best).toBe(0)
    // c не може перевищувати t; порожні та невідомі позиції відкидаються.
    expect(r?.pre.byPos).toEqual({ UTG: { t: 10, c: 10 } })
    expect(r?.pre.log[0]?.t).toBe(0)
  })

  it('post.unlocked відсутній — етап лишається закритим', () => {
    const r = parseLegacy(JSON.stringify({ pre: { total: 10 }, post: {} }))
    expect(r?.postUnlocked).toBe(false)
  })
})

describe('readLegacy', () => {
  const fakeStorage = (data: Record<string, string>): Storage =>
    ({
      getItem: (k: string) => data[k] ?? null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    }) as unknown as Storage

  it('читає старий ключ', () => {
    const s = fakeStorage({ [LEGACY_KEY]: JSON.stringify(legacyFixture) })
    expect(readLegacy(s)?.pre.total).toBe(120)
  })

  it('без старого ключа повертає null', () => {
    expect(readLegacy(fakeStorage({}))).toBeNull()
  })

  it('недоступне сховище не ламає запуск', () => {
    const broken = {
      getItem: () => {
        throw new DOMException('SecurityError')
      },
    } as unknown as Storage
    expect(readLegacy(broken)).toBeNull()
  })
})
