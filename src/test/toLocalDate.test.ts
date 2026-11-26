import { describe, it, expect } from 'vitest'
import { toLocalDate } from '../lib/format'

describe('toLocalDate', () => {
  it('端末のタイムゾーンの日付を返す（深夜0時台でも前日にならない）', () => {
    expect(toLocalDate(new Date(2026, 10, 26, 0, 30))).toBe('2026-11-26')
    expect(toLocalDate(new Date(2026, 0, 5, 8, 59))).toBe('2026-01-05')
  })
})
