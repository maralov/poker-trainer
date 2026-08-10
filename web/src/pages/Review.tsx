/** Вкладка «Розбір»: діагноз за патернами помилок, а не просто відсотки. */

import { useState } from 'react'

import { Chips } from '../components/Chips'
import { PerPos, StatStrip } from '../components/StatStrip'
import { GATE } from '../engine/gate'
import { SCENARIOS } from '../engine/ranges'
import { CAT_LABEL, GRP_LABEL, buildReport, buildReview } from '../engine/review'
import { SCENARIO_KEYS, type Scenario } from '../engine/types'
import { useStatsSource } from '../store/statsSource'

const HINT = 'Звіт можна скопіювати і принести на розбір'

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Фолбек для контекстів без Clipboard API (http на телефоні тощо).
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

export function Review() {
  const pre = useStatsSource().progress
  const [scen, setScen] = useState<Scenario>('rfi')
  const [hint, setHint] = useState(HINT)

  const r = buildReview(pre, scen)

  const onCopy = () => {
    void copyText(buildReport(pre, scen))
      .then(() => setHint('Скопійовано — можна вставляти на розбір'))
      .catch(() => setHint('Не вдалося скопіювати — виділи текст вручну'))
      .finally(() => setTimeout(() => setHint(HINT), 2600))
  }

  return (
    <section>
      <div className="panel">
        <Chips
          items={SCENARIO_KEYS.map((k) => ({ key: k, label: SCENARIOS[k].label }))}
          isOn={(k) => k === scen}
          onPick={(k) => setScen(k as Scenario)}
        />

        {r.mistakes === 0 ? (
          <div className="empty">
            {r.played > 0 ? (
              <>У цьому сценарії {r.played} рук і жодної помилки в журналі.</>
            ) : (
              <>
                Порожньо. Зіграй 40–60 рук у «Тренуванні» —<br />
                після цього тут зʼявиться діагноз, а не просто відсотки.
              </>
            )}
          </div>
        ) : (
          <>
            <StatStrip
              cells={[
                { value: r.played, label: 'зіграно рук' },
                { value: `${r.acc}%`, label: 'точність' },
                { value: r.loose, label: 'зайвих відкриттів' },
                { value: r.tight, label: 'зайвих фолдів' },
              ]}
            />

            <p className="note" dangerouslySetInnerHTML={{ __html: r.biasLine }} />

            <h4>Головні патерни</h4>
            {r.findings.length ? (
              r.findings.map((f) => (
                <div className={`finding ${f.b}`} key={`${f.c}|${f.b}`}>
                  <b>
                    {CAT_LABEL[f.c]} · {f.b === 'loose' ? 'граєш зайве' : 'скидаєш зайве'} · {f.n}×
                  </b>
                  <span>{f.text}</span>
                </div>
              ))
            ) : (
              <div className="empty">
                Помилки поки розсіяні — стійкого патерну не видно. Зіграй ще 50 рук.
              </div>
            )}

            <h4>
              Позиції в цьому сценарії · поріг {GATE.acc}% при {GATE.posMin}+ руках
            </h4>
            <PerPos
              items={r.byPosition.map((x) => ({
                name: x.pos,
                acc: x.acc,
                t: x.t,
                min: GATE.posMin,
              }))}
            />

            {r.worstGroup && (
              <>
                <h4>Найслабша група позицій</h4>
                <div className={`finding ${r.worstGroup.bias}`}>
                  <b>
                    {GRP_LABEL[r.worstGroup.g]} · {r.worstGroup.n} помилок
                  </b>
                  <span>{r.worstGroup.text}</span>
                </div>
              </>
            )}

            <h4>Конкретні руки, які треба закрити</h4>
            {r.topMistakes.map((m) => (
              <div className="mrow" key={`${m.pos}|${m.hand}|${m.correct}`}>
                <span className="h">{m.hand}</span>
                <span className="p">{m.pos}</span>
                <span className={`fix ${m.isFold ? 'f' : ''}`}>
                  має бути {m.correct.toUpperCase()}
                </span>
                <span className="n">{m.n}×</span>
              </div>
            ))}

            <p className="note">
              Ці руки тренажер уже підмішує частіше за інші, доки ти не відповіси правильно кілька
              разів поспіль.
            </p>
          </>
        )}

        <div className="foot">
          <span>{hint}</span>
          <button type="button" className="link" onClick={onCopy}>
            Скопіювати звіт
          </button>
        </div>
      </div>
    </section>
  )
}
