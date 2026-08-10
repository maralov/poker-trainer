import { describe, expect, it } from 'vitest'

import { emptyPreProgress, recordAnswer, type PreProgress } from './progress'
import { buildReport, buildReview, handCat } from './review'
import type { Action, Hand, Position, Scenario } from './types'

/** Прогрес із n однакових помилок. */
function mistakes(
  p: PreProgress,
  scen: Scenario,
  pos: Position,
  hand: Hand,
  correct: Action,
  n: number,
): PreProgress {
  const chosen: Action = correct === 'fold' ? 'raise' : 'fold'
  for (let i = 0; i < n; i++) {
    recordAnswer(p, 0, {
      scen,
      heroPos: pos,
      hand,
      chosen,
      correct,
      drill: false,
      isControl: false,
      at: 1_700_000_000_000 + i,
    })
  }
  return p
}

/** n правильних відповідей — щоб у сценарію був знаменник. */
function correct(p: PreProgress, scen: Scenario, pos: Position, n: number): PreProgress {
  for (let i = 0; i < n; i++) {
    recordAnswer(p, 0, {
      scen,
      heroPos: pos,
      hand: 'AA',
      chosen: 'raise',
      correct: 'raise',
      drill: false,
      isControl: false,
      at: i,
    })
  }
  return p
}

describe('handCat', () => {
  it.each([
    ['AA', 'pairHigh'],
    ['TT', 'pairHigh'],
    ['99', 'pairMid'],
    ['66', 'pairMid'],
    ['55', 'pairLow'],
    ['22', 'pairLow'],
    ['AKs', 'aceSuitedHigh'],
    ['ATs', 'aceSuitedHigh'],
    ['A9s', 'aceSuitedLow'],
    ['A2s', 'aceSuitedLow'],
    ['AKo', 'broadwayOffsuit'],
    ['ATo', 'broadwayOffsuit'],
    ['A9o', 'aceOffsuit'],
    ['A2o', 'aceOffsuit'],
    ['KQs', 'broadwaySuited'],
    ['JTs', 'broadwaySuited'],
    ['98s', 'suitedConn'],
    ['54s', 'suitedConn'],
    ['K5s', 'suitedGap'],
    ['Q8s', 'suitedGap'],
    ['KQo', 'broadwayOffsuit'],
    ['72o', 'trash'],
    ['J8o', 'trash'],
  ])('%s → %s', (hand, cat) => {
    expect(handCat(hand)).toBe(cat)
  })
})

