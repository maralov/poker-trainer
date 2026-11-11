/**
 * Тести ганяють реальний рушій постфлопу через реальні стори (без моків) —
 * так само, як postSessionStore.test.ts: роздача випадкова, тож перевірки
 * читають стан стору в момент рішення, а не покладаються на конкретний seed.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { POST_FIX, emptyPostProgress, recordPostAnswer } from '../engine/postflop'
import { emptyPreProgress } from '../engine/progress'
import { usePostSessionStore } from '../store/postSessionStore'
import { useProgressStore } from '../store/progressStore'
import { TrainPost } from './TrainPost'
import { setTableProgress, tableProgress } from '../test/progress'

describe('TrainPost', () => {
  beforeEach(() => {
    usePostSessionStore.setState({
      episode: null,
      decision: null,
      feedback: null,
      handOver: null,
      streak: 0,
      scenario: 'rfi',
      drillOn: false,
      drillTarget: null,
    })
    setTableProgress({
      pre: emptyPreProgress(),
      post: emptyPostProgress(),
      postUnlocked: false,
      postSeen: false,
    })
    useProgressStore.setState({ legacyImported: null, legacyChecked: true })
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

  it('поки показано вердикт, стіл заморожений на моменті рішення', () => {
    // Роздача випадкова, тож шукаємо саме той випадок, заради якого заморозка
    // й існує: відповідь прокрутила роздачу на наступну вулицю. Без пошуку тест
    // проходив би сам собою на роздачах, які завершились одразу.
    for (let attempt = 0; attempt < 40; attempt++) {
      usePostSessionStore.setState({ episode: null, decision: null, feedback: null, handOver: null })
      const { container, unmount } = render(<TrainPost />)

      const decision = usePostSessionStore.getState().decision
      const button = container.querySelector('.act-btn')
      if (!decision || !button) {
        unmount()
        continue
      }
      fireEvent.click(button)

      const episode = usePostSessionStore.getState().episode
      if (!episode || episode.board.length === decision.board.length) {
        unmount()
        continue
      }

      // Борд епізоду вже виріс — на екрані має лишатись дошка моменту рішення,
      // інакше учень читає пояснення про флоп, дивлячись на терн.
      expect(container.querySelectorAll('.cards')[0]?.children).toHaveLength(
        decision.board.length,
      )
      expect(container.querySelectorAll('.cards')[0]?.children.length).toBeLessThan(
        episode.board.length,
      )
      expect(screen.getByText(`${decision.potBB} bb`)).toBeInTheDocument()
      unmount()
      return
    }
    throw new Error('не трапилось роздачі, яка просунулась далі — перевір генератор')
  })

  it('смужка цифр показує точність', () => {
    setTableProgress({
      post: { ...emptyPostProgress(), total: 4, correct: 3, best: 2 },
    })
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

  it('третій чіп перемикає на лінію колера', () => {
    render(<TrainPost />)

    fireEvent.click(screen.getByRole('button', { name: 'Проти рейзу' }))

    expect(usePostSessionStore.getState().scenario).toBe('vsraise')
    expect(usePostSessionStore.getState().episode?.line).toBe('caller')
  })

  /*
   * Прокрутка до вердикту (useScrollToResult) — те, заради чого на вузькому
   * екрані не доводиться гортати після кожної відповіді. У коді її не видно,
   * тому геометрію підставляємо вручну: jsdom не рахує розкладку.
   */
  describe('прокрутка до вердикту', () => {
    const stubGeometry = (top: number, bottom: number) => {
      const scrollIntoView = vi.fn()
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        value: scrollIntoView,
        configurable: true,
      })
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top,
        bottom,
      } as DOMRect)
      return scrollIntoView
    }

    afterEach(() => {
      vi.restoreAllMocks()
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    })

    it('вердикт нижче згину — прокручуємо', () => {
      const scrollIntoView = stubGeometry(600, window.innerHeight + 300)
      const { container } = render(<TrainPost />)

      fireEvent.click(container.querySelector('.act-btn') as HTMLElement)

      expect(scrollIntoView).toHaveBeenCalled()
    })

    it('вердикт і так на екрані — не смикаємо', () => {
      const scrollIntoView = stubGeometry(100, window.innerHeight - 100)
      const { container } = render(<TrainPost />)

      fireEvent.click(container.querySelector('.act-btn') as HTMLElement)

      expect(scrollIntoView).not.toHaveBeenCalled()
    })
  })

  describe('drill', () => {
    const seedRiverBluffs = (): void => {
      const post = emptyPostProgress()
      for (const at of [1, 2]) {
        recordPostAnswer(post, 0, {
          street: 'river',
          cat: 'AIR',
          texture: 'DRY',
          facing: 'none',
          nOpps: 1,
          ip: true,
          chosen: 'b66',
          correct: 'check',
          at,
        })
      }
      setTableProgress({ post })
    }

    it('без відкритих патернів drill не запускається', () => {
      render(<TrainPost />)
      expect(screen.getByRole('button', { name: 'Запустити drill' })).toHaveProperty('disabled', true)
    })

    it('роздає спот патерну, пише drill-відповідь окремо від статистики', () => {
      seedRiverBluffs()
      const { container } = render(<TrainPost />)
      fireEvent.click(screen.getByRole('button', { name: 'Запустити drill' }))

      const { drillTarget, decision } = usePostSessionStore.getState()
      expect(drillTarget?.fix).toBe('riverBluff')
      expect(decision?.street).toBe('river')

      const button = container.querySelector('.act-btn')
      if (!button) throw new Error('немає кнопок дій')
      fireEvent.click(button)

      const verdict = container.querySelector('.verdict')
      expect(verdict?.textContent).toContain(POST_FIX.riverBluff.title)
      const post = tableProgress().post
      expect(post.drillLog).toHaveLength(1)
      // Дві засіяні помилки — звичайна гра; drill-відповідь total не рухає.
      expect(post.total).toBe(2)

      fireEvent.click(screen.getByRole('button', { name: /Наступний спот/ }))
      expect(usePostSessionStore.getState().feedback).toBeNull()
      expect(usePostSessionStore.getState().drillTarget?.fix).toBe('riverBluff')
    })

    it('вихід із drill повертає звичайні роздачі', () => {
      seedRiverBluffs()
      render(<TrainPost />)
      fireEvent.click(screen.getByRole('button', { name: 'Запустити drill' }))
      fireEvent.click(screen.getByRole('button', { name: 'Вийти з drill' }))
      expect(usePostSessionStore.getState().drillOn).toBe(false)
      expect(usePostSessionStore.getState().drillTarget).toBeNull()
    })
  })
})
