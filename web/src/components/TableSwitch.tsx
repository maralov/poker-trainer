/** Перемикач формату столу. Діє на всі сторінки: тренування, діапазони, статистику. */

import { TABLES } from '../engine/tables'
import { TABLE_IDS, type TableId } from '../engine/types'
import { useTableStore } from '../store/tableStore'
import { Chips } from './Chips'

const ITEMS = TABLE_IDS.map((id) => ({ key: id, label: TABLES[id].label }))

export function TableSwitch() {
  const table = useTableStore((s) => s.table)
  const setTable = useTableStore((s) => s.setTable)
  return (
    <div className="table-switch" role="group" aria-label="Формат столу">
      <Chips<TableId> soft items={ITEMS} isOn={(k) => k === table} onPick={setTable} />
    </div>
  )
}
