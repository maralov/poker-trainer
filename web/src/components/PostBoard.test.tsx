import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { buildEpisode, type PostScenario } from '../engine/postflop'
import { TABLES } from '../engine/tables'
import { PostBoard } from './PostBoard'

/** Підпис дії під сітом кожної позиції. */
const seatLabels = (container: HTMLElement): Map<string, string> =>
  new Map(
    [...container.querySelectorAll('.seat')].map((s) => [
      s.querySelector('.lbl')?.childNodes[0]?.textContent ?? '',
      s.querySelector('.act')?.textContent ?? '',
    ]),
  )

describe('PostBoard', () => {
  it.each<[PostScenario, string, string]>([
    ['rfi', 'Рейз 3bb', 'Колл'],
    ['iso', 'Ізо-рейз', 'Колл'],
    ['vsraise', 'Колл', 'Рейз 3bb'],
  ])('%s: під сітами префлопні ролі тих, хто в роздачі', (scenario, hero, villain) => {
    const ep = buildEpisode({ table: TABLES['9max'], scenario })
    const { container } = render(<PostBoard episode={ep} />)
    const labels = seatLabels(container)

    for (const s of ep.seats) expect(labels.get(s.pos)).toBe(s.hero ? hero : villain)
    // Скинули на префлопі — без підпису.
    const inHand = new Set<string>(ep.seats.map((s) => s.pos))
    for (const [pos, label] of labels) if (!inHand.has(pos)) expect(label).toBe('')
    // Борд лежить на сукні, рука героя — на його сіті.
    expect(container.querySelector('.felt-center .cards')?.children).toHaveLength(3)
    expect(container.querySelector('.seat.hero .hero-cards .cards')?.children).toHaveLength(2)
  })
})
