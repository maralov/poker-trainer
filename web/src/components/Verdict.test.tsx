/**
 * Вердикт — єдине місце, де сітку показують людині, яка щойно помилилась і не
 * вибирала цей екран. Легенда тут не окраса: у вузькій колонці підписи клітинок
 * ховаються (`@container (max-width: 250px)`), і колір лишається єдиним носієм
 * значення. Тест ганяє реальний buildSpot, а не мок: перевіряється, що легенда
 * описує саме той діапазон, який намальовано.
 */

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { buildSpot } from '../engine/spots'
import type { Position, Scenario } from '../engine/types'
import { Verdict } from './Verdict'

/**
 * Рендер із запитами в межах свого контейнера: в одному тесті вердикт
 * рендериться двічі, і глобальний пошук знаходив би легенду першого.
 */
const show = (scen: Scenario, heroPos: Position, hand: string) => {
  const spot = buildSpot({ force: { scen, heroPos, hand } })
  const { container } = render(<Verdict spot={spot} ok={false} handStreak={0} onNext={() => {}} />)
  const legend = container.querySelector('.legend')
  if (!(legend instanceof HTMLElement)) throw new Error('легенди немає у вердикті')
  return { spot, legend, container }
}

describe('Verdict', () => {
  it('називає дію агресії словом свого сценарію', () => {
    const { legend } = show('rfi', 'BTN', 'AA')
    expect(within(legend).getByText('рейз')).toBeInTheDocument()

    const vs = show('vsraise', 'BTN', 'AA')
    expect(within(vs.legend).getByText('3-бет')).toBeInTheDocument()
  })

  it('без колл-діапазону не обіцяє колл', () => {
    const { spot, legend } = show('rfi', 'BTN', 'AA')
    expect(spot.ranges.call.size).toBe(0)
    expect(within(legend).queryByText('Колл')).not.toBeInTheDocument()
    expect(within(legend).getByText('Фолд')).toBeInTheDocument()
  })

  it('з колл-діапазоном описує і зелений', () => {
    const { spot, legend } = show('vsraise', 'BTN', 'AA')
    expect(spot.ranges.call.size).toBeGreaterThan(0)
    expect(within(legend).getByText('Колл')).toBeInTheDocument()
  })

  it('пояснює рамку підсвіченої руки', () => {
    const { legend, container } = show('rfi', 'BTN', 'AA')
    expect(within(legend).getByText('Твоя рука')).toBeInTheDocument()
    expect(container.querySelectorAll('.cell.hi')).toHaveLength(1)
  })

  it('не тягне у вердикт виноску про діагональ пар', () => {
    const { container } = show('rfi', 'BTN', 'AA')
    const legend = container.querySelector('.legend')
    // Виноска потрібна там, де сітку вивчають, — на вкладці «Діапазони».
    // Тут вона з'їла б рядок екрана, який має вміститись у вікно цілком.
    expect(legend?.querySelector('.legend-hint')).toBeNull()
    expect(screen.queryByText(/діагональ пар/)).not.toBeInTheDocument()
  })
})
