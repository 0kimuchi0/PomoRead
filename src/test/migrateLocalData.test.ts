import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn()
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ upsert })),
  },
}))

import { supabase } from '../lib/supabase'
import { migrateLocalDataToSupabase } from '../lib/db'
import { getBooks, saveBooks, getSessions, saveSessions } from '../storage'
import type { Book, Session } from '../types'

const book = (id: string): Book => ({
  id,
  title: `本${id}`,
  author: '著者',
  genre: '小説',
  totalPages: 100,
  currentPage: 0,
  sessions: 0,
  status: 'reading',
  createdAt: '2026-11-25T00:00:00.000Z',
} as Book)

const session = (id: string): Session => ({
  id,
  bookId: 'b1',
  bookTitle: '本b1',
  date: '2026-11-25',
  duration: 1500,
} as Session)

describe('migrateLocalDataToSupabase', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    upsert.mockResolvedValue({ error: null })
  })

  it('端末の本と記録をアカウントへ送り、送れた分を端末から消す', async () => {
    saveBooks([book('b1')])
    saveSessions([session('s1')])

    await migrateLocalDataToSupabase('user-1')

    expect(supabase.from).toHaveBeenCalledWith('books')
    expect(supabase.from).toHaveBeenCalledWith('sessions')
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[0][0][0]).toMatchObject({ id: 'b1', user_id: 'user-1' })
    expect(getBooks()).toEqual([])
    expect(getSessions()).toEqual([])
  })

  it('既存の行は上書きしない（ON CONFLICT DO NOTHING）', async () => {
    saveBooks([book('b1')])

    await migrateLocalDataToSupabase('user-1')

    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'id', ignoreDuplicates: true })
  })

  it('送信に失敗したら端末に残し、次回また送る', async () => {
    saveBooks([book('b1')])
    saveSessions([session('s1')])
    upsert.mockResolvedValueOnce({ error: { message: 'network error' } })

    await migrateLocalDataToSupabase('user-1')

    expect(getBooks()).toHaveLength(1)
    expect(getSessions()).toHaveLength(1)

    await migrateLocalDataToSupabase('user-1')

    expect(getBooks()).toEqual([])
    expect(getSessions()).toEqual([])
  })

  it('一度移行した端末でも、その後に記録した分は次のログインで送る', async () => {
    // 旧版で「移行済み」の印が付いた端末
    localStorage.setItem('pr_migrated', '1')
    saveBooks([book('b2')])

    await migrateLocalDataToSupabase('user-1')

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0][0]).toMatchObject({ id: 'b2' })
    expect(localStorage.getItem('pr_migrated')).toBeNull()
    expect(getBooks()).toEqual([])
  })

  it('送信中に追加された記録は消さない', async () => {
    saveBooks([book('b1')])
    upsert.mockImplementationOnce(async () => {
      saveBooks([...getBooks(), book('b3')])
      return { error: null }
    })

    await migrateLocalDataToSupabase('user-1')

    expect(getBooks().map(b => b.id)).toEqual(['b3'])
  })

  it('端末に何もなければ送らない', async () => {
    await migrateLocalDataToSupabase('user-1')
    expect(upsert).not.toHaveBeenCalled()
  })
})
