import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const rt = vi.hoisted(() => ({
  onInsert: null as null | ((p: { new: Record<string, unknown> }) => void),
  removeChannel: vi.fn(),
  count: 3,
}))

vi.mock('../lib/supabase', () => {
  const channel = {
    on: (_t: string, _f: unknown, cb: (p: { new: Record<string, unknown> }) => void) => { rt.onInsert = cb; return channel },
    subscribe: () => channel,
  }
  return { supabase: { channel: () => channel, removeChannel: rt.removeChannel } }
})
vi.mock('../lib/db', () => ({ getFeedbackCount: () => Promise.resolve(rt.count) }))

import { useFeedbackAlerts } from '../hooks/useFeedbackAlerts'
import { markFeedbackViewed } from '../lib/feedbackAlerts'

describe('useFeedbackAlerts', () => {
  beforeEach(() => {
    localStorage.clear()
    rt.onInsert = null
    rt.count = 3
  })

  it('見ていない件数を数え、新しいものが届いたらお知らせを出す', async () => {
    localStorage.setItem('admin_feedback_viewed', '1')
    const { result } = renderHook(() => useFeedbackAlerts(true))
    await waitFor(() => expect(result.current.unread).toBe(2))
    act(() => rt.onInsert?.({ new: { content: 'ボタンが押せない' } }))
    expect(result.current.unread).toBe(3)
    expect(result.current.alert?.content).toBe('ボタンが押せない')
    act(() => result.current.dismissAlert())
    expect(result.current.alert).toBeNull()
  })

  it('管理画面で見たら、件数が 0 になる', async () => {
    const { result } = renderHook(() => useFeedbackAlerts(true))
    await waitFor(() => expect(result.current.unread).toBe(3))
    act(() => markFeedbackViewed(3))
    expect(result.current.unread).toBe(0)
  })

  it('管理者でなければ何もしない', () => {
    const { result } = renderHook(() => useFeedbackAlerts(false))
    expect(result.current.unread).toBe(0)
    expect(rt.onInsert).toBeNull()
  })
})
