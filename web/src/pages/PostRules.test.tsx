import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RULE_TABLES } from '../engine/postflop'
import { PostRules } from './PostRules'

describe('PostRules', () => {
  it('показує всі таблиці правил із посиланням на розділ спеки', () => {
    const { container } = render(<PostRules />)

    for (const t of RULE_TABLES) {
      expect(screen.getByText(t.title), t.title).toBeInTheDocument()
      expect(screen.getByText(t.source), t.source).toBeInTheDocument()
    }
    // Таблиці правил + дві довідкові.
    expect(container.querySelectorAll('table')).toHaveLength(RULE_TABLES.length + 2)
  })

  it('рядок таблиці показує дію і пояснення з матриці', () => {
    render(<PostRules />)

    const flop = RULE_TABLES.find((t) => t.id === 'flop-hu')
    const row = flop?.rows[0]
    expect(row).toBeDefined()
    if (!row) return
    expect(screen.getAllByText(row.action).length).toBeGreaterThan(0)
    expect(screen.getByText(row.why)).toBeInTheDocument()
  })

  it('чесно попереджає про межі моделі', () => {
    render(<PostRules />)
    expect(screen.getByText(/Межі цієї схеми/)).toBeInTheDocument()
    expect(screen.getByText(/експертною оцінкою поля/)).toBeInTheDocument()
  })
})
