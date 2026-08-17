/**
 * Фоновий синк: таймер, реакція на повернення мережі та на закриття вкладки.
 *
 * Черга (syncQueue.ts) не знає про час і браузер — вона чиста і тестована.
 * Тут — усе те брудне, що навколо неї.
 */

import { create } from 'zustand'

import { useAuthStore } from '../store/authStore'
import { useProgressStore } from '../store/progressStore'
import { migrateLocalHistory } from './migrateLocal'
import { supabase } from './supabase'
import { flushPostQueue } from './postSync'
import { FLUSH_INTERVAL_MS, QUEUE_KEY, SyncQueue, type QueuedAttempt } from './syncQueue'

export const queue = new SyncQueue<QueuedAttempt>({
  storage: globalThis.localStorage,
  isAuthenticated: () => useAuthStore.getState().session !== null,
  storageKey: QUEUE_KEY,
  // async, а не пряме повернення білдера: PostgrestFilterBuilder — PromiseLike,
  // і без await він не звужується до Promise<SendResult>.
  send: async (batch) =>
    await supabase
      .from('attempts')
      .upsert([...batch], { onConflict: 'user_id,client_id', ignoreDuplicates: true }),
})

export interface SyncState {
  pending: number
  /**
   * Знімок черги. Тримається в сторі, а не читається з localStorage на місці,
   * щоб React бачив зміни: інакше довелося б підв'язуватись до лічильника
   * pending і сподіватись, що він змінюється разом із вмістом.
   */
  queued: QueuedAttempt[]
  /** Час останнього успішного синку, ms. */
  lastSyncedAt: number | null
  error: string | null
  syncing: boolean
}

export const useSyncStore = create<SyncState>()(() => ({
  pending: queue.size,
  queued: queue.peek(),
  lastSyncedAt: null,
  error: null,
  syncing: false,
}))

async function run(force = false): Promise<void> {
  if (useSyncStore.getState().syncing) return
  useSyncStore.setState({ syncing: true })
  try {
    // Постфлоп їде тим самим циклом: окрема черга, але спільний таймер,
    // спільна реакція на повернення мережі й на закриття вкладки.
    await flushPostQueue(force)
    const r = await queue.flush(force)
    useSyncStore.setState({
      pending: r.pending,
      queued: queue.peek(),
      syncing: false,
      error: r.status === 'error' ? (r.error ?? 'помилка синку') : null,
      ...(r.status === 'ok' ? { lastSyncedAt: Date.now() } : {}),
    })
  } catch (e) {
    useSyncStore.setState({
      syncing: false,
      error: e instanceof Error ? e.message : 'помилка синку',
    })
  }
}

/** Кладе спробу в чергу і, якщо накопичилось достатньо, одразу шле. */
export function recordAttempt(attempt: QueuedAttempt): void {
  const shouldFlush = queue.enqueue(attempt)
  useSyncStore.setState({ pending: queue.size, queued: queue.peek() })
  if (shouldFlush) void run()
}

export function flushNow(): Promise<void> {
  return run(true)
}

/** Запускає фоновий синк. Повертає функцію зупинки. */
export function startSync(): () => void {
  const timer = setInterval(() => void run(), FLUSH_INTERVAL_MS)

  const onOnline = () => void run(true)
  // Вкладку згортають або закривають — остання нагода відправити накопичене.
  const onHidden = () => {
    if (document.visibilityState === 'hidden') void run(true)
  }

  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onHidden)

  // Логін щойно стався — не чекаємо таймера і не тягнемо стару паузу повторів.
  const unsubscribe = useAuthStore.subscribe((state, prev) => {
    if (state.session && !prev.session) {
      queue.resetBackoff()
      // Перший вхід на цьому пристрої: локальна історія їде на сервер.
      migrateLocalHistory(useProgressStore.getState().pre)
      void run(true)
    }
  })

  void run()

  return () => {
    clearInterval(timer)
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onHidden)
    unsubscribe()
  }
}

/** Підписка на realtime не потрібна: дані односторонні, клієнт лише пише. */
export const SYNC_INTERVAL_MS = FLUSH_INTERVAL_MS
