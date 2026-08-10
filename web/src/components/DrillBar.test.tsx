/**
 * DrillBar — єдине місце, де користувач бачить стан пулу «ліків» і норму виходу.
 * Тести ганяють реальні стори, а не моки: перевіряється саме зчеплення
 * engine → store → UI.
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { emptyPreProgress, type PreProgress } from '../engine/progress'
import type { Action, Hand, Position, Scenario } from '../engine/types'
import { useProgressStore } from '../store/progressStore'
import { useSessionStore } from '../store/sessionStore'
import { DrillBar } from './DrillBar'

function withMistakes(entries: readonly [Scenario, Position, Hand, number][]): PreProgress {
  const p = emptyPreProgress()
  for (const [s, pos, h, n] of entries) {
    for (let i = 0; i < n; i++) {
      p.log.push({ s, p: pos, h, ch: 'raise' as Action, co: 'fold' as Action, t: i })
    }
  }
  return p
}

const setProgress = (pre: PreProgress) => useProgressStore.setState({ pre })

describe('DrillBar', () => {
  beforeEach(() => {
    setProgress(emptyPreProgress())
    useSessionStore.setState({ drillScen: null, activeScenarios: ['rfi'], spot: null })
  })

  it('вимагає рівно одного активного сценарію', () => {
    useSessionStore.setState({ activeScenarios: ['rfi', 'iso'] })
    render(<DrillBar />)
    expect(screen.getByText(/рівно один сценарій/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('замалий пул блокує кнопку і пояснює чому', () => {
    setProgress(withMistakes([['rfi', 'UTG', 'A5o', 3]]))
    render(<DrillBar />)
    expect(screen.getByText(/замалий \(1, треба 3\+\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Запустити drill/ })).toBeDisabled()
  })

  it('достатній пул відкриває кнопку і перелічує позиції', () => {
    setProgress(
      withMistakes([
        ['rfi', 'UTG', 'A5o', 3],
        ['rfi', 'CO', 'K5s', 2],
        ['rfi', 'BTN', 'J8o', 1],
      ]),
    )
    render(<DrillBar />)
    expect(screen.getByText(/3 рук/)).toBeInTheDocument()
    expect(screen.getByText(/UTG, CO, BTN/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Запустити drill/ })).toBeEnabled()
  })

  it('пул іншого сценарію не рахується', () => {
    setProgress(
      withMistakes([
        ['iso', 'UTG', 'A5o', 3],
        ['iso', 'CO', 'K5s', 2],
        ['iso', 'BTN', 'J8o', 1],
      ]),
    )
    render(<DrillBar />)
    expect(screen.getByRole('button', { name: /Запустити drill/ })).toBeDisabled()
  })

  it('живий drill показує прогрес вікна і кнопку виходу', () => {
    const pre = withMistakes([
      ['rfi', 'UTG', 'A5o', 3],
      ['rfi', 'CO', 'K5s', 2],
      ['rfi', 'BTN', 'J8o', 1],
    ])
    pre.drill.recent['rfi'] = Array.from({ length: 25 }, (_, i) => (i < 20 ? 1 : 0))
    setProgress(pre)
    useSessionStore.setState({ drillScen: 'rfi' })

    const { container } = render(<DrillBar />)
    expect(container.querySelector('.drill.live')).not.toBeNull()
    expect(screen.getByText(/останні 25\/50/)).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Вийти з drill/ })).toBeInTheDocument()
    expect(screen.queryByText(/норму виконано/)).not.toBeInTheDocument()
    // Смуга прогресу — половина вікна, ще не «готова».
    expect(container.querySelector<HTMLElement>('.bar i')?.style.width).toBe('50%')
    expect(container.querySelector('.bar i.ready')).toBeNull()
  })

  it('50 відповідей із 90% точності показують виконану норму', () => {
    const pre = withMistakes([
      ['rfi', 'UTG', 'A5o', 3],
      ['rfi', 'CO', 'K5s', 2],
      ['rfi', 'BTN', 'J8o', 1],
    ])
    pre.drill.recent['rfi'] = Array.from({ length: 50 }, (_, i) => (i < 45 ? 1 : 0))
    setProgress(pre)
    useSessionStore.setState({ drillScen: 'rfi' })

    const { container } = render(<DrillBar />)
    expect(screen.getByText(/норму виконано/)).toBeInTheDocument()
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(container.querySelector('.bar i.ready')).not.toBeNull()
    expect(container.querySelector<HTMLElement>('.bar i')?.style.width).toBe('100%')
  })

  it('89% на повному вікні норму не зараховує', () => {
    const pre = withMistakes([
      ['rfi', 'UTG', 'A5o', 3],
      ['rfi', 'CO', 'K5s', 2],
      ['rfi', 'BTN', 'J8o', 1],
    ])
    // 44/50 = 88%
    pre.drill.recent['rfi'] = Array.from({ length: 50 }, (_, i) => (i < 44 ? 1 : 0))
    setProgress(pre)
    useSessionStore.setState({ drillScen: 'rfi' })

    const { container } = render(<DrillBar />)
    expect(screen.queryByText(/норму виконано/)).not.toBeInTheDocument()
    expect(container.querySelector('.bar i.ready')).toBeNull()
  })

  it('рука, закрита пʼятьма правильними, зникає з пулу', () => {
    const pre = withMistakes([
      ['rfi', 'UTG', 'A5o', 3],
      ['rfi', 'CO', 'K5s', 2],
      ['rfi', 'BTN', 'J8o', 1],
    ])
    pre.drill.streaks['rfi|UTG|A5o'] = 5
    setProgress(pre)
    render(<DrillBar />)
    // Лишилось дві руки — це вже менше за поріг запуску.
    expect(screen.getByText(/замалий \(2, треба 3\+\)/)).toBeInTheDocument()
  })
})
