/**
 * Каркас застосунку: перемикання етапів, вкладки Етапу 2 і межі хоткеїв.
 *
 * Тести ганяють реальні стори (без моків), як решта тестів UI: цінність саме
 * в зчепленні — вкладка, хоткеї й екран мусять узгоджуватись.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import App from './App'
import { emptyPostProgress } from './engine/postflop'
import { emptyPreProgress } from './engine/progress'
import { usePostSessionStore } from './store/postSessionStore'
import { useProgressStore } from './store/progressStore'

const openStage2 = () => {
  fireEvent.click(screen.getByRole('button', { name: /Етап 2/ }))
}

describe('App', () => {
  beforeEach(() => {
    useProgressStore.setState({
      pre: emptyPreProgress(),
      post: emptyPostProgress(),
      postUnlocked: true,
      postSeen: true,
      legacyImported: null,
      legacyChecked: true,
    })
    usePostSessionStore.setState({
      episode: null,
      decision: null,
      feedback: null,
      handOver: null,
      streak: 0,
      scenario: 'rfi',
    })
  })

  it('відкритий Етап 2 показує власні вкладки', () => {
    render(<App />)
    openStage2()

    for (const label of ['Тренування', 'Схема рішень', 'Статистика', 'Розбір']) {
      expect(screen.getByRole('button', { name: label }), label).toBeInTheDocument()
    }
  })

  it('вкладка «Схема рішень» показує таблиці замість тренування', () => {
    render(<App />)
    openStage2()

    fireEvent.click(screen.getByRole('button', { name: 'Схема рішень' }))

    expect(screen.getByText('Флоп · чекнуто до тебе · хедз-ап')).toBeInTheDocument()
    expect(screen.queryByText('Твої карти')).not.toBeInTheDocument()
  })

  // Хоткеї слухають document, тож подія кидається в body — з window вона до
  // слухача не дійшла б, і тест проходив би сам собою.
  it('на вкладці тренування «1» відповідає за героя', () => {
    render(<App />)
    openStage2()

    expect(usePostSessionStore.getState().decision).not.toBeNull()
    fireEvent.keyDown(document.body, { key: '1' })

    expect(usePostSessionStore.getState().feedback).not.toBeNull()
  })

  it('на вкладці правил ті самі хоткеї вже не діють', () => {
    render(<App />)
    openStage2()
    expect(usePostSessionStore.getState().decision).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Схема рішень' }))
    fireEvent.keyDown(document.body, { key: '1' })

    expect(usePostSessionStore.getState().feedback).toBeNull()
  })

  it('закритий Етап 2 показує замок і не показує вкладок', () => {
    useProgressStore.setState({ postUnlocked: false })
    render(<App />)
    openStage2()

    expect(screen.queryByRole('button', { name: 'Схема рішень' })).not.toBeInTheDocument()
  })
})
