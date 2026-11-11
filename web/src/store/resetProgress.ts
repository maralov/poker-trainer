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

import { postQueue, usePostSyncStore } from '../api/postSync'
import { deleteServerProgress, resetServerProgress } from '../api/serverProgress'
import { flushNow, queue, useSyncStore } from '../api/sync'
import { useAuthStore } from './authStore'
import { usePostSessionStore } from './postSessionStore'
import { useServerPostStats } from './postStatsSource'
import { useProgressStore } from './progressStore'
import { useSessionStore } from './sessionStore'
import { useServerStats } from './statsSource'
import { useTableStore } from './tableStore'
import { TABLE_IDS, type TableId } from '../engine/types'

const clearLocal = (tables: readonly TableId[]): void => {
  // reset() чистить обидва розділи прогресу формату — і префлоп, і постфлоп.
  for (const t of tables) useProgressStore.getState().reset(t)
  // Без логіну черга не вивантажується і може тримати події іншого формату —
  // їх не чіпаємо: скидання 6-max не має губити незасинхронізований 9-max.
  const mine = (r: { table_size?: string | null }): boolean =>
    tables.includes((r.table_size ?? '9max') as TableId)
  queue.removeWhere(mine)
  postQueue.removeWhere(mine)
  useSyncStore.setState({ pending: queue.size, queued: queue.peek() })
  usePostSyncStore.setState({ pending: postQueue.size, queued: postQueue.peek() })
  useSessionStore.getState().resetSession()
  // Поточна постфлоп-рука теж більше не має сенсу: роздаємо нову.
  usePostSessionStore.getState().deal()
}

const refreshServer = async (): Promise<void> => {
  const table = useTableStore.getState().table
  await useServerStats.getState().refresh(table)
  await useServerPostStats.getState().refresh(table)
}

/**
 * Скидання поточного формату: його статистика починається з нуля, історія
 * лишається в базі, інший формат не чіпається.
 *
 * Черга спершу вивантажується, а вже потім ставиться мітка — інакше події,
 * зіграні до скидання, доїхали б після нього і показались як нові.
 */
export async function resetProgress(): Promise<void> {
  const authed = useAuthStore.getState().session !== null
  const table = useTableStore.getState().table

  if (authed) {
    // flushNow() вивантажує обидві черги: sync.run() шле і постфлоп теж.
    // Після нього в черзі не лишається подій жодного формату, тож очищення
    // черги в clearLocal не зачіпає чужий формат.
    await flushNow()
    await resetServerProgress(table)
  }

  clearLocal([table])

  if (authed) await refreshServer()
}

/** Повне видалення: спроби всіх форматів стираються з бази назавжди. */
export async function deleteProgress(): Promise<number> {
  const authed = useAuthStore.getState().session !== null

  // Черга чиститься ДО видалення: інакше те, що в ній лежить, доїхало б
  // одразу після і відтворило частину «видаленої» історії.
  queue.clear()
  postQueue.clear()
  useSyncStore.setState({ pending: 0, queued: [] })
  usePostSyncStore.setState({ pending: 0, queued: [] })

  const removed = authed ? await deleteServerProgress() : 0

  clearLocal(TABLE_IDS)

  if (authed) await refreshServer()
  return removed
}
