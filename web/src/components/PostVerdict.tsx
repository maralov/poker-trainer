/**
 * Вердикт постфлопного рішення: правильність, контекст (рука/категорія/
 * текстура/режим столу), пояснення і — якщо ця відповідь завершила роздачу —
 * підсумок: хто скинув чи що показали на шоудауні.
 */

import {
  POST_FIX,
  POST_ACT_LABEL,
  POST_CAT_LABEL,
  TEX_LABEL,
  fixOfChoice,
  type EpisodeEnd,
  type HeroDecision,
  type PostAction,
  type PostDrillTarget,
} from '../engine/postflop'

export function PostVerdict({
  decision,
  ok,
  chosen,
  handOver,
  drill = null,
  onNext,
}: {
  decision: HeroDecision
  ok: boolean
  chosen: PostAction
  handOver: EpisodeEnd | null
  /** Drill-спот: вердикт називає патерн, який тут тренується. */
  drill?: PostDrillTarget | null
  onNext: () => void
}) {
  const fix = drill ? POST_FIX[drill.fix] : null
  // Помилка не обовʼязково та, яку тренує спот (на «замалому сайзі» можна й
  // чекнути) — пояснюємо те, що герой зробив насправді.
  const made = drill && !ok ? POST_FIX[fixOfChoice(decision, chosen)] : null
  return (
    <div className={`verdict ${ok ? 'ok' : 'no'}`}>
      <h3>{ok ? 'Правильно' : 'Помилка'}</h3>

      <div className="tags">
        <span className="tag hand">{decision.label}</span>
        <span className="tag">{decision.line === 'caller' ? 'колер' : 'агресор'}</span>
        <span className="tag">{POST_CAT_LABEL[decision.cat]}</span>
        <span className="tag">дошка {TEX_LABEL[decision.texture]}</span>
        <span className="tag">{decision.nOpps >= 2 ? 'мультипот' : 'хедз-ап'}</span>
        <span className="tag">{decision.ip ? 'IP' : 'OOP'}</span>
      </div>

      <p>
        Правильно тут — <strong>{POST_ACT_LABEL[decision.correct]}</strong>. {decision.why}
      </p>

      {drill && fix && (
        <p className="note">
          {drill.contrast ? (
            <>
              Контрольний спот до патерну <strong>«{fix.title}»</strong>: ситуація схожа, але рука
              інша — і правильна дія теж.
            </>
          ) : (
            <>
              <strong>{fix.title}.</strong>
              {made && made !== fix && ` Але цей вибір — інша помилка: «${made.title}».`}
              {made && ` ${made.text}`}
            </>
          )}
        </p>
      )}

      {!drill && handOver && (
        <p className="note">
          {handOver.kind === 'hero-folded' && 'Ти скинув — роздача завершена'}
          {handOver.kind === 'villains-folded' && 'Усі скинули, банк твій'}
          {handOver.kind === 'showdown' && (
            <>
              <strong>Шоудаун</strong>
              {handOver.shown.map((s) => (
                <span key={s.pos} style={{ display: 'block' }}>
                  {`${s.pos}: ${s.label}${s.won ? ' · переможець' : ''}`}
                </span>
              ))}
            </>
          )}
        </p>
      )}

      <button type="button" className="next" onClick={onNext}>
        {drill ? 'Наступний спот · пробіл' : handOver ? 'Наступна рука · пробіл' : 'Далі · пробіл'}
      </button>
    </div>
  )
}
