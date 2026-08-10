/**
 * Екран блокування етапу 2: чотири умови по ковзному вікну останніх 150 рук.
 * Сенс воріт — дійти до постфлопу підготовленим, а не карати за погану сесію.
 */

import { GATE, gateStatus, type GateStatus } from '../engine/gate'
import { SCENARIOS } from '../engine/ranges'
import { useStatsSource } from '../store/statsSource'

function Criterion({
  done,
  title,
  value,
  desc,
  progress,
}: {
  done: boolean
  title: string
  value: string
  desc: string
  progress: number
}) {
  return (
    <div className={`crit ${done ? 'done' : ''}`}>
      <div className="mk">{done ? '✓' : '·'}</div>
      <div className="txt">
        <div className="t">
          <span>{title}</span>
          <em>{value}</em>
        </div>
        <div className="d">{desc}</div>
        <div className="pbar">
          <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      </div>
    </div>
  )
}

export function GateLock() {
  const pre = useStatsSource().progress
  const g: GateStatus = gateStatus(pre.recent, pre.total)

  const worstScen = [...g.scen].sort((a, b) => a.p - b.p)[0]
  const worstPos = [...g.pos].sort((a, b) => a.p - b.p)[0]

  return (
    <div className="panel">
      <div className="lock-head">
        <b>Етап 2 закритий</b>
        <span>
          Постфлоп без твердого префлопу не має сенсу: ти навчишся приймати правильні рішення на
          флопі з руками, яких там не мало бути. Умови рахуються по{' '}
          <strong style={{ color: 'var(--ivory)' }}>останніх {GATE.window} руках</strong> — тобто по
          поточній формі, а не по всій історії. Невдалий старт нічого не блокує назавжди.
        </span>
      </div>

      <Criterion
        done={g.c1}
        title="Зіграно рук префлопу"
        value={`${g.total} / ${GATE.hands}`}
        desc="Дистанція, на якій випадковість перестає впливати на статистику."
        progress={(g.total / GATE.hands) * 100}
      />
      <Criterion
        done={g.c2}
        title="Точність за поточну форму"
        value={`${g.win ? Math.round(g.acc) : 0}% / ${GATE.acc}%`}
        desc={`Середній результат за останні ${Math.min(g.win, GATE.window)} рук.`}
        progress={(g.acc / GATE.acc) * 100}
      />
      <Criterion
        done={g.c3}
        title="Кожен сценарій ≥ 80%"
        value={
          worstScen
            ? `найгірший: ${SCENARIOS[worstScen.k].short} ${Math.round(worstScen.p)}%`
            : 'немає даних'
        }
        desc={`Рахуються сценарії, де у вікні ${GATE.scenMin}+ рук. Не можна закрити етап, витягнувши середнє одним сценарієм.`}
        progress={worstScen ? (worstScen.p / GATE.acc) * 100 : 0}
      />
      <Criterion
        done={g.c4}
        title="Кожна позиція ≥ 80%"
        value={
          worstPos
            ? `${g.pos.length} позицій, найгірша: ${worstPos.k} ${Math.round(worstPos.p)}%`
            : 'немає даних'
        }
        desc={`Рахуються позиції з ${GATE.posMin}+ руками у вікні, потрібно щонайменше ${GATE.posCount}. Слабка позиція за реальним столом коштує так само, як слабкий сценарій.`}
        progress={
          worstPos ? Math.min(worstPos.p / GATE.acc, g.pos.length / GATE.posCount) * 100 : 0
        }
      />

      <p className="note">
        <strong>Після відкриття етап залишається доступним назавжди.</strong> Тимчасова просадка
        точності його не забирає — сенс воріт у тому, щоб ти дійшов до постфлопу підготовленим, а не
        в тому, щоб карати за погану сесію.
      </p>
    </div>
  )
}
