export type BookStatus = 'want' | 'reading' | 'done'
export type UserRole = 'user' | 'admin'

export interface Profile {
  id: string
  email: string
  role: UserRole
  banned: boolean
  createdAt: string
}

export type Genre = '小説' | 'ビジネス' | '自己啓発' | '技術' | '歴史' | 'その他'

export interface Book {
  id: string
  title: string
  author: string
  publisher?: string
  totalPages: number
  currentPage: number
  genre: Genre
  status: BookStatus
  sessions: number
  createdAt: string
  isbn?: string
  ccode?: string
  catalogNumber?: string
  ndc?: string
  memo?: string
}

export interface Session {
  id: string
  bookId: string
  bookTitle: string
  date: string
  duration: number
}

export interface SuggestBookDB {
  id: string
  title: string
  author: string
  genre: string
  publisher: string
  totalPages: number
  isbn?: string
  ccode?: string
  catalogNumber?: string
  ndc?: string
  /** 承認状態。DB から読んだものだけが持つ（approved: 全員に公開 / pending: 承認待ち / hidden: 非表示） */
  status?: SuggestStatus
  createdBy?: string | null
  createdAt?: string
}

export type SuggestStatus = 'approved' | 'pending' | 'hidden'

export type AdminActionType = 'role_change' | 'ban' | 'unban'

export type FeedbackStatus = 'pending' | 'in_progress' | 'done' | 'rejected'

export interface Feedback {
  id: string
  userId: string | null
  content: string
  status: FeedbackStatus
  createdAt: string
}

export interface AdminAction {
  id: string
  adminId: string
  targetUserId: string
  actionType: AdminActionType
  previousValue: string
  newValue: string
  reason: string
  createdAt: string
}
