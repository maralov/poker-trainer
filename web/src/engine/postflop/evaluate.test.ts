/**
 * Флоп-частина оцінювача — порт із poker-trainer.html, тож головний тест тут
 * не про «правильний покер», а про побайтову рівність референсу.
 */

import { describe, expect, it } from 'vitest'

import { RANKS, type Card, type Rank } from '../types'
import { VAL, SUITS } from '../cards'
import refPostflop from '../__fixtures__/ref-postflop.json'
import { boardEvents, evalHand, texture } from './evaluate'
import { isStrong, type PostCategory } from './types'

interface RefCase {
  hole: string[]
  board: string[]
  cat: string
  label: string
  tex: string
  texLabel: string
  nOpp: number
  ip: boolean
  decide: string
}

const fixtures = refPostflop as unknown as RefCase[]

const SUIT_CODES = ['s', 'h', 'd', 'c']

/** 'Ks' → Card. Та сама форма, що у makeDeck. */
function card(code: string): Card {
  const rk = code[0] as Rank
  const s = SUIT_CODES.indexOf(code[1] ?? '')
  const suit = SUITS[s]
  if (!RANKS.includes(rk) || suit === undefined) throw new Error(`невалідна карта ${code}`)
  return { rk, v: VAL[rk], s, g: suit.g, red: suit.red }
}

/** '2-символьні коди підряд' → Card[]. Спільний хелпер для всіх ручних кейсів нижче. */
const cards = (codes: string): Card[] => codes.match(/.{2}/g)?.map(card) ?? []

/** Наша категорія до форми референсу: розщеплення STRONG — наше доповнення. */
const toRef = (c: PostCategory): string => (isStrong(c) ? 'STRONG' : c)

describe('еквівалентність референсу · флоп', () => {
  it('еталон не порожній', () => {
    expect(fixtures.length).toBeGreaterThan(1000)
  })

  it('категорія руки збігається з референсом на всіх кейсах', () => {
    fixtures.forEach((ref, i) => {
      const ev = evalHand(ref.hole.map(card), ref.board.map(card))
      expect(toRef(ev.cat), `кейс ${i}: ${ref.hole.join('')} на ${ref.board.join('')}`).toBe(ref.cat)
    })
  })

  it('опис руки збігається з референсом на всіх кейсах', () => {
    fixtures.forEach((ref, i) => {
      const ev = evalHand(ref.hole.map(card), ref.board.map(card))
      expect(ev.label, `кейс ${i}: ${ref.hole.join('')} на ${ref.board.join('')}`).toBe(ref.label)
    })
  })

  it('текстура збігається з референсом на всіх кейсах', () => {
    fixtures.forEach((ref, i) => {
      const tx = texture(ref.board.map(card))
      expect(tx.t, `кейс ${i}: ${ref.board.join('')}`).toBe(ref.tex)
      expect(tx.label).toBe(ref.texLabel)
    })
  })
})

describe('розщеплення STRONG', () => {
  const ev = (hole: string, board: string) => evalHand(cards(hole), cards(board))

  it('дві пари й краще — STRONG_MADE', () => {
    expect(ev('KsQd', 'KhQc2s').cat).toBe('STRONG_MADE')
    expect(ev('7s7d', '7hKc2s').cat).toBe('STRONG_MADE')
    expect(ev('AsKs', 'QsJsTs').cat).toBe('STRONG_MADE')
  })

  it('оверпара і топ-пара з сильним кікером — STRONG_PAIR', () => {
    expect(ev('AsAd', 'Kh7c2s').cat).toBe('STRONG_PAIR')
    expect(ev('AsKd', 'Ah7c2s').cat).toBe('STRONG_PAIR')
  })

  it('середня рука з сильним дро теж STRONG_PAIR — у стек з нею не їдемо', () => {
    // Друга пара + флеш-дро: референс дає STRONG, підтип має бути парним.
    expect(ev('Th9h', 'Kh7hTs').cat).toBe('STRONG_PAIR')
  })
})

describe('дро на рівері не існують', () => {
  it('нереалізоване флеш-дро на пʼятикартковому борді — AIR', () => {
    const e = evalHand(cards('AhQh'), cards('Kh7h2s3c4d'))
    expect(e.cat).toBe('AIR')
    expect(e.label).toBe('нічого')
  })

  it('доїхале флеш-дро — STRONG_MADE із прапорцем madeFlush', () => {
    const e = evalHand(cards('Ah9h'), cards('Kh7h2s3h4d'))
    expect(e.cat).toBe('STRONG_MADE')
    expect(e.madeFlush).toBe(true)
  })

  it('нереалізований гатшот на пʼятикартковому борді — AIR', () => {
    // На флопі 6h5s2c рука 9c8d — справжній гатшот (одна карта, 7, добудовує
    // 5-6-7-8-9). Сьома так і не прийшла, борд уже повний — дро мусить зникнути
    // так само, як флеш-дро вище, а не лишитися WEAKDRAW-«гатшотом» назавжди.
    const e = evalHand(cards('9c8d'), cards('6h5s2cKd3h'))
    expect(e.cat).toBe('AIR')
    expect(e.label).toBe('нічого')
  })

  it('дві оверкарти на пʼятикартковому борді — AIR, а не WEAKDRAW', () => {
    // Регрес: `over` не мав власного гейта на live і доживав до рівера, тоді як
    // флеш- і стріт-дро вже коректно гасли на пʼятій карті. AsKd вищі за весь
    // борд QhJc2s5d3c, але добирати вже нема звідки.
    const e = evalHand(cards('AsKd'), cards('QhJc2s5d3c'))
    expect(e.cat).toBe('AIR')
    expect(e.label).toBe('нічого')
  })
})

describe('беквдор-флеш живий лише на флопі — терну вже не вистачає карт', () => {
  it('не показується на терні: беквдору треба дві карти, лишилась одна', () => {
    const e = evalHand(cards('Ah9h'), cards('Kh7s2c4d'))
    expect(e.label).toBe('нічого')
    expect(e.cat).toBe('AIR')
  })

  it('на терні правдива мітка (дві оверкарти) не витісняється беквдором', () => {
    // AsKs дають 3 пікові карти з бордом (беквдор-форма), але «дві оверкарти»
    // (потрібна лише одна карта) — усе ще жива на терні і має бути видимою.
    const e = evalHand(cards('AsKs'), cards('Qh2c7d3s'))
    expect(e.label).toBe('дві оверкарти')
    expect(e.cat).toBe('WEAKDRAW')
  })
})

describe('boardEvents', () => {
  it('третя карта масті закриває флеш-дро', () => {
    expect(boardEvents(cards('KhQh2s7h')).flushClosed).toBe(true)
    expect(boardEvents(cards('KhQh2s7c')).flushClosed).toBe(false)
  })

  it('спарений борд і оверкарта', () => {
    expect(boardEvents(cards('Kh7s2c7d')).boardPaired).toBe(true)
    expect(boardEvents(cards('Kh7s2cAd')).overcard).toBe(true)
    expect(boardEvents(cards('Kh7s2c5d')).overcard).toBe(false)
  })

  it('на флопі оверкарти не буває — подія про терн і рівер', () => {
    expect(boardEvents(cards('Kh7s2c')).overcard).toBe(false)
  })
})
