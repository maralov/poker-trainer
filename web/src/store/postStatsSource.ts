/**
 * Звідки беруться цифри Етапу 2: сервер, якщо є логін, інакше локальний буфер.
 *
 * Дзеркалить statsSource.ts префлопу навмисно — щоб обидва етапи поводились
 * однаково і правились в одному місці подумки.
 */

import { useEffect, useMemo } from 'react'
import { create } from 'zustand'

import { postQueue, usePostSyncStore } from '../api/postSync'
import { fetchServerPostProgress } from '../api/serverPostProgress'
import type { PostProgress } from '../engine/postflop'
import { useAuthStore } from './authStore'
import { mergePostProgress } from './mergePostProgress'
import { useProgressStore } from './progressStore'
import { ofTable, useTableStore } from './tableStore'
import type { TableId } from '../engine/types'

interface ServerPostState {
  /** Формат, для якого завантажено progress. */
  table: TableId | null
  progress: PostProgress | null
  loading: boolean
  error: string | null
  refresh: (table: TableId) => Promise<void>
  reset: () => void
}

export const useServerPostStats = create<ServerPostState>()((set, get) => ({
  table: null,
  progress: null,
  loading: false,
  error: null,
  refresh: async (table) => {
    if (get().table !== table) set({ table, progress: null })
    set({ loading: true, error: null })
    try {
      const { progress } = await fetchServerPostProgress(table)
      // Поки йшов запит, гравець перемкнув формат — відповідь уже чужа.
      if (get().table !== table) return
      set({ progress, loading: false })
    } catch (e) {
      if (get().table !== table) return
      set({ loading: false, error: e instanceof Error ? e.message : 'помилка мережі' })
    }
  },
  reset: () => set({ table: null, progress: null, error: null }),
}))

/**
 * Те саме зведення поза React — для стору тренування: пул drill має бачити
 * помилки й серії з усіх пристроїв, а не лише з цього браузера.
 */
export function getPostStatsProgress(table: TableId): PostProgress {
  const { progress: server, table: loaded } = useServerPostStats.getState()
  return server && loaded === table
    ? mergePostProgress(server, ofTable(postQueue.peek(), table))
    : useProgressStore.getState().tables[table].post
}

export interface PostStatsSource {
  readonly progress: PostProgress
  /** Дані з сервера — тобто зведені з усіх пристроїв. */
  readonly fromServer: boolean
  /** Скільки рішень ще не доїхало. */
  readonly pending: number
  readonly loading: boolean
  readonly error: string | null
}

export function usePostStatsSource(): PostStatsSource {
  const table = useTableStore((s) => s.table)
  const local = useProgressStore((s) => s.tables[table].post)
  const session = useAuthStore((s) => s.session)
  const loaded = useServerPostStats((s) => s.table)
  const rawServer = useServerPostStats((s) => s.progress)
  const server = loaded === table ? rawServer : null
  const loading = useServerPostStats((s) => s.loading)
  const error = useServerPostStats((s) => s.error)
  const refresh = useServerPostStats((s) => s.refresh)
  const reset = useServerPostStats((s) => s.reset)
  const pending = usePostSyncStore((s) => s.pending)
  const queued = usePostSyncStore((s) => s.queued)
  const lastSyncedAt = usePostSyncStore((s) => s.lastSyncedAt)

  useEffect(() => {
    if (session) void refresh(table)
    else reset()
  }, [session, table, refresh, reset])

  // Черга доїхала — серверні цифри змінились, перечитуємо (як у statsSource.ts).
  useEffect(() => {
    if (session && lastSyncedAt) void refresh(table)
  }, [session, table, lastSyncedAt, refresh])

  // Серверні цифри плюс те, що ще в черзі: інакше лічильник після відповіді
  // не рухався б до наступного синку.
  const progress = useMemo(
    () => (server ? mergePostProgress(server, ofTable(queued, table)) : local),
    [server, local, queued, table],
  )

  return { progress, fromServer: server !== null, pending, loading, error }
}
