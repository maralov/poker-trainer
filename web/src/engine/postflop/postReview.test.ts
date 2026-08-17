import { describe, expect, it } from 'vitest'

import { emptyPostProgress, type PostMistakeEntry, type PostProgress } from './postProgress'
import { POST_FIX, buildPostReport, buildPostReview, classifyPostMistake } from './postReview'
import type { PostFixKey } from './postReview'

const entry = (over: Partial<PostMistakeEntry> = {}): PostMistakeEntry => ({
  street: 'flop',
  cat: 'AIR',
  tex: 'DRY',
  facing: 'none',
  n: 1,
  ip: 1,
  ch: 'b33',
  co: 'check',
  t: 1000,
  ...over,
})

const progress = (log: readonly PostMistakeEntry[], total = 40): PostProgress => ({
  ...emptyPostProgress(),
  total,
  correct: total - log.length,
  log: [...log],
})

describe('classifyPostMistake · контекст «можу ставити»', () => {
  const cases: [string, Partial<PostMistakeEntry>, PostFixKey][] = [
    ['блеф у мультипоті', { n: 3, cat: 'AIR' }, 'bluffMulti'],
    ['блеф на мокрій', { cat: 'AIR', tex: 'WET' }, 'bluffWet'],
    ['блеф поза позицією на сухій', { cat: 'WEAKDRAW', tex: 'DRY', ip: 0 }, 'bluffOOP'],
    ['ставка середньою рукою', { cat: 'MEDIUM', tex: 'WET' }, 'thinBet'],
    ['ставка слабкою парою', { cat: 'WEAK' }, 'weakBet'],
    ['пропущене валью', { ch: 'check', co: 'b66', cat: 'STRONG_MADE' }, 'missValue'],
    ['замалий сайз', { ch: 'b33', co: 'b66', cat: 'STRONG_MADE' }, 'sizeSmall'],
    ['завеликий сайз', { ch: 'b66', co: 'b33', cat: 'STRONG_MADE' }, 'sizeBig'],
    ['барель без еквіті', { street: 'turn', cat: 'WEAKDRAW' }, 'barrelNoEquity'],
    ['блеф рівера', { street: 'river', cat: 'AIR' }, 'riverBluff'],
  ]

  for (const [name, over, want] of cases) {
    it(name, () => {
      expect(classifyPostMistake(entry(over))).toBe(want)
    })
  }

  it('блеф рівера важливіший за мультипот — це головний урок етапу', () => {
    expect(classifyPostMistake(entry({ street: 'river', n: 3, cat: 'AIR' }))).toBe('riverBluff')
  })
})

describe('classifyPostMistake · контекст захисту', () => {
  const cases: [string, Partial<PostMistakeEntry>, PostFixKey][] = [
    [
      'стек однією парою',
      { facing: 'big_bet', cat: 'STRONG_PAIR', ch: 'call', co: 'fold' },
      'stackOnePair',
    ],
    ['колл без руки', { facing: 'small_bet', cat: 'WEAK', ch: 'call', co: 'fold' }, 'callTooWide'],
    [
      'фолд сили',
      { facing: 'small_bet', cat: 'STRONG_MADE', ch: 'fold', co: 'raise' },
      'foldStrength',
    ],
    ['фолд дро за ціною', { facing: 'small_bet', cat: 'DRAW', ch: 'fold', co: 'call' }, 'foldStrength'],
    [
      'зайвий фолд середньої',
      { facing: 'small_bet', cat: 'MEDIUM', ch: 'fold', co: 'call' },
      'foldTooTight',
    ],
    ['рейз проти сили', { facing: 'big_bet', cat: 'STRONG_MADE', ch: 'raise', co: 'call' }, 'raiseIntoStrength'],
    [
      'пропущений рейз валью',
      { facing: 'small_bet', cat: 'STRONG_MADE', ch: 'call', co: 'raise' },
      'missValue',
    ],
  ]

  for (const [name, over, want] of cases) {
    it(name, () => {
      expect(classifyPostMistake(entry(over))).toBe(want)
    })
  }
})

