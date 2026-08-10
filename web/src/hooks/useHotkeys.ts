/**
 * Гарячі клавіші тренування: 1/2/3 — дії, пробіл/Enter — наступний спот.
 * Порт обробника з poker-trainer.html.
 */

import { useEffect } from 'react'

import { useSessionStore } from '../store/sessionStore'

export function useTrainHotkeys(enabled: boolean): void {
  const spot = useSessionStore((s) => s.spot)
  const feedback = useSessionStore((s) => s.feedback)
  const answer = useSessionStore((s) => s.answer)
  const next = useSessionStore((s) => s.next)

  useEffect(() => {
    if (!enabled) return

    const onKey = (e: KeyboardEvent) => {
      // Не перехоплюємо ввід у полях — знадобиться на екрані логіну у Фазі 4.
      const target = e.target as HTMLElement | null
      if (target?.isContentEditable) return
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (feedback) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          next()
        }
        return
      }

      const idx = ['1', '2', '3'].indexOf(e.key)
      if (idx === -1 || !spot) return
      const option = spot.options[idx]
      if (option) answer(option.k)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, spot, feedback, answer, next])
}
