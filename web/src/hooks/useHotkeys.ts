/**
 * Гарячі клавіші тренування: 1/2/3 — дії, пробіл/Enter — наступний спот.
 * Порт обробника з poker-trainer.html.
 */

import { useEffect } from 'react'

import { usePostSessionStore } from '../store/postSessionStore'
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

/**
 * Гарячі клавіші постфлопу. Окремий хук, а не прапорець у useTrainHotkeys:
 * там набір дій фіксований (три кнопки), тут — 2 або 3 залежно від того, чи
 * герой захищається (facing) чи ставить (options з betOptions/defendOptions).
 */
export function usePostTrainHotkeys(enabled: boolean): void {
  const decision = usePostSessionStore((s) => s.decision)
  const feedback = usePostSessionStore((s) => s.feedback)
  const answer = usePostSessionStore((s) => s.answer)
  const continueHand = usePostSessionStore((s) => s.continueHand)

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
          continueHand()
        }
        return
      }

      const idx = ['1', '2', '3'].indexOf(e.key)
      if (idx === -1 || !decision) return
      const option = decision.options[idx]
      if (option) answer(option.k)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, decision, feedback, answer, continueHand])
}
