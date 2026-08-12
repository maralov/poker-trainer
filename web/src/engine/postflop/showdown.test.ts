import { describe, expect, it } from 'vitest'

import { VAL, SUITS } from '../cards'
import { RANKS, type Card, type Rank } from '../types'
import { RANK_LABEL, compareRank, rank7, showdownWinners } from './showdown'

const SUIT_CODES = ['s', 'h', 'd', 'c']

function card(code: string): Card {
  const rk = code[0] as Rank
  const s = SUIT_CODES.indexOf(code[1] ?? '')
  const suit = SUITS[s]
  if (!RANKS.includes(rk) || suit === undefined) throw new Error(`невалідна карта ${code}`)
  return { rk, v: VAL[rk], s, g: suit.g, red: suit.red }
}

const cards = (codes: string): Card[] => codes.match(/.{2}/g)?.map(card) ?? []

describe('rank7', () => {
  it.each([
    ['AsKsQsJsTs2c3d', 8, 'стріт-флеш'],
    ['7s7h7d7cKs2d3h', 7, 'каре'],
    ['7s7h7dKsKh2d3c', 6, 'фул-хаус'],
    ['As9s7s4s2s8h3d', 5, 'флеш'],
    ['9s8h7d6c5s2d3h', 4, 'стріт'],
    ['7s7h7dKs9c4d2h', 3, 'трійка'],
    ['7s7hKsKc9d4h2s', 2, 'дві пари'],
    ['7s7hKc9d4h2s3c', 1, 'пара'],
    ['AsKc9d7h4s3c2d', 0, 'старша карта'],
  ])('%s → %i (%s)', (codes, cat, label) => {
    const r = rank7(cards(codes))
    expect(r.cat).toBe(cat)
    expect(RANK_LABEL[cat]).toBe(label)
  })

  it('колесо A2345 — стріт від туза знизу', () => {
    expect(rank7(cards('As2h3d4c5sKdQh')).cat).toBe(4)
  })

  it('серед двох стрітів рахується старший', () => {
    const high = rank7(cards('Th9h8s7d6c5h2d'))
    const low = rank7(cards('9h8s7d6c5h2d3c'))
    expect(compareRank(high, low)).toBeGreaterThan(0)
  })

  it('два трипси дають фул-хаус зі старшим трипсом', () => {
    const r = rank7(cards('7s7h7dKsKhKc2d'))
    expect(r.cat).toBe(6)
    expect(r.tie[0]).toBe(VAL['K'])
    expect(r.tie[1]).toBe(VAL['7'])
  })

  it('три пари: рахуються дві старші, третя йде в кікери', () => {
    const r = rank7(cards('KsKh9s9d4c4h2s'))
    expect(r.cat).toBe(2)
    expect(r.tie).toEqual([VAL['K'], VAL['9'], VAL['4']])
  })
})

describe('compareRank', () => {
  it('вища категорія бʼє нижчу', () => {
    expect(compareRank(rank7(cards('7s7h7dKs9c4d2h')), rank7(cards('7s7hKc9d4h2s3c')))).toBeGreaterThan(0)
  })

  it('однакова категорія — вирішує кікер', () => {
    const withAce = rank7(cards('7s7hAc9d4h2s3c'))
    const withKing = rank7(cards('7s7hKc9d4h2s3c'))
    expect(compareRank(withAce, withKing)).toBeGreaterThan(0)
  })

  it('повністю однакові руки — нічия', () => {
    expect(compareRank(rank7(cards('7s7hKc9d4h2s3c')), rank7(cards('7d7cKh9s4d2h3s')))).toBe(0)
  })
})

describe('showdownWinners', () => {
  const board = cards('Ks7d2c9h4s')

  it('повертає індекс сильнішої руки', () => {
    expect(showdownWinners([cards('AsKh'), cards('QsJd')], board)).toEqual([0])
  })

  it('спліт — обидва індекси', () => {
    expect(showdownWinners([cards('AsQh'), cards('AdQc')], board)).toEqual([0, 1])
  })

  it('три учасники, виграє один', () => {
    expect(showdownWinners([cards('2s2h'), cards('KcKh'), cards('QsJd')], board)).toEqual([1])
  })

  it('«борд грає»: найкраща пʼятірка цілком на борді — усі ділять банк', () => {
    // Стріт від 5 до 9 лежить прямо на борді; жодна з рук не покращує його.
    const straightBoard = cards('9h8s7d6c5h')
    expect(
      showdownWinners([cards('2s3h'), cards('KcQd'), cards('4h4c')], straightBoard),
    ).toEqual([0, 1, 2])
  })

  it('стріт-флеш проти каре — стріт-флеш сильніший', () => {
    // Борд: трипс 7 плюс дві піки (8s9s). Опонент добирає четверту сімку —
    // каре. Герой замість цього добирає 6s5s і збирає стріт-флеш пік 5-9.
    // Каре й стріт-флеш не можуть співіснувати в одних 7 картах (масть із
    // каре лишає щонайбільше 4 карти тієї самої масті), тому валідно
    // порівняти їх можна лише на різних руках проти спільного борду.
    const trips7Board = cards('7s7h7d8s9s')
    expect(showdownWinners([cards('6s5s'), cards('7c2h')], trips7Board)).toEqual([0])
  })
})

describe('rank7 — додаткові ризиковані кейси', () => {
  it('флеш із шести карт однієї масті бере найстарші пʼять', () => {
    // Шість пік: Q J T 9 7 5 — найкраща пʼятірка Q-J-T-9-7, найменша (5) відкидається.
    const r = rank7(cards('QsJsTs9s7s5s2h'))
    expect(r.cat).toBe(5)
    expect(r.tie).toEqual([VAL['Q'], VAL['J'], VAL['T'], VAL['9'], VAL['7']])
  })

  it('спліт за стріт-флешем: обидва впираються в один і той самий пік-стріт борду', () => {
    const board = cards('5s6s7s8s9s')
    expect(showdownWinners([cards('2h3h'), cards('KdQd')], board)).toEqual([0, 1])
  })

  it('колесо серед двох стрітів програє шестивисокому стріту', () => {
    const wheel = rank7(cards('As2h3d4c5sKdQh'))
    const sixHigh = rank7(cards('2s3h4d5c6hKdQc'))
    expect(compareRank(sixHigh, wheel)).toBeGreaterThan(0)
  })

  it('квінти на борді з кікером: сильніший кікер серед решти карт виграє', () => {
    // Каре двійок на борді; кікер — найвища з трьох карт поза каре (King у героя проти Ten у суперника).
    const quadsBoard = cards('2s2h2d2cKh')
    expect(showdownWinners([cards('AcQc'), cards('TdTh')], quadsBoard)).toEqual([0])
  })
})
