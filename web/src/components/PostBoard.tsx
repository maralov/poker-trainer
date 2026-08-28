/**
 * Стіл постфлопу: позиційна смужка героя, борд і карти героя вулиці, стрічка
 * подій роздачі. Без PokerTable — той зашитий під префлопний Spot і 9 сітів,
 * постфлопу потрібне простіше зведення (спека §6).
 */

import { STREET_LABEL, type EpisodeState, type HeroDecision } from '../engine/postflop'
import { HandCards } from './HandCards'
import { StatStrip } from './StatStrip'

export function PostBoard({
  episode,
  frozen = null,
}: {
  episode: EpisodeState
  /**
   * Рішення, вердикт якого зараз показано. Поки він на екрані, стіл треба
   * заморозити на моменті цього рішення: відповідь встигає прокрутити роздачу
   * далі, і без заморозки учень читав би пояснення про флоп, дивлячись на терн
   * і на банк, якого тоді ще не було. Що сталося потім — розповідає історія.
   */
  frozen?: HeroDecision | null
}) {
  const hero = episode.seats[episode.heroIdx]
  if (!hero) return null

  const street = frozen ? frozen.street : episode.street
  const board = frozen ? frozen.board : episode.board
  const potBB = frozen ? frozen.potBB : episode.potBB

  // «Ще в роздачі» — активні опоненти, фолднуті вже не рахуються.
  const active = episode.seats.filter((s) => !s.hero && !s.folded)
  const opponents = frozen
    ? `${frozen.nOpps} · ${frozen.oppPositions.join(', ')}`
    : `${active.length} · ${active.map((s) => s.pos).join(', ')}`

  return (
    <>
      <StatStrip
        cells={[
          { value: episode.heroPos, label: 'позиція', mono: true },
          { value: episode.ip ? 'у позиції' : 'поза позицією', label: 'статус', mono: true },
          { value: opponents, label: 'опоненти', mono: true },
          { value: `${potBB}bb`, label: 'банк', mono: true },
        ]}
      />

      <div className="board-lbl">{STREET_LABEL[street]}</div>
      <HandCards cards={board} hero={false} />

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
