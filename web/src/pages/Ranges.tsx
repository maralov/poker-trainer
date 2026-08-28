/** Вкладка «Діапазони»: сітка 13×13 для будь-якого сценарію і підваріанта. */

import { useState } from 'react'

import { Chips } from '../components/Chips'
import { Grid13 } from '../components/Grid13'
import { pct, union } from '../engine/cards'
import {
  ISO,
  NOTES,
  RFI,
  SCENARIOS,
  TIGHTER2,
  VS_3BET,
  VS_RAISE,
  type HeroContext,
  type IsoPosition,
  type RaiserBucket,
} from '../engine/ranges'
import {
  SCENARIO_KEYS,
  type Hand,
  type Position,
  type RangePair,
  type Scenario,
} from '../engine/types'

const SUBS: Readonly<Record<Scenario, readonly string[]>> = {
  rfi: ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'],
  iso: ['UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB'],
  vsraise: ['EARLY·POS', 'EARLY·BB', 'MID·POS', 'MID·BB', 'LATE·POS', 'LATE·SB', 'LATE·BB'],
  vs3bet: ['Загальне правило'],
}

const EMPTY: ReadonlySet<Hand> = new Set()

interface View {
  ranges: RangePair
  legendLabel: string
  note: string
}

function buildView(scen: Scenario, sub: string): View {
  if (scen === 'rfi') {
    const pos = sub as Position
    return {
      ranges: { raise: RFI[pos] ?? EMPTY, call: EMPTY },
      legendLabel: 'Рейз',
      note: `${NOTES[pos]} Це діапазон на випадок, коли пот ще ніхто не відкрив.`,
    }
  }
  if (scen === 'iso') {
    const pos = sub as IsoPosition
    return {
      ranges: { raise: ISO[pos] ?? EMPTY, call: EMPTY },
      legendLabel: 'Ізо-рейз',
      note: `Ізоляція одного лімпера з ${pos}. Розмір: 4bb + 1bb за кожного лімпера. Проти двох лімперів бери діапазон позиції ${TIGHTER2[pos]}. Слабкі офсьютні руки прибрані — у мультипоті вони грають погано навіть у позиції.`,
    }
  }
  if (scen === 'vsraise') {
    const [b, c] = sub.split('·') as [RaiserBucket, HeroContext]
    const def = VS_RAISE[b]
    const where =
      c === 'BB' ? 'на великому блайнді' : c === 'SB' ? 'на малому блайнді' : 'в позиції після рейзера'
    return {
      ranges: { raise: def.raise, call: def.call[c] },
      legendLabel: '3-бет',
      note: `Реакція на рейз з ${def.label}, коли ти ${where}. ${def.note}`,
    }
  }
  return {
    ranges: { raise: VS_3BET.raise, call: VS_3BET.call },
    legendLabel: '4-бет',
    note: `${VS_3BET.note} Діапазон свідомо спрощений: на мікролімітах дисципліна тут важить більше за точність.`,
  }
}

/** Свотч дії: два відтінки brass, бо саме ними сітка малює діапазон агресії. */
const PAIR_SPLIT = 'linear-gradient(135deg, var(--brass) 0 50%, var(--brass-dim) 50% 100%)'

/**
 * Легенда описує рівно ті кольори, що є в сітці. Діапазон агресії малюється
 * двома відтінками brass (`.cell.raise` і світліший `.cell.raise.pair`), але
 * дія в них одна — світліше лише позначає діагональ пар, тож це один пункт
 * легенди з двоколірним свотчем, а не дві різні дії. Зелений зʼявляється
 * тільки там, де є колл-діапазон.
 */
function legendItems(action: string, hasCall: boolean): { color: string; label: string }[] {
  return [
    { color: PAIR_SPLIT, label: action },
    ...(hasCall ? [{ color: 'var(--green-dim)', label: 'Колл' }] : []),
    { color: 'var(--panel2)', label: 'Фолд' },
  ]
}

export function Ranges() {
  const [scen, setScen] = useState<Scenario>('rfi')
  const [sub, setSub] = useState<string>('BTN')

  const view = buildView(scen, sub)
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
            setSub(SUBS[k as Scenario][0] as string)
          }}
        />
        <Chips
          soft
          items={(SUBS[scen] ?? []).map((s) => ({ key: s, label: s }))}
          isOn={(s) => s === sub}
          onPick={setSub}
        />

        <Grid13 ranges={view.ranges} />

        <div className="legend">
          {legendItems(view.legendLabel, hasCall).map((it) => (
            <span key={it.label}>
              <i style={{ background: it.color }} />
              {it.label}
            </span>
          ))}
          <span className="legend-hint">світліший відтінок — орієнтир на діагональ пар, не окрема дія</span>
        </div>

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
