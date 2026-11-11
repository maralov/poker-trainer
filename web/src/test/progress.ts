/** Тестові хелпери стору прогресу: більшість тестів працює з одним форматом — 9-max. */

import type { TableId } from '../engine/types'
import { useProgressStore, type TableProgress } from '../store/progressStore'

/** Підмінює частину прогресу формату, решту лишає як є. */
export function setTableProgress(part: Partial<TableProgress>, table: TableId = '9max'): void {
  useProgressStore.setState((s) => ({
    tables: { ...s.tables, [table]: { ...s.tables[table], ...part } },
  }))
}

/** Прогрес формату (за замовчуванням 9-max). */
export const tableProgress = (table: TableId = '9max'): TableProgress =>
  useProgressStore.getState().tables[table]
