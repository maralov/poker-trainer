/**
 * Персистентний прогрес. Новий ключ localStorage; старий `poker_trainer_v3`
 * імпортується один раз при першому запуску і не чіпається далі — щоб
 * standalone-версія лишалась робочою.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { gateStatus } from '../engine/gate'
import {
  emptyPostProgress,
  recordPostAnswer,
  type PostAnswerInput,
  type PostAnswerRecord,
  type PostProgress,
} from '../engine/postflop'
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
  /**
   * Локальний буфер Етапу 2. База лишається джерелом істини (правило 4
   * CLAUDE.md) — це те, що ще не доїхало до синку (принесе post-3).
   */
  post: PostProgress
  /** Етап 2 відкритий назавжди після виконання воріт. */
  postUnlocked: boolean
  /** Банер «етап відкрито» вже показували. */
  postSeen: boolean
  /** Скільки записів перенесено зі standalone-версії; null — імпорту не було. */
  legacyImported: number | null
  /** Імпорт уже виконувався — вдруге не пропонуємо. */
  legacyChecked: boolean

  answer: (input: AnswerInput, streakBefore: number) => AnswerResult
  answerPost: (input: PostAnswerInput, streakBefore: number) => PostAnswerRecord
  markPostSeen: () => void
  dismissLegacyNotice: () => void
  importLegacy: () => void
  reset: () => void
  /** Скидає лише постфлоп: префлоп і відкриті ворота лишаються як є. */
  resetPost: () => void
}

const clone = (p: PreProgress): PreProgress => structuredClone(p)
const clonePost = (p: PostProgress): PostProgress => structuredClone(p)

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      pre: emptyPreProgress(),
      post: emptyPostProgress(),
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

      answerPost: (input, streakBefore) => {
        const post = clonePost(get().post)
        const result = recordPostAnswer(post, streakBefore, input)
        set({ post })
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
          post: emptyPostProgress(),
          // Відкритий етап не забираємо: ворота існують, щоб дійти підготовленим,
          // а не щоб карати за скидання статистики.
          postSeen: get().postUnlocked,
        }),

      resetPost: () => set({ post: emptyPostProgress() }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      migrate: (persisted, version) => {
        // Версія 1 не мала `post` — дописуємо порожній розділ, нічого не втрачаючи.
        const state = persisted as ProgressState
        return version < 2 ? { ...state, post: emptyPostProgress() } : state
      },
      onRehydrateStorage: () => (state) => {
        // Перший запуск на цьому браузері — підтягуємо standalone-прогрес.
        if (state && !state.legacyChecked) state.importLegacy()
      },
    },
  ),
)
