import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { emptyPostProgress, type PostProgress } from '../engine/postflop'
import { emptyPreProgress } from '../engine/progress'
import { useProgressStore } from '../store/progressStore'
import { PostStats } from './PostStats'

const filled = (): PostProgress => ({
  ...emptyPostProgress(),
  total: 40,
  correct: 30,
  best: 7,
  byStreet: { flop: { t: 20, c: 18 }, turn: { t: 12, c: 8 }, river: { t: 8, c: 4 } },
  byCat: { STRONG_MADE: { t: 10, c: 10 }, AIR: { t: 12, c: 6 } },
  byTex: { WET: { t: 15, c: 9 }, DRY: { t: 25, c: 21 } },
  byMode: { 'HU·IP': { t: 22, c: 18 }, 'MULTI·OOP': { t: 6, c: 2 } },
  byFacing: { none: { t: 24, c: 20 }, small_bet: { t: 10, c: 6 } },
  log: [],
})

describe('PostStats', () => {
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

  it('порожній прогрес запрошує зіграти, а не показує нулі', () => {
    render(<PostStats />)
    expect(screen.getByText(/Зіграй 50–70 рішень/)).toBeInTheDocument()
    expect(screen.queryByText('усього рішень')).not.toBeInTheDocument()
  })

  it('показує підсумок і всі пʼять зрізів', () => {
    useProgressStore.setState({ post: filled() })
    render(<PostStats />)

    expect(screen.getByText('усього рішень')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()

    for (const head of [
      /За вулицями/,
      /За категорією руки/,
      /За текстурою дошки/,
      /За типом споту/,
      /що стоїть перед тобою/,
    ]) {
      expect(screen.getByText(head), String(head)).toBeInTheDocument()
    }

    // Вулиці підписані людською назвою, а не ключем.
    expect(screen.getByText('флоп')).toBeInTheDocument()
    expect(screen.getByText('90% · 20')).toBeInTheDocument()
  })

  it('каже, де скидати прогрес — кнопки тут свідомо немає', () => {
    useProgressStore.setState({ post: filled() })
    render(<PostStats />)

    expect(screen.getByText(/Скидання прогресу — на вкладці/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Скинути/ })).not.toBeInTheDocument()
  })
})
