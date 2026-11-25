import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/japanese', () => ({
  buildReadingIndex: vi.fn(),
  getReading: vi.fn(),
}))

import { candidateSuggestBooks } from '../suggestBooks'
import type { SuggestBookDB } from '../types'

const sb = (id: string, status: SuggestBookDB['status'], createdBy: string | null = null): SuggestBookDB => ({
  id, title: id, author: 'a', genre: '小説', publisher: 'p', totalPages: 0, status, createdBy,
})

describe('candidateSuggestBooks', () => {
  const books = [
    sb('approved', 'approved'),
    sb('mine-pending', 'pending', 'me'),
    sb('other-pending', 'pending', 'other'),
    sb('hidden', 'hidden', 'me'),
    sb('legacy', undefined),
  ]

  it('公開中と自分の承認待ちだけを候補にする', () => {
    expect(candidateSuggestBooks(books, 'me').map(b => b.id)).toEqual(['approved', 'mine-pending', 'legacy'])
  })

  it('未ログインなら公開中だけ', () => {
    expect(candidateSuggestBooks(books, null).map(b => b.id)).toEqual(['approved', 'legacy'])
  })
})
