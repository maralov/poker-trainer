/**
 * Стіл постфлопу: позиційна смужка героя, борд і карти героя вулиці, стрічка
 * подій роздачі. Без PokerTable — той зашитий під префлопний Spot і 9 сітів,
 * постфлопу потрібне простіше зведення (спека §6).
 */

import { STREET_LABEL, type EpisodeState } from '../engine/postflop'
import { HandCards } from './HandCards'
import { StatStrip } from './StatStrip'

export function PostBoard({ episode }: { episode: EpisodeState }) {
  const hero = episode.seats[episode.heroIdx]
  if (!hero) return null

  // «Ще в роздачі» — активні опоненти, фолднуті вже не рахуються.
  const active = episode.seats.filter((s) => !s.hero && !s.folded)

  return (
    <>
      <StatStrip
        style={{ marginBottom: 22 }}
        cells={[
          { value: episode.heroPos, label: 'позиція', mono: true },
          { value: episode.ip ? 'у позиції' : 'поза позицією', label: 'статус', mono: true },
          {
            value: `${active.length} · ${active.map((s) => s.pos).join(', ')}`,
            label: 'опоненти',
            mono: true,
          },
          { value: `${episode.potBB}bb`, label: 'банк', mono: true },
        ]}
      />

      <div className="board-lbl">{STREET_LABEL[episode.street]}</div>
      <HandCards cards={episode.board} hero={false} />

      <div className="board-lbl">Твої карти</div>
      <HandCards cards={hero.hole} />

      {episode.history.length > 0 && (
        <div className="hand-story">
          {episode.history.map((line, i) => (
            // Ключ за індексом свідомо: історія лише росте в кінець і не
            // переставляється (engine робить тільки history.push).
            <span key={i}>{line}</span>
          ))}
        </div>
      )}
    </>
  )
}
