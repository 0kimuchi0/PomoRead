import { describe, it, expect, vi } from 'vitest'

const tables: Record<string, unknown[]> = {
  books: [
    { id: 'b1', user_id: 'u1', title: 'A', author: 'x', publisher: '', genre: '小説', total_pages: 10, current_page: 0, sessions: 0, status: 'reading', created_at: '2026-01-01' },
    { id: 'b2', user_id: 'u2', title: 'B', author: 'x', publisher: '', genre: '小説', total_pages: 10, current_page: 0, sessions: 0, status: 'reading', created_at: '2026-01-02' },
  ],
  sessions: [
    { id: 's1', user_id: 'u1', book_id: 'b1', book_title: 'A', date: '2026-01-01', duration: 1500 },
  ],
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn((t: string) => ({
      select: () => ({ order: () => Promise.resolve({ data: tables[t], error: null }) }),
    })),
  },
}))

import { getAllBooksAdmin, getAllSessionsAdmin } from '../lib/db'

describe('管理画面のデータ読み込み', () => {
  it('本と記録に、だれのデータか（userId）が残る', async () => {
    const books = await getAllBooksAdmin()
    const sessions = await getAllSessionsAdmin()
    expect(books.map(b => [b.id, b.userId])).toEqual([['b1', 'u1'], ['b2', 'u2']])
    expect(sessions.map(s => [s.id, s.userId])).toEqual([['s1', 'u1']])
    expect(books.filter(b => b.userId === 'u1')).toHaveLength(1)
  })
})
