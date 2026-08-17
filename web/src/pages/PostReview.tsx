/**
 * Вкладка «Розбір» Етапу 2: діагноз за патернами, а не просто відсотки.
 *
 * Дзеркалить префлопний Review — свідомо: обидва етапи мусять читатися
 * однаково, і правитись подумки в одному місці.
 */

import { useState } from 'react'

import { fetchEpisode, type EpisodeDecision } from '../api/serverPostProgress'
import { StatStrip } from '../components/StatStrip'
import {
  POST_ACT_LABEL,
  POST_CAT_LABEL,
  STREET_LABEL,
  buildPostReport,
  buildPostReview,
} from '../engine/postflop'
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

/** Розгорнута роздача: що герой робив на кожній вулиці і що мав робити. */
function EpisodeTable({ rows }: { rows: readonly EpisodeDecision[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Вулиця</th>
          <th>Борд</th>
          <th>Рука</th>
          <th>Банк</th>
          <th>Ти</th>
          <th>Правильно</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d, i) => (
          // Ключ за індексом свідомо: рішення однієї руки не переставляються.
          <tr key={i}>
            <td>{STREET_LABEL[d.street]}</td>
            <td className="c">{d.board}</td>
            <td className="c">{POST_CAT_LABEL[d.cat]}</td>
            <td className="c">{d.potBB}bb</td>
            <td className={d.ok ? 'b' : 'm'}>{POST_ACT_LABEL[d.chosen]}</td>
            <td className="b">{d.ok ? '—' : POST_ACT_LABEL[d.correct]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function PostReview() {
  const source = usePostStatsSource()
  const post = source.progress
  const [hint, setHint] = useState(HINT)
  const [open, setOpen] = useState<string | null>(null)
  const [hand, setHand] = useState<readonly EpisodeDecision[] | null>(null)
  const [handError, setHandError] = useState<string | null>(null)

  const r = buildPostReview(post)

  const onExpand = (ep: string) => {
    if (open === ep) {
      setOpen(null)
      return
    }
    setOpen(ep)
    setHand(null)
    setHandError(null)
    void fetchEpisode(ep)
      .then(setHand)
      .catch((e: unknown) => setHandError(e instanceof Error ? e.message : 'помилка мережі'))
  }

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
              <div key={m.key}>
                <div className="mrow">
                  <span className="h">{m.hand ?? m.cat}</span>
                  <span className="p">
                    {m.street} · {m.facing}
                  </span>
                  <span className="fix f">
                    {m.chosen} → має бути {m.correct}
                  </span>
                  <span className="n">
                    {m.n}×
                    {m.ep && source.fromServer && (
                      <button type="button" className="link" onClick={() => onExpand(m.ep ?? '')}>
                        {open === m.ep ? 'Згорнути' : 'Розгорнути роздачу'}
                      </button>
                    )}
                  </span>
                </div>

                {open === m.ep && (
                  <>
                    {handError !== null && (
                      <p className="note">
                        <strong>Не вдалося завантажити роздачу</strong>: {handError}
                      </p>
                    )}
                    {handError === null && hand === null && <p className="note">Завантажую…</p>}
                    {hand !== null && hand.length > 0 && <EpisodeTable rows={hand} />}
                    {hand !== null && hand.length === 0 && (
                      <p className="note">Ця роздача вже не зберігається в базі.</p>
                    )}
                  </>
                )}
              </div>
            ))}

            {!source.fromServer && (
              <p className="note">
                Роздача розгортається лише для синхронізованих рук: увесь її хід лежить у базі, а
                локально зберігаються тільки помилки. Увійди — і кожен спот можна буде переглянути
                вулиця за вулицею.
              </p>
            )}

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
