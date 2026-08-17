import { describe, expect, it } from 'vitest'

import { decideDefend } from './matrixDefend'
import { POST_CATEGORIES, type PostCategory } from './types'

const ctx = (over: Partial<Parameters<typeof decideDefend>[0]> = {}): Parameters<typeof decideDefend>[0] => ({
  street: 'flop',
  facing: 'small_bet',
  cat: 'AIR',
  nOpps: 1,
  repeatAggro: false,
  vsCbet: false,
  ...over,
})

describe('проти ставки · флоп і терн · §5.5', () => {
  it('дві пари й краще рейзять малу ставку і коллять велику', () => {
    expect(decideDefend(ctx({ cat: 'STRONG_MADE', facing: 'small_bet' })).action).toBe('raise')
    expect(decideDefend(ctx({ cat: 'STRONG_MADE', facing: 'big_bet' })).action).toBe('call')
  })

  it('одна пара — один колл, друга куля її вбиває', () => {
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', facing: 'small_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', facing: 'big_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', repeatAggro: true })).action).toBe('fold')
  })

  it('дро платить дешево на флопі, але не велику ставку на терні', () => {
    expect(decideDefend(ctx({ cat: 'DRAW', facing: 'small_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'DRAW', facing: 'big_bet', street: 'flop' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'DRAW', facing: 'big_bet', street: 'turn' })).action).toBe('fold')
  })

  it('середня рука витримує дешеву ставку лише на флопі', () => {
    expect(decideDefend(ctx({ cat: 'MEDIUM', facing: 'small_bet', street: 'flop' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'MEDIUM', facing: 'small_bet', street: 'turn' })).action).toBe('fold')
    expect(decideDefend(ctx({ cat: 'MEDIUM', facing: 'big_bet' })).action).toBe('fold')
  })

  it('слабка пара, слабке дро й порожньо фолдять завжди', () => {
    for (const cat of ['WEAK', 'WEAKDRAW', 'AIR'] as PostCategory[]) {
      for (const facing of ['small_bet', 'big_bet'] as const) {
        expect(decideDefend(ctx({ cat, facing })).action, `${cat} vs ${facing}`).toBe('fold')
      }
    }
  })
})

describe('проти ставки · рівер · §5.5', () => {
  it('дві пари й краще коллять усе', () => {
    expect(decideDefend(ctx({ street: 'river', cat: 'STRONG_MADE', facing: 'big_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ street: 'river', cat: 'STRONG_MADE', repeatAggro: true })).action).toBe('call')
  })

  it('одна пара ловить лише дешевий блеф', () => {
    expect(decideDefend(ctx({ street: 'river', cat: 'STRONG_PAIR', facing: 'small_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ street: 'river', cat: 'STRONG_PAIR', facing: 'big_bet' })).action).toBe('fold')
  })

  it('усе, слабше за одну пару, фолдить: пасивні рівер не блефують', () => {
    for (const cat of ['MEDIUM', 'WEAK', 'AIR'] as PostCategory[]) {
      expect(decideDefend(ctx({ street: 'river', cat, facing: 'small_bet' })).action).toBe('fold')
    }
  })
})

describe('проти рейзу · §5.6', () => {
  it('дві пари й краще коллять на всіх вулицях', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      expect(decideDefend(ctx({ street, facing: 'raise', cat: 'STRONG_MADE' })).action).toBe('call')
    }
  })

  it('одна пара платить рейз лише на флопі', () => {
    expect(decideDefend(ctx({ facing: 'raise', cat: 'STRONG_PAIR', street: 'flop' })).action).toBe('call')
    expect(decideDefend(ctx({ facing: 'raise', cat: 'STRONG_PAIR', street: 'turn' })).action).toBe('fold')
    expect(decideDefend(ctx({ facing: 'raise', cat: 'STRONG_PAIR', street: 'river' })).action).toBe('fold')
  })

  it('дро платить рейз лише на флопі', () => {
    expect(decideDefend(ctx({ facing: 'raise', cat: 'DRAW', street: 'flop' })).action).toBe('call')
    expect(decideDefend(ctx({ facing: 'raise', cat: 'DRAW', street: 'turn' })).action).toBe('fold')
  })
})

describe('мультивей-модифікатор', () => {
  it('продовжують лише дві пари; одна пара — тільки проти малої першої', () => {
    expect(decideDefend(ctx({ cat: 'STRONG_MADE', nOpps: 2, facing: 'big_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', nOpps: 2, facing: 'small_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', nOpps: 2, facing: 'big_bet' })).action).toBe('fold')
    expect(decideDefend(ctx({ cat: 'DRAW', nOpps: 2, facing: 'small_bet' })).action).toBe('fold')
  })
})

describe('проти c-bet агресора · флоп · §5.4', () => {
  const cbet = (over: Partial<Parameters<typeof decideDefend>[0]> = {}) =>
    decideDefend(ctx({ vsCbet: true, ...over }))

  it('дві пари й краще рейзять будь-який сайз — банк будуємо одразу', () => {
    expect(cbet({ cat: 'STRONG_MADE', facing: 'small_bet' }).action).toBe('raise')
    expect(cbet({ cat: 'STRONG_MADE', facing: 'big_bet' }).action).toBe('raise')
  })

  it('одна пара рейзить малу ставку, але проти великої лише колле', () => {
    expect(cbet({ cat: 'STRONG_PAIR', facing: 'small_bet' }).action).toBe('raise')
    expect(cbet({ cat: 'STRONG_PAIR', facing: 'big_bet' }).action).toBe('call')
  })

  it('дро колле обидва сайзи — ціна плюс імплайди', () => {
    expect(cbet({ cat: 'DRAW', facing: 'small_bet' }).action).toBe('call')
    expect(cbet({ cat: 'DRAW', facing: 'big_bet' }).action).toBe('call')
  })

  it('середня рука витримує дешевий c-bet, велику ставку — ні', () => {
    expect(cbet({ cat: 'MEDIUM', facing: 'small_bet' }).action).toBe('call')
    expect(cbet({ cat: 'MEDIUM', facing: 'big_bet' }).action).toBe('fold')
  })

  it('слабка пара, слабке дро й повітря фолдять навіть проти широкого c-bet', () => {
    for (const cat of ['WEAK', 'WEAKDRAW', 'AIR'] as PostCategory[]) {
      for (const facing of ['small_bet', 'big_bet'] as const) {
        expect(cbet({ cat, facing }).action, `${cat} vs ${facing}`).toBe('fold')
      }
    }
  })

  // Саме тут §5.4 розходиться з §5.5 — тест стереже, що прапорець реально
  // перемикає матрицю, а не просто передається далі.
  it('без прапорця ті самі споти грають за §5.5', () => {
    expect(decideDefend(ctx({ cat: 'STRONG_MADE', facing: 'big_bet' })).action).toBe('call')
    expect(decideDefend(ctx({ cat: 'STRONG_PAIR', facing: 'small_bet' })).action).toBe('call')
  })

  it('рейз опонента лишається §5.6 навіть у лінії колера', () => {
    expect(cbet({ cat: 'STRONG_PAIR', facing: 'raise', street: 'turn' }).action).toBe('fold')
  })

  it('кожна категорія має рішення з непорожнім поясненням', () => {
    for (const cat of POST_CATEGORIES) {
      for (const facing of ['small_bet', 'big_bet'] as const) {
        const d = cbet({ cat, facing })
        expect(['fold', 'call', 'raise'], `${cat}/${facing}`).toContain(d.action)
        expect(d.why.length, `${cat}/${facing}`).toBeGreaterThan(20)
      }
    }
  })
})

describe('інваріанти', () => {
  it('кожна досяжна комбінація має рішення з непорожнім поясненням', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const facing of ['small_bet', 'big_bet', 'raise'] as const) {
        for (const cat of POST_CATEGORIES) {
          for (const nOpps of [1, 2]) {
            for (const repeatAggro of [false, true]) {
              const d = decideDefend({ street, facing, cat, nOpps, repeatAggro, vsCbet: false })
              expect(['fold', 'call', 'raise'], `${street}/${facing}/${cat}`).toContain(d.action)
              expect(d.why.length, `${street}/${facing}/${cat}`).toBeGreaterThan(20)
            }
          }
        }
      }
    }
  })

  it('дві пари й краще ніколи не фолдять', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const facing of ['small_bet', 'big_bet', 'raise'] as const) {
        expect(
          decideDefend({ street, facing, cat: 'STRONG_MADE', nOpps: 1, repeatAggro: true, vsCbet: false })
            .action,
        ).not.toBe('fold')
      }
    }
  })

  it('порожня рука ніколи не колле ставку', () => {
    for (const street of ['flop', 'turn', 'river'] as const) {
      for (const facing of ['small_bet', 'big_bet', 'raise'] as const) {
        expect(
          decideDefend({ street, facing, cat: 'AIR', nOpps: 1, repeatAggro: false, vsCbet: false })
            .action,
        ).toBe('fold')
      }
    }
  })
})
