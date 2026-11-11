/**
 * Вкладка «Розбір» Етапу 2: діагноз за патернами, а не просто відсотки.
 *
 * Дзеркалить префлопний Review — свідомо: обидва етапи мусять читатися
 * однаково, і правитись подумки в одному місці.
 */

import { useState } from 'react'

import { fetchEpisode, type EpisodeDecision } from '../api/serverPostProgress'
import { MiniCards } from '../components/MiniCards'
import { StatStrip } from '../components/StatStrip'
import {
  FACING_LABEL,
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

/** Що зробив герой і, якщо помилився, що мав зробити. Позначки ✗/✓ — у CSS. */
function Fix({ chosen, correct, ok }: { chosen: string; correct: string; ok: boolean }) {
  return (
    <div className="fixline">
      <span className={ok ? 'yes' : 'no'}>{chosen}</span>
      {!ok && (
        <>
          <span className="arrow">→</span>
          <span className="yes">{correct}</span>
        </>
      )}
    </div>
  )
}

const oppsLabel = (n: number): string =>
  `${n} ${n === 1 ? 'опонент' : n < 5 ? 'опоненти' : 'опонентів'}`

/**
 * Розгорнута роздача: вулиця за вулицею — борд, банк, що було в руці, що герой
 * зробив і що мав. Стрічкою, а не таблицею: шість колонок не вміщались у телефон.
 */
function EpisodeSteps({ rows }: { rows: readonly EpisodeDecision[] }) {
  const hole = rows[0]?.hole
  return (
    <div className="ep-steps">
      {hole && (
        <div className="ep-hole">
          Твоя рука <MiniCards code={hole} />
        </div>
      )}
      {rows.map((d, i) => (
        // Ключ за індексом свідомо: рішення однієї руки не переставляються.
        <div key={i} className={`ep-step${d.ok ? '' : ' bad'}`}>
          <div className="ep-head">
            <b>{STREET_LABEL[d.street]}</b>
            <MiniCards code={d.board} />
            <span className="ep-pot">
              банк <span>{d.potBB}bb</span>
            </span>
          </div>
          <div className="spot-ctx">
            {POST_CAT_LABEL[d.cat]} · {FACING_LABEL[d.facing]}
          </div>
          <Fix
            chosen={POST_ACT_LABEL[d.chosen]}
            correct={POST_ACT_LABEL[d.correct]}
            ok={d.ok}
          />
        </div>
      ))}
    </div>
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
              <div className="spot" key={m.key}>
                <div className="spot-head">
                  <span className="spot-hand">{m.hand ?? m.cat}</span>
                  {m.hand && <span className="spot-cat">{m.cat}</span>}
                  <span className="spot-n">{m.n}×</span>
                </div>
                <div className="spot-ctx">
                  {m.street} · {m.facing}
                </div>
                <div className="spot-ctx">
                  {m.texture} дошка · {m.ip ? 'у позиції' : 'без позиції'} · {oppsLabel(m.opps)}
                </div>
                {m.board && <MiniCards code={m.board} />}
                <Fix chosen={m.chosen} correct={m.correct} ok={false} />

                {m.ep && source.fromServer && (
                  <button type="button" className="link" onClick={() => onExpand(m.ep ?? '')}>
                    {open === m.ep ? 'Згорнути' : 'Розгорнути роздачу'}
                  </button>
                )}

                {open === m.ep && (
                  <>
                    {handError !== null && (
                      <p className="note">
                        <strong>Не вдалося завантажити роздачу</strong>: {handError}
                      </p>
                    )}
                    {handError === null && hand === null && <p className="note">Завантажую…</p>}
                    {hand !== null && hand.length > 0 && <EpisodeSteps rows={hand} />}
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
