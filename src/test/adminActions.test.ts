import { describe, it, expect, vi } from 'vitest'

const rows = [
  { id: '1', admin_id: 'a', target_user_id: 'u', action_type: 'role_change', previous_value: 'user', new_value: 'admin', reason: 'r', created_at: '2026-11-25T00:00:00Z' },
  { id: '2', admin_id: 'a', target_user_id: 'a', action_type: 'suggest_add', previous_value: '', new_value: '本', reason: '', created_at: '2026-11-24T00:00:00Z' },
  { id: '3', admin_id: 'a', target_user_id: 'u', action_type: 'ban', previous_value: 'false', new_value: 'true', reason: 'r', created_at: '2026-11-23T00:00:00Z' },
  { id: '4', admin_id: 'a', target_user_id: 'a', action_type: 'suggest_delete', previous_value: '本', new_value: '', reason: 'x', created_at: '2026-11-22T00:00:00Z' },
]

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
    })),
  },
}))

import { getAdminActions } from '../lib/db'

describe('getAdminActions', () => {
  it('サジェストの変更（以前に記録された分も含む）は操作履歴に出さない', async () => {
    const actions = await getAdminActions()
    expect(actions.map(a => a.id)).toEqual(['1', '3'])
  })
})
