/** Ряд чипів-перемикачів. `soft` — варіант із контурною підсвіткою. */

export function Chips<T extends string>({
  items,
  isOn,
  onPick,
  soft = false,
  disabled = false,
}: {
  items: readonly { key: T; label: string }[]
  isOn: (key: T) => boolean
  onPick: (key: T) => void
  soft?: boolean
  disabled?: boolean
}) {
  return (
    <div className="chips">
      {items.map((it) => (
        <button
          type="button"
          key={it.key}
          className={`chip${soft ? ' soft' : ''}${isOn(it.key) ? ' on' : ''}`}
          disabled={disabled}
          onClick={() => onPick(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}
