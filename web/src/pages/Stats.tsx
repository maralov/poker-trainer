/** Вкладка «Статистика»: цифри за весь час + поточна форма. */

import { PerPos, StatStrip } from '../components/StatStrip'
import { GATE, gateStatus } from '../engine/gate'
import { SCENARIOS } from '../engine/ranges'
import { ACTION_ORDER, SCENARIO_KEYS } from '../engine/types'
import { useProgressStore } from '../store/progressStore'
import { useSessionStore } from '../store/sessionStore'
import { useStatsSource } from '../store/statsSource'

export function Stats() {
  const source = useStatsSource()
  const pre = source.progress
  const reset = useProgressStore((s) => s.reset)
  const resetSession = useSessionStore((s) => s.resetSession)

  const acc = pre.total ? Math.round((pre.correct / pre.total) * 100) : 0
  const g = gateStatus(pre.recent, pre.total)

  const pctOf = (d: { t: number; c: number } | undefined): number | null =>
    d && d.t ? Math.round((d.c / d.t) * 100) : null

  return (
    <section>
      <div className="panel">
        <StatStrip
          cells={[
            { value: pre.total, label: 'усього рук' },
            { value: `${acc}%`, label: 'за весь час' },
            { value: `${g.win ? Math.round(g.acc) : 0}%`, label: 'поточна форма' },
            { value: pre.best, label: 'рекордна серія' },
          ]}
        />

        <h4>
          За сценаріями · поріг {GATE.acc}% при {GATE.scenMin}+ руках
        </h4>
        <PerPos
          items={SCENARIO_KEYS.map((k) => ({
            name: SCENARIOS[k].short,
            acc: pctOf(pre.byScen[k]),
            t: pre.byScen[k]?.t ?? 0,
            min: GATE.scenMin,
          }))}
        />

        <h4>
          За позиціями · усі сценарії разом · поріг {GATE.acc}% при {GATE.posMin}+ руках
        </h4>
        <PerPos
          items={ACTION_ORDER.map((p) => ({
            name: p,
            acc: pctOf(pre.byPos[p]),
            t: pre.byPos[p]?.t ?? 0,
            min: GATE.posMin,
          }))}
        />

        <p className="note">
          Тут показана статистика за весь час. Ворота до етапу 2 рахуються по останніх {GATE.window}{' '}
          руках, тому цифри на екрані блокування можуть відрізнятись — там твоя поточна форма, а не
          історія.
        </p>

        {source.error && (
          <p className="note">
            <strong>Серверні дані не завантажились</strong> ({source.error}). Показано історію цього
            браузера.
          </p>
        )}
        {source.fromServer && source.pending > 0 && (
          <p className="note">
            {source.pending} останніх відповідей ще не синхронізовано — на стільки ж цифри нижчі за
            фактичні.
          </p>
        )}

        <div className="foot">
          <span>
            {source.fromServer
              ? 'Дані з сервера — зведені з усіх пристроїв'
              : 'Прогрес зберігається лише в цьому браузері'}
          </span>
          <button
            type="button"
            className="link"
            onClick={() => {
              reset()
              resetSession()
            }}
          >
            Скинути прогрес префлопу
          </button>
        </div>
      </div>
    </section>
  )
}
