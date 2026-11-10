/**
 * Плашка встановлення залежить лише від середовища: UA, media-запитів і події
 * `beforeinstallprompt`. jsdom не має matchMedia, тож його задаємо тут явно.
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { INSTALL_DISMISSED_KEY, InstallBanner } from './InstallBanner'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile'

function env(ua: string, media: { standalone?: boolean; coarse?: boolean } = {}) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches:
      (q === '(display-mode: standalone)' && media.standalone === true) ||
      (q === '(pointer: coarse)' && media.coarse === true),
  }))
}

function firePrompt() {
  const e = new Event('beforeinstallprompt', { cancelable: true })
  const prompt = vi.fn(() => Promise.resolve())
  Object.assign(e, { prompt })
  act(() => {
    window.dispatchEvent(e)
  })
  return { e, prompt }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('InstallBanner', () => {
  it('на iPhone показує інструкцію через «Поділитися» і запамʼятовує «Не зараз»', () => {
    env(IPHONE)
    const { unmount } = render(<InstallBanner />)
    expect(screen.getByText(/Поділитися/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Не зараз' }))
    expect(screen.queryByText(/Поділитися/)).toBeNull()
    expect(localStorage.getItem(INSTALL_DISMISSED_KEY)).toBe('1')

    unmount()
    render(<InstallBanner />)
    expect(screen.queryByText(/Поділитися/)).toBeNull()
  })

  it('на Android перехоплює beforeinstallprompt і викликає prompt() з кнопки', async () => {
    env(ANDROID, { coarse: true })
    render(<InstallBanner />)
    expect(screen.queryByRole('button', { name: 'Встановити' })).toBeNull()

    const { e, prompt } = firePrompt()
    expect(e.defaultPrevented).toBe(true)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Встановити' }))
    })
    expect(prompt).toHaveBeenCalledOnce()
    // Подія одноразова — після prompt() кнопка зникає.
    expect(screen.queryByRole('button', { name: 'Встановити' })).toBeNull()
  })

  it('на десктопі мовчить навіть після beforeinstallprompt', () => {
    env('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/140')
    const { container } = render(<InstallBanner />)
    firePrompt()
    expect(container).toBeEmptyDOMElement()
  })

  it('у вже встановленому застосунку не показується', () => {
    env(IPHONE, { standalone: true })
    const { container } = render(<InstallBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})
