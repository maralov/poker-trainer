/**
 * Джерело даних для Статистики, Розбору і воріт.
 *
 * Без логіну — локальний прогрес. З логіном — серверний, бо саме він зводить
 * історію з усіх пристроїв. Поки серверні дані ще не приїхали або синк не догнав,
 * показуємо локальні: цифри мають бути завжди, навіть неповні.
 */

import { useEffect, useMemo } from 'react'
import { create } from 'zustand'

import { fetchServerProgress } from '../api/serverProgress'
import { queue, useSyncStore } from '../api/sync'
import type { PreProgress } from '../engine/progress'
import { useAuthStore } from './authStore'
import { mergeProgress } from './mergeProgress'
import { useProgressStore } from './progressStore'

interface ServerStatsState {
  progress: PreProgress | null
  loading: boolean
  error: string | null
  fetchedAt: number | null
  refresh: () => Promise<void>
  reset: () => void
}

export const useServerStats = create<ServerStatsState>()((set) => ({
  progress: null,
  loading: false,
  error: null,
  fetchedAt: null,

  refresh: async () => {
    if (!useAuthStore.getState().session) return
    set({ loading: true, error: null })
    try {
      const { progress, fetchedAt } = await fetchServerProgress()
      set({ progress, fetchedAt, loading: false })
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'не вдалося завантажити статистику',
      })
    }
  },

  reset: () => set({ progress: null, fetchedAt: null, error: null, loading: false }),
}))

export interface StatsSource {
  readonly progress: PreProgress
  /** Дані з сервера — тобто зведені з усіх пристроїв. */
  readonly fromServer: boolean
  /** Скільки подій ще не доїхало: цифри нижчі за реальні рівно на це число. */
  readonly pending: number
  readonly loading: boolean
  readonly error: string | null
}

/**
 * Те саме зведення, але поза React — для сторів, які не можуть викликати хук.
 * Використовує drill-пул і мапу помилок при побудові спотів, щоб тренування
 * враховувало історію з усіх пристроїв, а не лише з цього браузера.
 */
export function getStatsProgress(): PreProgress {
  const local = useProgressStore.getState().pre
  const server = useServerStats.getState().progress
  return server ? mergeProgress(server, local.drill, queue.peek()) : local
}

/**
 * Прогрес для показу + чесна ознака, звідки він і наскільки свіжий.
 * Оновлюється при логіні та після кожного успішного синку.
 */
export function useStatsSource(): StatsSource {
  const local = useProgressStore((s) => s.pre)
  const session = useAuthStore((s) => s.session)
  const server = useServerStats((s) => s.progress)
  const loading = useServerStats((s) => s.loading)
  const error = useServerStats((s) => s.error)
  const refresh = useServerStats((s) => s.refresh)
  const reset = useServerStats((s) => s.reset)
  const pending = useSyncStore((s) => s.pending)
  const queued = useSyncStore((s) => s.queued)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)

  useEffect(() => {
    if (session) void refresh()
    else reset()
  }, [session, refresh, reset])

  // Після того, як черга доїхала, серверні цифри змінились — перечитуємо.
  useEffect(() => {
    if (session && lastSyncedAt) void refresh()
  }, [session, lastSyncedAt, refresh])

  // Серверні цифри плюс те, що ще в черзі: інакше лічильник після відповіді
  // не рухався б до наступного синку.
  const progress = useMemo(
    () => (server ? mergeProgress(server, local.drill, queued) : local),
    [server, local, queued],
  )

  return {
    progress,
    fromServer: server !== null,
    pending,
    loading,
    error,
  }
}
