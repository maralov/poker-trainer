/**
 * PostVerdict — вердикт постфлопного рішення: правильність, теги контексту,
 * пояснення і (якщо роздача завершилась цією відповіддю) підсумок роздачі.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SUITS, VAL } from '../engine/cards'
import { RANKS, type Card, type Rank } from '../engine/types'
import type { EpisodeEnd, HeroDecision } from '../engine/postflop'
import { PostVerdict } from './PostVerdict'

const SUIT_CODES = ['s', 'h', 'd', 'c']

/** 'Ks' → Card. Той самий формат, що в фікстурах рушія. */
function card(code: string): Card {
  const rk = code[0] as Rank
  const s = SUIT_CODES.indexOf(code[1] ?? '')
  const suit = SUITS[s]
  if (!RANKS.includes(rk) || suit === undefined) throw new Error(`невалідна карта ${code}`)
  return { rk, v: VAL[rk], s, g: suit.g, red: suit.red }
}
const cards = (codes: string): Card[] => codes.match(/.{2}/g)?.map(card) ?? []

function makeDecision(overrides: Partial<HeroDecision> = {}): HeroDecision {
  return {
    street: 'flop',
    line: 'aggressor',
    facing: 'none',
    cat: 'STRONG_MADE',
    label: 'топ-пара, сильний кікер',
    texture: 'DRY',
    events: { flushClosed: false, boardPaired: false, overcard: false },
    nOpps: 1,
    oppPositions: ['BB'],
    ip: true,
    potBB: 6,
    toCallBB: 0,
    repeatAggro: false,
    options: [
      { k: 'check', l: 'Чек', c: 'ghost' },
      { k: 'b33', l: 'Ставка 33% · 2bb', c: 'soft' },
      { k: 'b66', l: 'Ставка 66% · 4bb', c: 'primary' },
    ],
    correct: 'b66',
    why: 'На сухому борді з топ-парою треба захищати банк.',
    board: cards('Kh7s2c'),
    hole: cards('AhKd'),
    hand: 'AKs',
    ...overrides,
  }
}

const noop = () => {}

describe('PostVerdict', () => {
  it('правильна відповідь показує «Правильно» і клас verdict.ok', () => {
    const { container } = render(
      <PostVerdict decision={makeDecision()} ok={true} handOver={null} onNext={noop} />,
    )
    expect(screen.getByText('Правильно')).toBeInTheDocument()
    expect(container.querySelector('.verdict.ok')).not.toBeNull()
    expect(container.querySelector('.verdict.no')).toBeNull()
  })

  it('помилка показує «Помилка», називає правильну дію і пояснює чому', () => {
    render(
      <PostVerdict
        decision={makeDecision({ correct: 'check', why: 'Тут краще стримати руку.' })}
        ok={false}
        handOver={null}
        onNext={noop}
      />,
    )
    expect(screen.getByText('Помилка')).toBeInTheDocument()
    expect(screen.getByText(/чек/)).toBeInTheDocument()
    expect(screen.getByText(/Тут краще стримати руку\./)).toBeInTheDocument()
  })

  it('показує теги руки, категорії, текстури й режиму столу', () => {
    const { container } = render(
      <PostVerdict
        decision={makeDecision({ nOpps: 2, ip: false, texture: 'WET' })}
        ok={true}
        handOver={null}
        onNext={noop}
      />,
    )
    expect(container.querySelector('.tag.hand')?.textContent).toBe('топ-пара, сильний кікер')
    expect(screen.getByText('Сильна рука')).toBeInTheDocument()
    expect(screen.getByText(/дошка мокра/)).toBeInTheDocument()
    expect(screen.getByText('мультипот')).toBeInTheDocument()
    expect(screen.getByText('OOP')).toBeInTheDocument()
  })

  it('лінія роздачі підписана тегом', () => {
    const { unmount } = render(
      <PostVerdict decision={makeDecision()} ok={true} handOver={null} onNext={noop} />,
    )
    expect(screen.getByText('агресор')).toBeInTheDocument()
    unmount()

    render(
      <PostVerdict
        decision={makeDecision({ line: 'caller' })}
        ok={true}
        handOver={null}
        onNext={noop}
      />,
    )
    expect(screen.getByText('колер')).toBeInTheDocument()
  })

  it('хедз-ап і IP теж підписані тегами', () => {
    render(
      <PostVerdict
        decision={makeDecision({ nOpps: 1, ip: true })}
        ok={true}
        handOver={null}
        onNext={noop}
      />,
    )
    expect(screen.getByText('хедз-ап')).toBeInTheDocument()
    expect(screen.getByText('IP')).toBeInTheDocument()
  })

  it('кнопка каже «Далі · пробіл», доки роздача триває', () => {
    render(<PostVerdict decision={makeDecision()} ok={true} handOver={null} onNext={noop} />)
    expect(screen.getByRole('button', { name: 'Далі · пробіл' })).toBeInTheDocument()
  })

  it('кнопка каже «Наступна рука · пробіл», коли роздача завершена', () => {
    const end: EpisodeEnd = { kind: 'hero-folded', heroWon: false, potBB: 6, shown: [] }
    render(<PostVerdict decision={makeDecision()} ok={true} handOver={end} onNext={noop} />)
    expect(screen.getByRole('button', { name: 'Наступна рука · пробіл' })).toBeInTheDocument()
  })

  it('фолд героя показує примітку про завершену роздачу', () => {
    const end: EpisodeEnd = { kind: 'hero-folded', heroWon: false, potBB: 6, shown: [] }
    render(<PostVerdict decision={makeDecision()} ok={true} handOver={end} onNext={noop} />)
    expect(screen.getByText('Ти скинув — роздача завершена')).toBeInTheDocument()
  })

  it('фолд опонентів показує примітку про виграний банк', () => {
    const end: EpisodeEnd = { kind: 'villains-folded', heroWon: true, potBB: 9, shown: [] }
    render(<PostVerdict decision={makeDecision()} ok={true} handOver={end} onNext={noop} />)
    expect(screen.getByText('Усі скинули, банк твій')).toBeInTheDocument()
  })

  it('шоудаун показує карти опонентів і позначає переможця', () => {
    const end: EpisodeEnd = {
      kind: 'showdown',
      heroWon: true,
      potBB: 12,
      shown: [
        { pos: 'BTN', hole: cards('AhKd'), label: 'топ-пара, сильний кікер', won: true },
        { pos: 'BB', hole: cards('7s2c'), label: 'пара', won: false },
      ],
    }
    render(<PostVerdict decision={makeDecision()} ok={true} handOver={end} onNext={noop} />)
    expect(screen.getByText('Шоудаун')).toBeInTheDocument()
    expect(screen.getByText('BTN: топ-пара, сильний кікер · переможець')).toBeInTheDocument()
    expect(screen.getByText('BB: пара')).toBeInTheDocument()
  })
})
