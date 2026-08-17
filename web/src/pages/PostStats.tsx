/**
 * Вкладка «Статистика» Етапу 2.
 *
 * Зрізи ті самі, що збирає рушій і віддає сервер (byStreet/byCat/byTex/byMode/
 * byFacing) — тут вони лише малюються. Скидання і видалення прогресу свідомо
 * лишаються на Етапі 1: обидві дії спільні для двох етапів, і дублювати кнопку,
 * яка стирає ще й префлоп, було б пасткою.
 */

import { PerPos, StatStrip } from '../components/StatStrip'
import {
  FACING_LABEL,
  POST_CATEGORIES,
  POST_CAT_LABEL,
  POST_SLICE_MIN,
  STREETS,
  STREET_LABEL,
  TEXTURES,
  TEX_LABEL,
  type Facing,
} from '../engine/postflop'
import { usePostStatsSource } from '../store/postStatsSource'

const MODES = ['HU·IP', 'HU·OOP', 'MULTI·IP', 'MULTI·OOP'] as const
const FACINGS: readonly Facing[] = ['none', 'small_bet', 'big_bet', 'raise']

type Tally = { t: number; c: number } | undefined

const pctOf = (d: Tally): number | null => (d && d.t ? Math.round((d.c / d.t) * 100) : null)

export function PostStats() {
  const source = usePostStatsSource()
  const post = source.progress

  const acc = post.total ? Math.round((post.correct / post.total) * 100) : 0

  const slice = (
    table: Record<string, Tally>,
    keys: readonly string[],
    label: (k: string) => string,
  ) =>
    keys.map((k) => ({
      name: label(k),
      acc: pctOf(table[k]),
      t: table[k]?.t ?? 0,
      min: POST_SLICE_MIN,
    }))

  return (
    <section>
      <div className="panel">
        {post.total === 0 ? (
          <div className="empty">
            Порожньо. Зіграй 50–70 рішень у «Тренуванні» —<br />
            після цього тут буде видно, які вулиці й категорії просідають.
          </div>
        ) : (
          <>
            <StatStrip
              cells={[
                { value: post.total, label: 'усього рішень' },
                { value: `${acc}%`, label: 'точність' },
                { value: post.best, label: 'рекордна серія' },
                { value: post.log.length, label: 'помилок у журналі' },
              ]}
            />

            <h4>За вулицями · поріг {POST_SLICE_MIN}+ рішень</h4>
            <PerPos items={slice(post.byStreet, STREETS, (k) => STREET_LABEL[k as 'flop'])} />

            <h4>За категорією руки</h4>
            <PerPos
              items={slice(post.byCat, POST_CATEGORIES, (k) => POST_CAT_LABEL[k as 'AIR'])}
            />

            <h4>За текстурою дошки</h4>
            <PerPos items={slice(post.byTex, TEXTURES, (k) => TEX_LABEL[k as 'DRY'])} />

            <h4>За типом споту</h4>
            <PerPos items={slice(post.byMode, MODES, (k) => k)} />

            <h4>За тим, що стоїть перед тобою</h4>
            <PerPos items={slice(post.byFacing, FACINGS, (k) => FACING_LABEL[k as Facing])} />

            <p className="note">
              Мультипот і мокрі дошки просідають першими майже завжди — і саме вони коштують
              найдорожче за реальним столом.
            </p>
          </>
        )}

        {source.error && (
          <p className="note">
            <strong>Серверні дані не завантажились</strong> ({source.error}). Показано історію цього
            браузера.
          </p>
        )}
        {source.fromServer && source.pending > 0 && (
          <p className="note">
            {source.pending} останніх рішень ще не синхронізовано — на стільки ж цифри нижчі за
            фактичні.
          </p>
        )}

        <div className="foot">
          <span>
            {source.fromServer
              ? 'Дані з сервера — зведені з усіх пристроїв'
              : 'Прогрес зберігається лише в цьому браузері'}
          </span>
          <span>Скидання прогресу — на вкладці «Статистика» Етапу 1, воно спільне для обох</span>
        </div>
      </div>
    </section>
  )
}
