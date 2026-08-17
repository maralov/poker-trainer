import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyPostProgress, type PostMistakeEntry } from '../engine/postflop'
import { emptyPreProgress } from '../engine/progress'
import { useProgressStore } from '../store/progressStore'
import { PostReview } from './PostReview'

const mistake = (over: Partial<PostMistakeEntry> = {}): PostMistakeEntry => ({
  street: 'river',
  cat: 'AIR',
  tex: 'DRY',
  facing: 'none',
  n: 1,
  ip: 1,
  ch: 'b66',
  co: 'check',
  t: 1000,
  ...over,
})

const setLog = (log: readonly PostMistakeEntry[], total = 40) => {
  useProgressStore.setState({
    post: { ...emptyPostProgress(), total, correct: total - log.length, log: [...log] },
  })
}

describe('PostReview', () => {
  beforeEach(() => {
    useProgressStore.setState({
      pre: emptyPreProgress(),
      post: emptyPostProgress(),
      postUnlocked: true,
      postSeen: true,
      legacyImported: null,
      legacyChecked: true,
    })
  })

  it('порожній журнал запрошує зіграти', () => {
    render(<PostReview />)
    expect(screen.getByText(/Зіграй 50–70 рішень/)).toBeInTheDocument()
  })

  it('три блефи рівера дають патерн із кількістю', () => {
    setLog([mistake(), mistake(), mistake()])
    render(<PostReview />)

    expect(screen.getByText('Блеф рівера · 3×')).toBeInTheDocument()
    expect(screen.getByText(/не блефується — ніколи/)).toBeInTheDocument()
  })

  it('рядок споту показує руку, вулицю, контекст і правильну дію', () => {
    setLog([
      mistake({
        cat: 'STRONG_PAIR',
        street: 'turn',
        facing: 'big_bet',
        ch: 'call',
        co: 'fold',
        hand: 'AKs',
      }),
    ])
    render(<PostReview />)

    expect(screen.getByText('AKs')).toBeInTheDocument()
    expect(screen.getByText(/терн · велика ставка/)).toBeInTheDocument()
    expect(screen.getByText(/колл → має бути фолд/)).toBeInTheDocument()
  })

  it('без руки в журналі показує хоча б категорію — старі записи не ламають екран', () => {
    setLog([mistake({ cat: 'MEDIUM', ch: 'b33', co: 'check', street: 'flop' })])
    render(<PostReview />)
    expect(screen.getByText('Середня рука')).toBeInTheDocument()
  })

  it('кнопка копіює звіт', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    setLog([mistake(), mistake()])
    render(<PostReview />)
    fireEvent.click(screen.getByRole('button', { name: 'Скопіювати звіт' }))

    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText.mock.calls[0]?.[0]).toMatch(/ЗВІТ · ПОСТФЛОП/)
  })
})
