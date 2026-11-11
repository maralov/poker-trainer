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
import { TABLES } from '../engine/tables'
import { TABLE_IDS, type TableId } from '../engine/types'
import { readLegacy } from './legacyImport'

export const STORAGE_KEY = 'poker_trainer_web_v1'

/** Прогрес одного формату столу. Формати не змішуються ні в чому. */
export interface TableProgress {
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
}

export const emptyTableProgress = (): TableProgress => ({
  pre: emptyPreProgress(),
  post: emptyPostProgress(),
  postUnlocked: false,
  postSeen: false,
})

const emptyTables = (): Record<TableId, TableProgress> =>
  Object.fromEntries(TABLE_IDS.map((t) => [t, emptyTableProgress()])) as Record<
    TableId,
    TableProgress
  >

export interface ProgressState {
  tables: Record<TableId, TableProgress>
  /** Скільки записів перенесено зі standalone-версії; null — імпорту не було. */
  legacyImported: number | null
  /** Імпорт уже виконувався — вдруге не пропонуємо. */
  legacyChecked: boolean

  answer: (table: TableId, input: AnswerInput, streakBefore: number) => AnswerResult
  answerPost: (table: TableId, input: PostAnswerInput, streakBefore: number) => PostAnswerRecord
  markPostSeen: (table: TableId) => void
  dismissLegacyNotice: () => void
  importLegacy: () => void
  /** Скидає прогрес одного формату; інший формат не чіпається. */
  reset: (table: TableId) => void
  /** Скидає лише постфлоп формату: префлоп і відкриті ворота лишаються як є. */
  resetPost: (table: TableId) => void
}

const clone = (p: PreProgress): PreProgress => structuredClone(p)
const clonePost = (p: PostProgress): PostProgress => structuredClone(p)

/** Persist v3 — один формат (9-max) на верхньому рівні стану. */
interface PersistedV3 {
  pre?: PreProgress
  post?: PostProgress
  postUnlocked?: boolean
  postSeen?: boolean
  legacyImported: number | null
  legacyChecked: boolean
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => {
      const patch = (table: TableId, part: Partial<TableProgress>): void => {
        set((s) => ({ tables: { ...s.tables, [table]: { ...s.tables[table], ...part } } }))
      }

      return {
      tables: emptyTables(),
      legacyImported: null,
      legacyChecked: false,

      answer: (table, input, streakBefore) => {
        const cur = get().tables[table]
        const pre = clone(cur.pre)
        const result = recordAnswer(pre, streakBefore, input)
        const unlocked = cur.postUnlocked || gateStatus(pre.recent, pre.total, TABLES[table]).ok
        patch(table, { pre, postUnlocked: unlocked })
        return result
      },

      answerPost: (table, input, streakBefore) => {
        const post = clonePost(get().tables[table].post)
        const result = recordPostAnswer(post, streakBefore, input)
        patch(table, { post })
        return result
      },

      markPostSeen: (table) => patch(table, { postSeen: true }),

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
        // Standalone-версія знала лише 9-max.
        const unlocked =
          legacy.postUnlocked || gateStatus(legacy.pre.recent, legacy.pre.total, TABLES['9max']).ok
        patch('9max', { pre: legacy.pre, postUnlocked: unlocked, postSeen: unlocked })
        set({ legacyChecked: true, legacyImported: legacy.pre.total })
      },

      reset: (table) =>
        patch(table, {
          pre: emptyPreProgress(),
          post: emptyPostProgress(),
          // Відкритий етап не забираємо: ворота існують, щоб дійти підготовленим,
          // а не щоб карати за скидання статистики.
          postSeen: get().tables[table].postUnlocked,
        }),

      resetPost: (table) => patch(table, { post: emptyPostProgress() }),
      }
    },
    {
      name: STORAGE_KEY,
      version: 4,
      migrate: (persisted, version) => migrateProgress(persisted, version),
      onRehydrateStorage: () => (state) => {
        // Перший запуск на цьому браузері — підтягуємо standalone-прогрес.
        if (state && !state.legacyChecked) state.importLegacy()
      },
    },
  ),
)

/**
 * Міграції persist-стану. Кожен крок доводить стан до наступної версії,
 * тож старий стан проходить усі кроки, а не лише останній.
 */
export function migrateProgress(persisted: unknown, version: number): ProgressState {
  let v3 = persisted as PersistedV3
  // Версія 1 не мала `post` — дописуємо порожній розділ, нічого не втрачаючи.
  if (version < 2) v3 = { ...v3, post: emptyPostProgress() }
  // Версія 2 не мала drill постфлопу.
  if (version < 3) v3 = { ...v3, post: { ...(v3.post ?? emptyPostProgress()), drillLog: [] } }
  if (version >= 4) return persisted as ProgressState
  // Версія 3 знала один формат — 9-max. 6-max починається з нуля.
  const { pre, post, postUnlocked, postSeen, ...rest } = v3
  return {
    ...rest,
    tables: {
      ...emptyTables(),
      // Поля могли бути відсутні в пошкодженому стані — порожні замість undefined.
      '9max': {
        pre: pre ?? emptyPreProgress(),
        post: post ?? emptyPostProgress(),
        postUnlocked: postUnlocked ?? false,
        postSeen: postSeen ?? false,
      },
    },
  } as ProgressState
}
