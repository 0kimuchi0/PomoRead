import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import { createIssueFromFeedback } from '../lib/db'

describe('createIssueFromFeedback', () => {
  beforeEach(() => invoke.mockReset())

  it('Edge Function を呼び、作成した Issue の URL を返す', async () => {
    invoke.mockResolvedValue({ data: { url: 'https://github.com/daiki0828/PomoRead/issues/12', number: 12 }, error: null })
    await expect(createIssueFromFeedback('fb-1')).resolves.toBe('https://github.com/daiki0828/PomoRead/issues/12')
    expect(invoke).toHaveBeenCalledWith('create-issue', { body: { feedbackId: 'fb-1', kind: 'feature' } })
  })

  it('選んだ種類（不具合・調査）を渡す', async () => {
    invoke.mockResolvedValue({ data: { url: 'https://github.com/daiki0828/PomoRead/issues/13' }, error: null })
    await createIssueFromFeedback('fb-2', 'bug')
    await createIssueFromFeedback('fb-3', 'investigation')
    expect(invoke).toHaveBeenNthCalledWith(1, 'create-issue', { body: { feedbackId: 'fb-2', kind: 'bug' } })
    expect(invoke).toHaveBeenNthCalledWith(2, 'create-issue', { body: { feedbackId: 'fb-3', kind: 'investigation' } })
  })

  it('Edge Function のエラーメッセージをそのまま伝える', async () => {
    const context = new Response(JSON.stringify({ error: 'GITHUB_TOKEN が設定されていません' }), { status: 500 })
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context } })
    await expect(createIssueFromFeedback('fb-1')).rejects.toThrow('GITHUB_TOKEN が設定されていません')
  })
})
