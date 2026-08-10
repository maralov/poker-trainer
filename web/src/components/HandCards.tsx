import type { Card } from '../engine/types'

export function HandCards({ cards, hero = true }: { cards: readonly Card[]; hero?: boolean }) {
  return (
    <div className="cards" style={{ marginTop: 14 }}>
      {cards.map((c, i) => (
        // Ключ за індексом свідомо: у роздачі рівно дві карти, і вони
        // замінюються цілим набором, а не переставляються.
        <div key={i} className={`card${c.red ? ' red' : ''}${hero ? ' hero' : ''}`}>
          <div className="r">{c.rk}</div>
          <div className="s">{c.g}</div>
        </div>
      ))}
    </div>
  )
}
