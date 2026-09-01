/**
 * Легенда до сітки 13×13. Одна на два екрани: «Діапазони» і вердикт після
 * відповіді — інакше та сама палітра описувалась би двічі й розійшлася б із
 * першою ж зміною кольору клітинки.
 *
 * Правило легенди: у ній рівно ті кольори, що є в сітці поруч, і рівно стільки
 * пунктів, скільки в ній дій. Діапазон агресії малюється двома відтінками brass
 * (`.cell.raise` і світліший `.cell.raise.pair`), але дія в них одна — світліше
 * лише позначає діагональ пар, тож це один пункт із двоколірним свотчем, а не
 * дві різні дії. Зелений зʼявляється тільки там, де є колл-діапазон.
 */

/** Свотч дії: два відтінки brass, бо саме ними сітка малює діапазон агресії. */
const PAIR_SPLIT = 'linear-gradient(135deg, var(--brass) 0 50%, var(--brass-dim) 50% 100%)'

interface Item {
  readonly label: string
  readonly color: string
  /** Свотч без заливки, самою рамкою: так сітка позначає руку героя. */
  readonly outlined?: boolean
}

export function RangeLegend({
  action,
  hasCall,
  hasHighlight = false,
  compact = false,
}: {
  /** Назва дії агресії в цьому сценарії: «рейз», «ізо-рейз», «3-бет», «4-бет». */
  action: string
  hasCall: boolean
  /** Сітка підсвічує руку героя — легенда має пояснити й рамку. */
  hasHighlight?: boolean
  /**
   * Стисла легенда для вердикту: без виноски про діагональ пар. Там вона з'їла б
   * рядок на екрані, який має вміститись у вікно цілком, а свотч дії й так
   * показує обидва відтінки під одним підписом.
   */
  compact?: boolean
}) {
  const items: Item[] = [
    { label: action, color: PAIR_SPLIT },
    ...(hasCall ? [{ label: 'Колл', color: 'var(--green-dim)' }] : []),
    { label: 'Фолд', color: 'var(--panel2)' },
    ...(hasHighlight ? [{ label: 'Твоя рука', color: 'var(--panel2)', outlined: true }] : []),
  ]

  return (
    <div className={`legend${compact ? ' compact' : ''}`}>
      {items.map((it) => (
        <span key={it.label}>
          <i className={it.outlined ? 'out' : undefined} style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
      {!compact && (
        <span className="legend-hint">
          світліший відтінок — орієнтир на діагональ пар, не окрема дія
        </span>
      )}
    </div>
  )
}
