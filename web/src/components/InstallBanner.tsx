/**
 * Підказка «встанови на екран „Додому“».
 *
 * Android (Chrome) дає подію `beforeinstallprompt`: її відкладаємо й показуємо
 * свою кнопку. iOS такого API не має взагалі — встановити можна лише вручну
 * через «Поділитися», тож там лишається текстова інструкція.
 * Поза мобільним браузером і в уже встановленому застосунку плашки немає.
 */

import { useEffect, useState } from 'react'

export const INSTALL_DISMISSED_KEY = 'poker_install_dismissed'

// Нестандартна подія Chromium, у lib.dom її немає.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
}

function isStandalone(): boolean {
  // `navigator.standalone` — iOS-специфіка, `display-mode` — решта браузерів.
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  )
}

function isIos(): boolean {
  // iPadOS 13+ представляється як Mac, видає його лише тач.
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function InstallBanner() {
  const [dismissed, setDismissed] = useState(readDismissed)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [ios] = useState(isIos)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Без preventDefault Chrome покаже власну міні-плашку і подія згорить.
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    } catch {
      // Приватний режим: плашка зникне до перезавантаження, і цього досить.
    }
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    // Подія одноразова: після prompt() її вже не викликати.
    setDeferred(null)
  }

  if (dismissed || isStandalone()) return null
  // Chrome на десктопі теж шле beforeinstallprompt — плашку показуємо лише на тачі.
  const android = deferred !== null && window.matchMedia('(pointer: coarse)').matches
  if (!ios && !android) return null

  return (
    <div className="banner">
      <b>Тренажер можна встановити</b>
      <span>
        {android ? (
          <>
            Відкриватиметься з головного екрана як застосунок і працюватиме без мережі.{' '}
            <button type="button" className="link" onClick={() => void install()}>
              Встановити
            </button>
          </>
        ) : (
          <>
            У Safari натисни «Поділитися», потім «На екран „Додому“». Відкриватиметься як
            застосунок і працюватиме без мережі.
          </>
        )}{' '}
        <button type="button" className="link" onClick={dismiss}>
          Не зараз
        </button>
      </span>
    </div>
  )
}
