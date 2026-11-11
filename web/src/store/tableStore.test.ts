import { beforeEach, describe, expect, it } from 'vitest'

import { legacyClientId, toAttempt } from '../api/migrateLocal'
import { usePostSessionStore } from './postSessionStore'
import { useSessionStore } from './sessionStore'
import { ofTable, useTableStore } from './tableStore'

describe('ofTable', () => {
  it('подія без table_size належить 9-max', () => {
    const rows = [{ id: 1 }, { id: 2, table_size: '6max' }, { id: 3, table_size: '9max' }]
    expect(ofTable(rows, '9max').map((r) => r.id)).toEqual([1, 3])
    expect(ofTable(rows, '6max').map((r) => r.id)).toEqual([2])
  })
})

describe('перемикання формату', () => {
  beforeEach(() => {
    useTableStore.setState({ table: '9max' })
    useSessionStore.setState({ spot: null, drillScen: null, activeScenarios: ['rfi'] })
    usePostSessionStore.setState({ episode: null, drillOn: false })
  })

  it('роздає новий спот і нову роздачу у новому форматі', () => {
    useSessionStore.getState().next()
    usePostSessionStore.getState().deal()
    expect(useSessionStore.getState().spot?.table).toBe('9max')

    useTableStore.getState().setTable('6max')

    expect(useSessionStore.getState().spot?.table).toBe('6max')
    expect(usePostSessionStore.getState().episode?.table).toBe('6max')
  })

  it('вимикає drill: пул помилок у кожного формату свій', () => {
    useSessionStore.getState().next()
    useSessionStore.setState({ drillScen: 'rfi' })

    useTableStore.getState().setTable('6max')

    expect(useSessionStore.getState().drillScen).toBeNull()
  })
})

describe('перенесення локальної історії', () => {
  const e = { s: 'rfi', p: 'CO', h: '72o', ch: 'raise', co: 'fold', t: 1 } as const

  it('ключ 9-max не змінився — вже перенесене не переїде вдруге', () => {
    expect(legacyClientId(e)).toBe('legacy:1:rfi:CO:72o:raise')
    expect(legacyClientId(e, '9max')).toBe('legacy:1:rfi:CO:72o:raise')
  })

  it('6-max має власний ключ і формат у події', () => {
    expect(legacyClientId(e, '6max')).toBe('legacy:6max:1:rfi:CO:72o:raise')
    expect(toAttempt(e, '6max').table_size).toBe('6max')
  })
})
