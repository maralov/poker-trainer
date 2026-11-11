/**
 * Стіл постфлопу за зразком мобільного покер-клієнта: борд на сукні під
 * плашкою банку, ставки вулиці — фішками перед сітами, карти героя — на його
 * сіті. Стрічка подій роздачі — окремо (HandStory): на десктопі вона стоїть у
 * правій колонці, щоб не забирати висоту в стола.
 */

import { useLayoutEffect, useRef } from 'react'

import { BUILD, STREET_LABEL, type EpisodeState, type HeroDecision } from '../engine/postflop'
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
  const hero = episode.seats[episode.heroIdx]
  if (!hero) return null

  const street = frozen ? frozen.street : episode.street
  const board = frozen ? frozen.board : episode.board
  const potBB = frozen ? frozen.potBB : episode.potBB

  // Префлопна роль кожного, хто дійшов до флопу. Рушій її окремо не зберігає,
  // але вона однозначна з лінії: агресор — герой, решта коллили; на лінії
  // колера рейзив єдиний опонент, герой коллив.
  const role = (heroSeat: boolean): readonly [string, string] =>
    heroSeat === (episode.line === 'aggressor')
      ? [episode.scenario === 'iso' ? 'Ізо-рейз' : `Рейз ${BUILD.openBB}bb`, 'raise']
      : ['Колл', 'limp']

  const seatView = (pos: Position): SeatView => {
    const s = episode.seats.find((x) => x.pos === pos)
    // Кого немає серед сітів епізоду, той скинув ще на префлопі.
    if (!s) return { label: '', cls: '', folded: true }
    if (s.folded) return { label: 'Фолд', cls: '', folded: true }
    const [label, cls] = role(s.hero)
    // Під вердиктом ставки вулиці вже не ті, що були в момент рішення:
    // банк заморожений, а внески — ні. Тож їх просто не показуємо.
    return { label, cls, folded: false, bet: frozen ? 0 : s.put }
  }

  return (
    <Felt
        table={episode.table}
        heroPos={episode.heroPos}
        potBB={potBB}
        seat={seatView}
        tall
        heroCards={<HandCards cards={hero.hole} />}
        center={
          <>
            <HandCards cards={board} hero={false} />
            <div className="board-lbl">
              {STREET_LABEL[street]} · {episode.ip ? 'у позиції' : 'без позиції'}
            </div>
          </>
        }
      />
  )
}

/** Стрічка подій роздачі. */
export function HandStory({ episode }: { episode: EpisodeState }) {
  const storyRef = useRef<HTMLDivElement>(null)
  const storyLen = episode.history.length
  // У режимі «одне вікно» історія прокручується; найсвіжіша подія — внизу, тож
  // тримаємо її на виду, а не початок роздачі.
  useLayoutEffect(() => {
    const el = storyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [storyLen])

  if (storyLen === 0) return null
  return (
    <div className="hand-story" ref={storyRef}>
      {episode.history.map((line, i) => (
        // Ключ за індексом свідомо: історія лише росте в кінець і не
        // переставляється (engine робить тільки history.push).
        <span key={i}>{line}</span>
      ))}
    </div>
  )
}
