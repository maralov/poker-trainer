/**
 * Персистентний прогрес. Новий ключ localStorage; старий `poker_trainer_v3`
 * імпортується один раз при першому запуску і не чіпається далі — щоб
 * standalone-версія лишалась робочою.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { gateStatus } from '../engine/gate'
import {
  emptyPreProgress,
  recordAnswer,
  type AnswerInput,
  type AnswerResult,
  type PreProgress,
} from '../engine/progress'
import { readLegacy } from './legacyImport'

export const STORAGE_KEY = 'poker_trainer_web_v1'

export interface ProgressState {
  pre: PreProgress
  /** Етап 2 відкритий назавжди після виконання воріт. */
  postUnlocked: boolean
  /** Банер «етап відкрито» вже показували. */
  postSeen: boolean
  /** Скільки записів перенесено зі standalone-версії; null — імпорту не було. */
  legacyImported: number | null
  /** Імпорт уже виконувався — вдруге не пропонуємо. */
  legacyChecked: boolean

  answer: (input: AnswerInput, streakBefore: number) => AnswerResult
  markPostSeen: () => void
  dismissLegacyNotice: () => void
  importLegacy: () => void
  reset: () => void
}

const clone = (p: PreProgress): PreProgress => structuredClone(p)

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      pre: emptyPreProgress(),
      postUnlocked: false,
      postSeen: false,
      legacyImported: null,
      legacyChecked: false,

      answer: (input, streakBefore) => {
        const pre = clone(get().pre)
        const result = recordAnswer(pre, streakBefore, input)
        const unlocked = get().postUnlocked || gateStatus(pre.recent, pre.total).ok
        set({ pre, postUnlocked: unlocked })
        return result
      },

      markPostSeen: () => set({ postSeen: true }),

      dismissLegacyNotice: () => set({ legacyImported: null }),

      importLegacy: () => {
        if (get().legacyChecked) return
        const legacy = readLegacy()
        if (!legacy) {
          set({ legacyChecked: true })
          return
        }
        // Імпортована історія може вже задовольняти ворота — тоді відкриваємо
        // етап одразу, інакше UI показував би «виконано 4 з 4 умов · Закрито»
        // аж до наступної відповіді.
        const unlocked = legacy.postUnlocked || gateStatus(legacy.pre.recent, legacy.pre.total).ok
        set({
          pre: legacy.pre,
          postUnlocked: unlocked,
          postSeen: unlocked,
          legacyChecked: true,
          legacyImported: legacy.pre.total,
        })
      },

      reset: () =>
        set({
          pre: emptyPreProgress(),
          // Відкритий етап не забираємо: ворота існують, щоб дійти підготовленим,
          // а не щоб карати за скидання статистики.
          postSeen: get().postUnlocked,
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      onRehydrateStorage: () => (state) => {
        // Перший запуск на цьому браузері — підтягуємо standalone-прогрес.
        if (state && !state.legacyChecked) state.importLegacy()
      },
    },
  ),
)
