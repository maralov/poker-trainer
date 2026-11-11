/**
 * Стіл постфлопу: той самий стіл, що й на префлопі (хто ще в роздачі і скільки
 * поставив на вулиці), під ним борд і карти героя, далі стрічка подій роздачі.
 * Борд не на сукні: пʼять карт на вузькому екрані туди не вміщаються.
 */

import { useLayoutEffect, useRef } from 'react'

import { STREET_LABEL, type EpisodeState, type HeroDecision } from '../engine/postflop'
import type { Position } from '../engine/types'
import { HandCards } from './HandCards'
import { Felt, type SeatView } from './PokerTable'

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
  const storyRef = useRef<HTMLDivElement>(null)
  const storyLen = episode.history.length
  // У режимі «одне вікно» історія прокручується; найсвіжіша подія — внизу, тож
  // тримаємо її на виду, а не початок роздачі.
  useLayoutEffect(() => {
    const el = storyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [storyLen])

  const hero = episode.seats[episode.heroIdx]
  if (!hero) return null

  const street = frozen ? frozen.street : episode.street
  const board = frozen ? frozen.board : episode.board
  const potBB = frozen ? frozen.potBB : episode.potBB

  const seatView = (pos: Position): SeatView => {
    const s = episode.seats.find((x) => x.pos === pos)
    // Кого немає серед сітів епізоду, той скинув ще на префлопі.
    if (!s) return { label: '', cls: '', folded: true }
    if (s.folded) return { label: 'Фолд', cls: '', folded: true }
    // Під вердиктом ставки вулиці вже не ті, що були в момент рішення:
    // банк заморожений, а внески — ні. Тож їх просто не показуємо.
    if (frozen || s.put === 0) return { label: '', cls: '', folded: false }
    return { label: `${s.put}bb`, cls: 'raise', folded: false }
  }

  return (
    <>
      <Felt table={episode.table} heroPos={episode.heroPos} potBB={potBB} seat={seatView} />

      <div className="post-cards">
        <div>
          <div className="board-lbl">
            {STREET_LABEL[street]} · {episode.ip ? 'у позиції' : 'без позиції'}
          </div>
          <HandCards cards={board} hero={false} />
        </div>
        <div>
          <div className="board-lbl">Твої карти</div>
          <HandCards cards={hero.hole} />
        </div>
      </div>

      {episode.history.length > 0 && (
        <div className="hand-story" ref={storyRef}>
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
