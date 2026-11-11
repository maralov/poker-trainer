/**
 * Поточний формат столу — налаштування пристрою, не прогрес. Діє на всі
 * сторінки одразу: Stats 9-max поруч із тренуванням 6-max вводив би в оману.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { TABLES, type TableConfig } from '../engine/tables'
import { isTableId, type TableId } from '../engine/types'

export const TABLE_KEY = 'poker_trainer_table'

interface TableState {
  table: TableId
  setTable: (table: TableId) => void
}

export const useTableStore = create<TableState>()(
  persist(
    (set) => ({
      table: '9max',
      setTable: (table) => set({ table }),
    }),
    {
      name: TABLE_KEY,
      version: 1,
      // Сміття в сховищі (ручна правка, стара версія) не має ламати застосунок.
      merge: (persisted, current) => {
        const t = (persisted as { table?: unknown } | null)?.table
        return { ...current, table: isTableId(t) ? t : current.table }
      },
    },
  ),
)

/** Конфіг поточного формату — для React. */
export const useTable = (): TableConfig => TABLES[useTableStore((s) => s.table)]

/** Конфіг поточного формату — поза React. */
export const currentTable = (): TableConfig => TABLES[useTableStore.getState().table]

/**
 * Події черги одного формату. Подія без table_size лежала в черзі до появи
 * 6-max — отже, вона 9-max (так само її прочитає і база через default).
 */
export const ofTable = <T extends { table_size?: string | null }>(
  rows: readonly T[],
  table: TableId,
): T[] => rows.filter((r) => (r.table_size ?? '9max') === table)
