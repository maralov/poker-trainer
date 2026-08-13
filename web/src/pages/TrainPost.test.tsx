/**
 * Тести ганяють реальний рушій постфлопу через реальні стори (без моків) —
 * так само, як postSessionStore.test.ts: роздача випадкова, тож перевірки
 * читають стан стору в момент рішення, а не покладаються на конкретний seed.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { emptyPostProgress } from '../engine/postflop'
import { emptyPreProgress } from '../engine/progress'
import { usePostSessionStore } from '../store/postSessionStore'
import { useProgressStore } from '../store/progressStore'
import { TrainPost } from './TrainPost'

describe('TrainPost', () => {
  beforeEach(() => {
    usePostSessionStore.setState({
      episode: null,
      decision: null,
      feedback: null,
      handOver: null,
      streak: 0,
      scenario: 'rfi',
    })
    useProgressStore.setState({
      pre: emptyPreProgress(),
      post: emptyPostProgress(),
      postUnlocked: false,
      postSeen: false,
      legacyImported: null,
      legacyChecked: true,
    })
  })

  it('роздає руку при монтуванні і показує кнопки дій', () => {
    const { container } = render(<TrainPost />)

    const decision = usePostSessionStore.getState().decision
    expect(usePostSessionStore.getState().episode).not.toBeNull()
    expect(decision).not.toBeNull()

    const buttons = container.querySelectorAll('.act-btn')
    expect(buttons).toHaveLength(decision?.options.length ?? 0)
  })

  it('після кліку по дії кнопки зникають і зʼявляється вердикт', () => {
    const { container } = render(<TrainPost />)

    const button = container.querySelector('.act-btn')
    expect(button).not.toBeNull()
    if (!button) return
    fireEvent.click(button)

    expect(container.querySelectorAll('.act-btn')).toHaveLength(0)
    expect(container.querySelector('.verdict')).not.toBeNull()
    expect(usePostSessionStore.getState().feedback).not.toBeNull()
  })

  it('смужка цифр показує точність', () => {
    useProgressStore.setState({ post: { ...emptyPostProgress(), total: 4, correct: 3, best: 2 } })
    render(<TrainPost />)

    expect(screen.getByText('точність')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('рішень')).toBeInTheDocument()
  })

  it('перемикач сценаріїв міняє сценарій', () => {
    render(<TrainPost />)
    expect(usePostSessionStore.getState().scenario).toBe('rfi')

    fireEvent.click(screen.getByRole('button', { name: 'Ізоляція' }))

    expect(usePostSessionStore.getState().scenario).toBe('iso')
  })
})
