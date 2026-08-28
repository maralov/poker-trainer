/**
 * Прокрутка до результату після відповіді.
 *
 * На десктопі екран рішення вміщається цілком і прокручувати нема куди —
 * ефект працює на вузьких екранах, де вердикт зʼявляється нижче згину і без
 * цього довелось би гортати вручну після кожної руки.
 */

import { useEffect, useRef } from 'react'

/** Той самий відступ, що й `scroll-margin-top` у `.duel-side`. */
const MARGIN = 12

export function useScrollToResult(shown: boolean) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!shown) return
    const el = ref.current
    if (!el) return

    const box = el.getBoundingClientRect()
    // Уже видно цілком — смикати екран нема за чим.
    if (box.top >= 0 && box.bottom <= window.innerHeight) return

    const from = window.scrollY
    const to = from + box.top - MARGIN
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // scrollIntoView немає в jsdom, тому виклик опційний: тестам він не потрібен.
    el.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })

    // Плавну прокрутку підтримують не всі оболонки — у вбудованому браузері
    // превʼю вона мовчки не робить нічого. Якщо екран не зрушив — доводимо
    // справу стрибком: побачити результат важливіше за анімацію.
    const timer = window.setTimeout(() => {
      if (Math.abs(window.scrollY - from) < 2) window.scrollTo(0, to)
    }, 150)
    return () => window.clearTimeout(timer)
  }, [shown])

  return ref
}
