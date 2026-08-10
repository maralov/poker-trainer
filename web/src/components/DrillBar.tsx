/**
 * Drill-бар: стан пулу «ліків» і кнопка запуску/виходу.
 * Drill доступний лише коли увімкнено рівно один сценарій — ліки тренуються окремо.
 */

import { DRILL, canDrill, drillPool, drillStats } from '../engine/drill'
import { SCENARIOS } from '../engine/ranges'
import { useProgressStore } from '../store/progressStore'
import { useSessionStore } from '../store/sessionStore'

export function DrillBar() {
  const pre = useProgressStore((s) => s.pre)
  const drillScen = useSessionStore((s) => s.drillScen)
  const activeScenarios = useSessionStore((s) => s.activeScenarios)
  const startDrill = useSessionStore((s) => s.startDrill)
  const stopDrill = useSessionStore((s) => s.stopDrill)

  const scen = drillScen ?? (activeScenarios.length === 1 ? activeScenarios[0] : null)

  if (!scen) {
    return (
      <div className="drill">
        <div className="txt">
          Drill доступний, коли увімкнено <b>рівно один сценарій</b> — ліки тренуються окремо для
          кожного.
        </div>
      </div>
    )
  }

  const pool = drillPool(pre, scen)
  const stats = drillStats(pre, scen)
  const name = SCENARIOS[scen].label

  if (drillScen) {
    const width = Math.min(100, Math.round((stats.n / DRILL.window) * 100))
    return (
      <div className="drill live">
        <div className="txt">
          DRILL · {name} — <b>{pool.length} рук у пулі</b>
          <br />
          останні {stats.n}/{DRILL.window}: <b>{stats.acc}%</b> · вихід при {DRILL.exitAcc}%
          {stats.done && (
            <>
              {' · '}
              <b>норму виконано</b>
            </>
          )}
        </div>
        <button type="button" className="stop" onClick={stopDrill}>
          Вийти з drill
        </button>
        <div className="bar">
          <i className={stats.done ? 'ready' : ''} style={{ width: `${width}%` }} />
        </div>
      </div>
    )
  }

  const can = canDrill(pre, scen)
  const positions = [...new Set(pool.map((x) => x.pos))].join(', ')

  return (
    <div className="drill">
      <div className="txt">
        {can ? (
          <>
            Пул ліків «{name}»: <b>{pool.length} рук</b> на позиціях {positions}.
            <br />
            Drill дає {Math.round(DRILL.poolShare * 100)}% цих рук +{' '}
            {Math.round((1 - DRILL.poolShare) * 100)}% контролів з тих самих позицій.
          </>
        ) : (
          <>
            Пул ліків «{name}» замалий ({pool.length}, треба {DRILL.minKeys}+). Зіграй звичайний
            режим — помилки наберуться самі.
          </>
        )}
      </div>
      <button type="button" disabled={!can} onClick={() => startDrill(scen)}>
        Запустити drill
      </button>
    </div>
  )
}
