/**
 * Вкладка «Розбір» Етапу 2: діагноз за патернами, а не просто відсотки.
 *
 * Дзеркалить префлопний Review — свідомо: обидва етапи мусять читатися
 * однаково, і правитись подумки в одному місці.
 */

import { useState } from 'react'

import { StatStrip } from '../components/StatStrip'
import { buildPostReport, buildPostReview } from '../engine/postflop'
import { usePostStatsSource } from '../store/postStatsSource'

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

export function PostReview() {
  const post = usePostStatsSource().progress
  const [hint, setHint] = useState(HINT)

  const r = buildPostReview(post)

  const onCopy = () => {
    void copyText(buildPostReport(post))
      .then(() => setHint('Скопійовано — можна вставляти на розбір'))
      .catch(() => setHint('Не вдалося скопіювати — виділи текст вручну'))
      .finally(() => setTimeout(() => setHint(HINT), 2600))
  }

  return (
    <section>
      <div className="panel">
        {r.mistakes === 0 ? (
          <div className="empty">
            {r.played > 0 ? (
              <>У журналі {r.played} рішень і жодної помилки.</>
            ) : (
              <>
                Порожньо. Зіграй 50–70 рішень у «Тренуванні» —<br />
                після цього тут буде діагноз, а не просто відсотки.
              </>
            )}
          </div>
        ) : (
          <>
            <StatStrip
              cells={[
                { value: r.played, label: 'рішень' },
                { value: `${r.acc}%`, label: 'точність' },
                { value: r.mistakes, label: 'помилок' },
              ]}
            />

            {r.worstSlice && (
              <p className="note">
                Найслабше місце — <strong>{r.worstSlice.name}</strong>: {r.worstSlice.acc}% на{' '}
                {r.worstSlice.t} рішеннях. Саме там варто зіграти наступну сотню.
              </p>
            )}

            <h4>Головні патерни</h4>
            {r.findings.length ? (
              r.findings.map((f) => (
                <div className="finding" key={f.key}>
                  <b>
                    {f.title} · {f.n}×
                  </b>
                  <span>{f.text}</span>
                </div>
              ))
            ) : (
              <div className="empty">
                Помилки поки розсіяні — стійкого патерну не видно. Зіграй ще 50 рішень.
              </div>
            )}

            <h4>Споти, які треба закрити</h4>
            {r.topMistakes.map((m) => (
              <div className="mrow" key={m.key}>
                <span className="h">{m.hand ?? m.cat}</span>
                <span className="p">
                  {m.street} · {m.facing}
                </span>
                <span className="fix f">
                  {m.chosen} → має бути {m.correct}
                </span>
                <span className="n">{m.n}×</span>
              </div>
            ))}

            <p className="note">
              Правильну дію для кожної такої ситуації видно на вкладці «Схема рішень» — там ті самі
              матриці, за якими рушій оцінює твої рішення.
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