describe('POST_FIX', () => {
  it('кожен патерн має назву і пояснення, що робити', () => {
    for (const [key, fix] of Object.entries(POST_FIX)) {
      expect(fix.title.length, key).toBeGreaterThan(4)
      expect(fix.text.length, key).toBeGreaterThan(60)
    }
  })
})

describe('buildPostReview', () => {
  it('порожній журнал не вигадує патернів', () => {
    const r = buildPostReview(emptyPostProgress())
    expect(r.mistakes).toBe(0)
    expect(r.findings).toHaveLength(0)
    expect(r.topMistakes).toHaveLength(0)
  })

  it('патерн зʼявляється від двох випадків і сортується за частотою', () => {
    const log = [
      ...Array.from({ length: 4 }, () => entry({ street: 'river', cat: 'AIR' })),
      ...Array.from({ length: 2 }, () => entry({ n: 3 })),
      entry({ cat: 'WEAK' }),
    ]
    const r = buildPostReview(progress(log))

    expect(r.findings.map((f) => f.key)).toEqual(['riverBluff', 'bluffMulti'])
    expect(r.findings[0]?.n).toBe(4)
    // Одиничний випадок — ще не патерн.
    expect(r.findings.some((f) => f.key === 'weakBet')).toBe(false)
  })

  it('показує не більше трьох патернів', () => {
    const log = [
      ...Array.from({ length: 4 }, () => entry({ street: 'river', cat: 'AIR' })),
      ...Array.from({ length: 3 }, () => entry({ n: 3 })),
      ...Array.from({ length: 3 }, () => entry({ cat: 'WEAK' })),
      ...Array.from({ length: 2 }, () => entry({ cat: 'MEDIUM', tex: 'WET' })),
    ]
    expect(buildPostReview(progress(log)).findings).toHaveLength(3)
  })

  it('точність рахується від зіграних рішень, а не від довжини журналу', () => {
    const r = buildPostReview(progress([entry(), entry()], 50))
    expect(r.played).toBe(50)
    expect(r.acc).toBe(96)
  })

  it('топ помилок групує однакові споти й носить руку з бордом, якщо вона є', () => {
    const log = [
      entry({ cat: 'STRONG_PAIR', street: 'turn', facing: 'big_bet', ch: 'call', co: 'fold' }),
      entry({
        cat: 'STRONG_PAIR',
        street: 'turn',
        facing: 'big_bet',
        ch: 'call',
        co: 'fold',
        board: 'Ks7d2c9h',
        hand: 'AKs',
        ep: 'episode-1',
      }),
    ]
    const top = buildPostReview(progress(log)).topMistakes
    expect(top).toHaveLength(1)
    expect(top[0]?.n).toBe(2)
    expect(top[0]?.hand).toBe('AKs')
    expect(top[0]?.board).toBe('Ks7d2c9h')
    expect(top[0]?.ep).toBe('episode-1')
  })

  it('найслабший зріз береться лише з достатньої вибірки', () => {
    const p = progress([entry()], 40)
    p.byStreet = { flop: { t: 30, c: 27 }, river: { t: 12, c: 3 } }
    // Зріз із трьох рішень не має ставати «найслабшим місцем» через випадковість.
    p.byCat = { AIR: { t: 3, c: 0 } }

    const worst = buildPostReview(p).worstSlice
    expect(worst?.name).toBe('рівер')
    expect(worst?.acc).toBe(25)
  })
})

describe('buildPostReport', () => {
  it('звіт містить підсумок, патерни й топ помилок', () => {
    const log = [
      ...Array.from({ length: 3 }, () => entry({ street: 'river', cat: 'AIR' })),
      entry({ cat: 'WEAK' }),
    ]
    const text = buildPostReport(progress(log))

    expect(text).toMatch(/ЗВІТ · ПОСТФЛОП/)
    expect(text).toMatch(/Зіграно: 40/)
    expect(text).toMatch(/Блеф рівера/)
    expect(text).toMatch(/3x/)
  })

  it('порожній журнал дає честний короткий звіт, а не порожні розділи', () => {
    expect(buildPostReport(emptyPostProgress())).toMatch(/немає даних/)
  })
})
