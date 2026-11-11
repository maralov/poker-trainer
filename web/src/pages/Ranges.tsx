/** Вкладка «Діапазони»: сітка 13×13 для будь-якого сценарію і підваріанта. */

import { useState } from 'react'

import { Chips } from '../components/Chips'
import { Grid13 } from '../components/Grid13'
import { RangeLegend } from '../components/RangeLegend'
import { pct, union } from '../engine/cards'
import { SCENARIOS, type HeroContext, type RaiserBucket } from '../engine/ranges'
import type { TableConfig } from '../engine/tables'
import {
  SCENARIO_KEYS,
  type Hand,
  type Position,
  type RangePair,
  type Scenario,
} from '../engine/types'
import { useTable } from '../store/tableStore'

/** Підваріанти сценарію — з позицій столу, щоб у 6-max не було LJ чи MP. */
const subsFor = (table: TableConfig): Readonly<Record<Scenario, readonly string[]>> => ({
  rfi: [...table.openOrder, 'SB'],
  // З першого місця ізолювати нікого: перед ним немає лімперів.
  iso: table.isoOrder.filter((p) => p !== table.seats[0]),
  vsraise: ['EARLY·POS', 'EARLY·BB', 'MID·POS', 'MID·BB', 'LATE·POS', 'LATE·SB', 'LATE·BB'],
  vs3bet: ['Загальне правило'],
})

const EMPTY: ReadonlySet<Hand> = new Set()

interface View {
  ranges: RangePair
  legendLabel: string
  note: string
}

function buildView(table: TableConfig, scen: Scenario, sub: string): View {
  if (scen === 'rfi') {
    const pos = sub as Position
    return {
      ranges: { raise: table.rfi[pos] ?? EMPTY, call: EMPTY },
      legendLabel: 'Рейз',
      note: `${table.notes[pos] ?? ''} Це діапазон на випадок, коли пот ще ніхто не відкрив.`,
    }
  }
  if (scen === 'iso') {
    const pos = sub as Position
    return {
      ranges: { raise: table.iso[pos] ?? EMPTY, call: EMPTY },
      legendLabel: 'Ізо-рейз',
      note: `Ізоляція одного лімпера з ${pos}. Розмір: 4bb + 1bb за кожного лімпера. Проти двох лімперів бери діапазон позиції ${table.tighter2[pos] ?? pos}. Слабкі офсьютні руки прибрані — у мультипоті вони грають погано навіть у позиції.`,
    }
  }
  if (scen === 'vsraise') {
    const [b, c] = sub.split('·') as [RaiserBucket, HeroContext]
    const def = table.vsRaise[b]
    const where =
      c === 'BB' ? 'на великому блайнді' : c === 'SB' ? 'на малому блайнді' : 'в позиції після рейзера'
    return {
      ranges: { raise: def.raise, call: def.call[c] },
      legendLabel: '3-бет',
      note: `Реакція на рейз з ${def.label}, коли ти ${where}. ${def.note}`,
    }
  }
  return {
    ranges: { raise: table.vs3bet.raise, call: table.vs3bet.call },
    legendLabel: '4-бет',
    note: `${table.vs3bet.note} Діапазон свідомо спрощений: на мікролімітах дисципліна тут важить більше за точність.`,
  }
}

export function Ranges() {
  const [scen, setScen] = useState<Scenario>('rfi')
  const [picked, setSub] = useState<string>('BTN')
  const table = useTable()
  const subs = subsFor(table)
  // Підваріант іншого формату (MP після перемикання на 6-max) — беремо перший.
  const sub = subs[scen].includes(picked) ? picked : (subs[scen][0] ?? picked)

  const view = buildView(table, scen, sub)
  const total = pct(union(view.ranges.raise, view.ranges.call))
  const hasCall = view.ranges.call.size > 0

  return (
    <section>
      <div className="panel">
        <Chips
          items={SCENARIO_KEYS.map((k) => ({ key: k, label: SCENARIOS[k].label }))}
          isOn={(k) => k === scen}
          onPick={(k) => {
            setScen(k as Scenario)
            setSub(subs[k as Scenario][0] as string)
          }}
        />
        <Chips
          soft
          items={subs[scen].map((s) => ({ key: s, label: s }))}
          isOn={(s) => s === sub}
          onPick={setSub}
        />

        <Grid13 ranges={view.ranges} />

        <RangeLegend action={view.legendLabel} hasCall={hasCall} />

        <div className="range-head">
          <b>{total.toFixed(1)}%</b>
          <span>
            {hasCall
              ? `рук у грі · ${pct(view.ranges.raise).toFixed(1)}% рейз, ${pct(view.ranges.call).toFixed(1)}% колл`
              : 'рук у діапазоні'}
          </span>
        </div>

        <p className="note">{view.note}</p>
      </div>
    </section>
  )
}
