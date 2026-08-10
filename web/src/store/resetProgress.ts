/**
 * Скидання і видалення прогресу.
 *
 * Дві різні дії з різними гарантіями:
 *   resetProgress()  — ставить мітку часу; спроби лишаються в базі, скидання оборотне
 *   deleteProgress() — стирає спроби назавжди
 *
 * Обидві мають привести до нуля і локальні цифри, і серверні. Найтонше місце —
 * черга: події, які ще не доїхали, після скидання не мають «воскреснути».
 */

import { deleteServerProgress, resetServerProgress } from '../api/serverProgress'
import { flushNow, queue, useSyncStore } from '../api/sync'
import { useAuthStore } from './authStore'
import { useProgressStore } from './progressStore'
import { useSessionStore } from './sessionStore'
import { useServerStats } from './statsSource'

const clearLocal = (): void => {
  useProgressStore.getState().reset()
  queue.clear()
  useSyncStore.setState({ pending: 0, queued: [] })
  useSessionStore.getState().resetSession()
}

/**
 * Скидання: статистика починається з нуля, історія лишається в базі.
 *
 * Черга спершу вивантажується, а вже потім ставиться мітка — інакше події,
 * зіграні до скидання, доїхали б після нього і показались як нові.
 */
export async function resetProgress(): Promise<void> {
  const authed = useAuthStore.getState().session !== null

  if (authed) {
    await flushNow()
    await resetServerProgress()
  }

  clearLocal()

  if (authed) await useServerStats.getState().refresh()
}

/** Повне видалення: спроби стираються з бази назавжди. */
export async function deleteProgress(): Promise<number> {
  const authed = useAuthStore.getState().session !== null

  // Черга чиститься ДО видалення: інакше те, що в ній лежить, доїхало б
  // одразу після і відтворило частину «видаленої» історії.
  queue.clear()
  useSyncStore.setState({ pending: 0, queued: [] })

  const removed = authed ? await deleteServerProgress() : 0

  clearLocal()

  if (authed) await useServerStats.getState().refresh()
  return removed
}
