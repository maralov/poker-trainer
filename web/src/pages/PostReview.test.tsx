import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchEpisode, fetchServerPostProgress } from '../api/serverPostProgress'
import { emptyPostProgress, type PostMistakeEntry } from '../engine/postflop'
import { emptyPreProgress } from '../engine/progress'
import type { Session } from '@supabase/supabase-js'

import { useAuthStore } from '../store/authStore'
import { useServerPostStats } from '../store/postStatsSource'
import { useProgressStore } from '../store/progressStore'
import { PostReview } from './PostReview'

// Мокаємо весь модуль мережі: тест про екран, а не про supabase-клієнта.
vi.mock('../api/serverPostProgress', () => ({
  fetchEpisode: vi.fn(),
  fetchServerPostProgress: vi.fn(),
}))

// Мінімальна сесія: інтерфейсу від неї потрібна лише наявність.
const SESSION = { access_token: 'test', user: { id: 'u1' } } as unknown as Session

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
    vi.mocked(fetchEpisode).mockReset()
    useServerPostStats.setState({ progress: null, loading: false, error: null })
    useAuthStore.setState({ session: null })
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

  describe('розгортання роздачі', () => {
    // Серверний прогрес зʼявляється лише через refresh(), а той викликається
    // тільки за наявності сесії: без логіну стор себе одразу скидає.
    const withServer = (log: readonly PostMistakeEntry[]) => {
      vi.mocked(fetchServerPostProgress).mockResolvedValue({
        progress: { ...emptyPostProgress(), total: 40, correct: 39, log: [...log] },
        fetchedAt: 0,
        resetAt: null,
      })
      useAuthStore.setState({ session: SESSION })
    }

    const expandButton = () =>
      screen.findByRole('button', { name: 'Розгорнути роздачу' }, { timeout: 2000 })

    it('показує роздачу вулиця за вулицею', async () => {
      vi.mocked(fetchEpisode).mockResolvedValue([
        {
          street: 'flop',
          board: 'Ks7d2c',
          hand: 'AKs',
          hole: 'AsKs',
          cat: 'STRONG_PAIR',
          facing: 'none',
          potBB: 7.5,
          chosen: 'b33',
          correct: 'b33',
          ok: true,
        },
        {
          street: 'turn',
          board: 'Ks7d2c9h',
          hand: 'AKs',
          hole: 'AsKs',
          cat: 'STRONG_PAIR',
          facing: 'big_bet',
          potBB: 18,
          chosen: 'call',
          correct: 'fold',
          ok: false,
        },
      ])

      withServer([mistake({ cat: 'STRONG_PAIR', ch: 'call', co: 'fold', ep: 'episode-3' })])
      render(<PostReview />)

      fireEvent.click(await expandButton())

      await waitFor(() => expect(screen.getByText('Ks7d2c9h')).toBeInTheDocument())
      expect(fetchEpisode).toHaveBeenCalledWith('episode-3')
      expect(screen.getByText('Ks7d2c')).toBeInTheDocument()
      expect(screen.getByText('18bb')).toBeInTheDocument()
      // Правильна дія показана лише для помилкового рішення.
      expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('помилку мережі показує текстом, а не порожньою таблицею', async () => {
      vi.mocked(fetchEpisode).mockRejectedValue(new Error('немає звʼязку'))

      withServer([mistake({ ep: 'episode-4' })])
      render(<PostReview />)
      fireEvent.click(await expandButton())

      await waitFor(() => expect(screen.getByText(/немає звʼязку/)).toBeInTheDocument())
    })

    it('без серверних даних кнопки немає, зате є чесне пояснення', () => {
      useServerPostStats.setState({ progress: null })
      setLog([mistake({ ep: 'episode-5' })])
      render(<PostReview />)

      expect(screen.queryByRole('button', { name: 'Розгорнути роздачу' })).not.toBeInTheDocument()
      expect(screen.getByText(/лише для синхронізованих рук/)).toBeInTheDocument()
    })
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