describe('buildReview', () => {
  it('порожній прогрес — нулі, без патернів', () => {
    const r = buildReview(emptyPreProgress(), 'rfi')
    expect(r.played).toBe(0)
    expect(r.mistakes).toBe(0)
    expect(r.findings).toEqual([])
    expect(r.worstGroup).toBeNull()
    expect(r.topMistakes).toEqual([])
  })

  it('рахує точність і напрям перекосу', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'BTN', 90)
    mistakes(p, 'rfi', 'UTG', 'J8o', 'fold', 10)
    const r = buildReview(p, 'rfi')
    expect(r.played).toBe(100)
    expect(r.mistakes).toBe(10)
    expect(r.acc).toBe(90)
    expect(r.loose).toBe(10)
    expect(r.tight).toBe(0)
    expect(r.biasLine).toContain('надто широко')
  })

  it('перекіс у бік зайвих фолдів', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'BTN', 50)
    mistakes(p, 'rfi', 'CO', '65s', 'raise', 10)
    expect(buildReview(p, 'rfi').biasLine).toContain('надто туго')
  })

  it('приблизно рівний перекіс описується як змішаний', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'BTN', 50)
    mistakes(p, 'rfi', 'UTG', 'J8o', 'fold', 5)
    mistakes(p, 'rfi', 'CO', '65s', 'raise', 5)
    expect(buildReview(p, 'rfi').biasLine).toContain('обидва боки')
  })

  it('патерн з’являється від двох випадків і не більше трьох патернів', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'BTN', 100)
    mistakes(p, 'rfi', 'UTG', 'J8o', 'fold', 1) // одна — не патерн
    mistakes(p, 'rfi', 'UTG', 'A5o', 'fold', 4) // aceOffsuit loose
    mistakes(p, 'rfi', 'UTG', 'K5s', 'fold', 3) // suitedGap loose
    mistakes(p, 'rfi', 'UTG', '65s', 'fold', 2) // suitedConn loose
    mistakes(p, 'rfi', 'UTG', 'A3s', 'fold', 2) // aceSuitedLow loose

    const r = buildReview(p, 'rfi')
    expect(r.findings).toHaveLength(3)
    expect(r.findings.map((f) => f.c)).toEqual(['aceOffsuit', 'suitedGap', 'suitedConn'])
    expect(r.findings.every((f) => f.n >= 2 && f.text.length > 0)).toBe(true)
    expect(r.findings.map((f) => f.c)).not.toContain('trash')
  })

  it('патерн без готового тексту не показується', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'BTN', 50)
    // trash/tight — у довіднику порожній рядок.
    mistakes(p, 'rfi', 'UTG', '72o', 'raise', 5)
    expect(buildReview(p, 'rfi').findings).toEqual([])
  })

  it('знаходить найслабшу групу позицій і напрям її помилок', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'BTN', 50)
    mistakes(p, 'rfi', 'UTG', 'A5o', 'fold', 6)
    mistakes(p, 'rfi', 'CO', '65s', 'raise', 2)
    const r = buildReview(p, 'rfi')
    expect(r.worstGroup?.g).toBe('early')
    expect(r.worstGroup?.bias).toBe('loose')
    expect(r.worstGroup?.n).toBe(6)
    expect(r.worstGroup?.text).toContain('ранніх позиціях')
  })

  it('топ помилок відсортований і обмежений вісьмома', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'BTN', 200)
    const hands: Hand[] = ['A5o', 'K5s', '65s', 'A3s', 'J8o', 'Q6o', 'T7o', '94o', '83o', '72o']
    hands.forEach((h, i) => mistakes(p, 'rfi', 'UTG', h, 'fold', hands.length - i))
    const r = buildReview(p, 'rfi')
    expect(r.topMistakes).toHaveLength(8)
    expect(r.topMistakes[0]?.hand).toBe('A5o')
    expect(r.topMistakes[0]?.n).toBe(10)
    expect(r.topMistakes.map((m) => m.n)).toEqual([10, 9, 8, 7, 6, 5, 4, 3])
  })

  it('назва правильної дії залежить від сценарію', () => {
    const p = emptyPreProgress()
    mistakes(p, 'vsraise', 'BTN', 'AA', 'raise', 2)
    expect(buildReview(p, 'vsraise').topMistakes[0]?.correct).toBe('3-бет')

    const p2 = emptyPreProgress()
    mistakes(p2, 'vs3bet', 'BTN', 'AA', 'raise', 2)
    expect(buildReview(p2, 'vs3bet').topMistakes[0]?.correct).toBe('4-бет')

    const p3 = emptyPreProgress()
    mistakes(p3, 'iso', 'BTN', 'AA', 'raise', 2)
    expect(buildReview(p3, 'iso').topMistakes[0]?.correct).toBe('ізо-рейз')
  })

  it('позиції рахуються СУВОРО в межах сценарію', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'UTG', 10)
    mistakes(p, 'iso', 'UTG', 'A5o', 'fold', 10)

    const rfi = buildReview(p, 'rfi').byPosition.find((x) => x.pos === 'UTG')
    const iso = buildReview(p, 'iso').byPosition.find((x) => x.pos === 'UTG')
    expect(rfi).toEqual({ pos: 'UTG', acc: 100, t: 10 })
    expect(iso).toEqual({ pos: 'UTG', acc: 0, t: 10 })
  })

  it('позиція без зіграних рук показує null, а не нуль', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'UTG', 5)
    const bb = buildReview(p, 'rfi').byPosition.find((x) => x.pos === 'BB')
    expect(bb).toEqual({ pos: 'BB', acc: null, t: 0 })
  })

  it('журнал іншого сценарію не потрапляє в розбір', () => {
    const p = emptyPreProgress()
    mistakes(p, 'rfi', 'UTG', 'A5o', 'fold', 3)
    mistakes(p, 'iso', 'CO', 'K5s', 'fold', 7)
    expect(buildReview(p, 'rfi').mistakes).toBe(3)
    expect(buildReview(p, 'iso').mistakes).toBe(7)
  })
})

describe('buildReport', () => {
  it('містить заголовок, точність за позиціями і список помилок', () => {
    const p = emptyPreProgress()
    correct(p, 'rfi', 'BTN', 8)
    mistakes(p, 'rfi', 'UTG', 'A5o', 'fold', 2)
    const report = buildReport(p, 'rfi')

    expect(report).toContain('ЗВІТ · ПРЕФЛОП · сценарій: Відкриття')
    expect(report).toContain('Зіграно: 10 · точність: 80% · помилок: 2')
    expect(report).toContain('Зайвих відкриттів: 2 · зайвих фолдів: 0')
    expect(report).toContain('  UTG: 0% (2)')
    expect(report).toContain('  BTN: 100% (8)')
    expect(report).toContain('  A5o / UTG / фолд / 2x')
  })

  it('без даних по позиціях пише прямо про це', () => {
    expect(buildReport(emptyPreProgress(), 'rfi')).toContain('(немає даних)')
  })

  it('обмежує список 25 рядками', () => {
    const p = emptyPreProgress()
    for (let i = 0; i < 30; i++) {
      mistakes(p, 'rfi', 'UTG', `${'AKQJT98765432'[i % 13]}${'2345'[i % 4]}o` as Hand, 'fold', 1)
    }
    const rows = buildReport(p, 'rfi')
      .split('\n')
      .filter((l) => l.includes(' / фолд / '))
    expect(rows.length).toBeLessThanOrEqual(25)
  })
})
