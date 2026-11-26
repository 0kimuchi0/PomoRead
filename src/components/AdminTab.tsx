import { useCallback, useEffect, useRef, useState } from 'react'
import { IconShield, IconUser, IconBan, IconRefresh, IconChartBar, IconBook, IconHistory, IconArrowBackUp, IconBookmark, IconPlus, IconTrash, IconPencil, IconDeviceFloppy, IconX, IconSearch, IconQuestionMark, IconMessage, IconCheck, IconEyeOff, IconBrandGithub } from '@tabler/icons-react'
import { getAllProfiles, updateUserRole, updateUserBanned, getAllBooksAdmin, getAllSessionsAdmin, logAdminAction, getAdminActions, revertAdminAction, getSuggestBooks, addSuggestBook, updateSuggestBook, updateSuggestStatus, deleteSuggestBook, getFeedbackList, updateFeedbackStatus } from '../lib/db'
import type { AdminBook, AdminSession } from '../lib/db'
import { validateBookFields, hasErrors, formatCcode } from '../lib/validate'
import { formatAuthor } from '../lib/format'
import type { FieldErrors } from '../lib/validate'
import { setAdminBooksCache, SUGGEST_BOOKS } from '../suggestBooks'
import { useAuth } from '../auth/AuthContext'
import { issueUrl, ISSUE_KINDS } from '../lib/constants'
import type { IssueKind } from '../lib/constants'
import type { Profile, UserRole, SuggestBookDB, SuggestStatus, Feedback, FeedbackStatus } from '../types'
import type { AdminAction } from '../types'
import ConfirmDialog from './ConfirmDialog'
import HelpModal from './HelpModal'
import { markFeedbackViewed, readFeedbackViewed } from '../lib/feedbackAlerts'
import IssueMenu from './IssueMenu'
import type { HelpItem } from './HelpModal'

const ADMIN_HELP: HelpItem[] = [
  {
    icon: <IconUser size={18} />,
    title: 'ユーザー管理',
    desc: 'ロール変更・BAN・BAN解除を行えます',
    detail: 'ユーザー一覧でロール（一般/管理者）の変更、BAN（利用停止）・BAN解除ができます。変更時には必ず理由の入力が必要で、操作は履歴に記録されます。BANされたユーザーは次回ログイン時に強制サインアウトされます。',
    image: <img src="/help/admin-users.svg" width="280" height="160" alt="" />,
  },
  {
    icon: <IconChartBar size={18} />,
    title: '全体統計',
    desc: '全ユーザーの読書状況をまとめて確認できます',
    detail: '総ユーザー数・登録冊数・読了冊数・セッション数・総集中時間・平均セッション数を一覧表示します。ユーザー別アクティビティでは各ユーザーの登録冊数とセッション数を多い順に確認できます。',
    image: <img src="/help/admin-stats.svg" width="280" height="160" alt="" />,
  },
  {
    icon: <IconBookmark size={18} />,
    title: 'サジェスト管理',
    desc: '全ユーザーの検索候補に表示される本を追加・インライン編集・削除できます',
    detail: '管理者が追加したサジェストは全ユーザーのタイトル入力候補として表示されます。タイトル・著者・出版社・ジャンル・ページ数・ISBN・Cコード・NDC・整理番号を登録できます。検索バーで絞り込み、各行の「編集」ボタンでインライン編集が可能です。ユーザーが本棚に登録した本は「承認待ち」として追加され、登録した本人にだけ候補に表示されます。「承認」すると全ユーザーに公開され、「非表示」にするとだれの候補にも出なくなります。各サジェストには登録日時と登録者が表示されます。サジェストの追加・編集・削除は操作履歴には記録されません。',
    image: <img src="/help/admin-suggest.svg" width="280" height="160" alt="" />,
  },
  {
    icon: <IconMessage size={18} />,
    title: 'フィードバック',
    desc: 'ユーザーから送られたフィードバックを確認・管理できます',
    detail: 'ユーザーが設定タブから送信したフィードバックを一覧表示します。ステータス（未着手・対応中・完了・却下）で絞り込みができ、各フィードバックのステータスをボタンで変更できます。未確認のフィードバックはナビのバッジで通知され、タブを開くと既読になります。未ログインユーザーからのフィードバックは「匿名」と表示されます。',
    image: <img src="/help/admin-feedback.svg" width="280" height="160" alt="" />,
  },
  {
    icon: <IconHistory size={18} />,
    title: '操作履歴',
    desc: 'ロール変更・BAN操作・サジェスト操作の履歴を確認・巻き戻せます',
    detail: 'ユーザー管理で行ったロール変更・BAN・BAN解除、およびサジェストの追加・編集・削除の操作が時系列で記録されます。ユーザー管理操作は「巻き戻し」ボタンで直前の状態に戻すことができます。巻き戻し操作も新たな履歴として記録されます。',
    image: <img src="/help/admin-history.svg" width="280" height="160" alt="" />,
  },
]

const SUGGEST_STATUS_LABEL: Record<SuggestStatus, string> = {
  approved: '公開中',
  pending: '承認待ち',
  hidden: '非表示',
}

const SUGGEST_FILTERS: [SuggestStatus | 'all', string][] = [
  ['all', 'すべて'],
  ['pending', '承認待ち'],
  ['approved', '公開中'],
  ['hidden', '非表示'],
]

// 「https://github.com/.../issues/12」→「#12」
function issueNumberLabel(url: string): string {
  const m = url.match(/\/issues\/(\d+)/)
  return m ? `#${m[1]}` : ''
}

// フィードバックの内容を、選んだ種類のフォームに入れた状態で開く
function feedbackIssueUrl(content: string, kind: IssueKind): string {
  const { template, prefix, field } = ISSUE_KINDS[kind]
  const firstLine = content.trim().split('\n')[0]
  const summary = firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine
  return issueUrl(template, {
    title: `${prefix} ${summary}`,
    [field]: `アプリのフィードバックより:\n\n${content.trim().split('\n').map(l => `> ${l}`).join('\n')}`,
  })
}

interface PendingAction {
  message: string
  confirmLabel: string
  danger: boolean
  /** 理由の入力を必須にするか（省略時は必須） */
  requireReason?: boolean
  onConfirm: (reason: string) => Promise<void>
}

export type AdminSection = 'users' | 'stats' | 'history' | 'suggests' | 'feedback'

export default function AdminTab({ initialSection = 'users' }: { initialSection?: AdminSection } = {}) {
  const { user } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [books, setBooks] = useState<AdminBook[]>([])
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [actions, setActions] = useState<AdminAction[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const loadingRef = useRef(false)
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection)
  const [feedbackList, setFeedbackList] = useState<Feedback[]>([])
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackStatus | 'all'>('all')
  const [showHelp, setShowHelp] = useState(false)
  const [suggestBooks, setSuggestBooks] = useState<SuggestBookDB[]>([])
  const [suggestForm, setSuggestForm] = useState({ title: '', author: '', genre: 'その他', publisher: '', totalPages: '', isbn: '', ccode: '', catalogNumber: '', ndc: '' })
  const [suggestAdding, setSuggestAdding] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedProgress, setSeedProgress] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ title: '', author: '', genre: 'その他', publisher: '', totalPages: '', isbn: '', ccode: '', catalogNumber: '', ndc: '' })
  const [suggestSearch, setSuggestSearch] = useState('')
  const [suggestFilter, setSuggestFilter] = useState<SuggestStatus | 'all'>('all')
  const [suggestAddErrors, setSuggestAddErrors] = useState<FieldErrors>({})
  const [suggestEditErrors, setSuggestEditErrors] = useState<FieldErrors>({})
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [viewedCount, setViewedCount] = useState(() => Number(localStorage.getItem('admin_history_viewed') ?? 0))
  const [feedbackViewedCount, setFeedbackViewedCount] = useState(readFeedbackViewed)

  const userId = user?.id
  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setLoadError(false)
    try {
      const [p, b, s, a, sb, fb] = await Promise.all([getAllProfiles(), getAllBooksAdmin(), getAllSessionsAdmin(), getAdminActions(), getSuggestBooks(), getFeedbackList()])
      setProfiles(p)
      setBooks(b)
      setSessions(s)
      setActions(a)
      setSuggestBooks(sb)
      setAdminBooksCache(sb, userId)
      setFeedbackList(fb)
      setViewedCount(prev => { const v = Math.min(prev, a.length); localStorage.setItem('admin_history_viewed', String(v)); return v })
      // 通知から開いたときは、フィードバックを見たことにする
      const viewedFb = initialSection === 'feedback' ? fb.length : Math.min(readFeedbackViewed(), fb.length)
      setFeedbackViewedCount(viewedFb)
      markFeedbackViewed(viewedFb)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [userId, initialSection])

  // 管理データをサーバーから読み込む（外部とのやり取りなので effect から呼ぶ）
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { load() }, [load])

  const confirm = (action: PendingAction) => setPending(action)
  const handleCancel = () => setPending(null)
  const handleConfirm = async (reason: string) => {
    if (!pending) return
    await pending.onConfirm(reason)
    setPending(null)
  }

  const handleRoleChange = (id: string, newRole: UserRole, email: string, currentRole: UserRole) => {
    const label = newRole === 'admin' ? '管理者' : '一般ユーザー'
    confirm({
      message: `${email} のロールを「${label}」に変更しますか？`,
      confirmLabel: '変更する',
      danger: newRole === 'admin',
      onConfirm: async (reason) => {
        await updateUserRole(id, newRole)
        await logAdminAction(id, 'role_change', currentRole, newRole, reason)
        setProfiles(prev => prev.map(p => p.id === id ? { ...p, role: newRole } : p))
        setActions(prev => [{
          id: crypto.randomUUID(),
          adminId: '',
          targetUserId: id,
          actionType: 'role_change',
          previousValue: currentRole,
          newValue: newRole,
          reason,
          createdAt: new Date().toISOString(),
        }, ...prev])
      },
    })
  }

  const handleBanToggle = (id: string, banned: boolean, email: string) => {
    confirm({
      message: banned ? `${email} をBANしますか？` : `${email} のBANを解除しますか？`,
      confirmLabel: banned ? 'BANする' : '解除する',
      danger: banned,
      onConfirm: async (reason) => {
        await updateUserBanned(id, banned)
        const actionType = banned ? 'ban' : 'unban'
        await logAdminAction(id, actionType, String(!banned), String(banned), reason)
        setProfiles(prev => prev.map(p => p.id === id ? { ...p, banned } : p))
        setActions(prev => [{
          id: crypto.randomUUID(),
          adminId: '',
          targetUserId: id,
          actionType,
          previousValue: String(!banned),
          newValue: String(banned),
          reason,
          createdAt: new Date().toISOString(),
        }, ...prev])
      },
    })
  }

  const handleRevert = (action: AdminAction) => {
    const target = profiles.find(p => p.id === action.targetUserId)
    const email = target?.email ?? action.targetUserId
    const actionLabel = action.actionType === 'role_change'
      ? `ロールを「${action.previousValue}」に戻す`
      : action.previousValue === 'true' ? 'BANに戻す' : 'BAN解除に戻す'

    confirm({
      message: `${email} の変更を巻き戻しますか？\n（${actionLabel}）`,
      confirmLabel: '巻き戻す',
      danger: false,
      onConfirm: async (reason) => {
        await revertAdminAction({ ...action, reason })
        await load()
      },
    })
  }

  const handleSeedSuggests = async () => {
    setSeeding(true)
    setSeedProgress('投入中...')
    let count = 0
    for (const book of SUGGEST_BOOKS) {
      await addSuggestBook({
        title: book.title,
        author: book.author,
        genre: book.genre,
        publisher: book.publisher,
        totalPages: book.totalPages,
      })
      count++
      setSeedProgress(`${count} / ${SUGGEST_BOOKS.length} 件処理中...`)
    }
    const sb = await getSuggestBooks()
    setSuggestBooks(sb)
    setAdminBooksCache(sb, user?.id)
    setSeedProgress(null)
    setSeeding(false)
  }

  const handleAddSuggest = async () => {
    if (!suggestForm.title.trim() || !suggestForm.author.trim() || !suggestForm.publisher.trim()) return
    const errs = validateBookFields(suggestForm)
    setSuggestAddErrors(errs)
    if (hasErrors(errs)) return
    setSuggestAdding(true)
    try {
      const newTitle = suggestForm.title.trim()
      await addSuggestBook({
        title: newTitle,
        author: formatAuthor(suggestForm.author.trim()),
        genre: suggestForm.genre,
        publisher: suggestForm.publisher.trim(),
        totalPages: Number(suggestForm.totalPages) || 0,
        isbn: suggestForm.isbn.trim() || undefined,
        ccode: suggestForm.ccode.trim() || undefined,
        catalogNumber: suggestForm.catalogNumber.trim() || undefined,
        ndc: suggestForm.ndc.trim() || undefined,
      })
      const sb = await getSuggestBooks()
      setSuggestBooks(sb)
      setAdminBooksCache(sb, user?.id)
      setSuggestForm({ title: '', author: '', genre: 'その他', publisher: '', totalPages: '', isbn: '', ccode: '', catalogNumber: '', ndc: '' })
      setSuggestAddErrors({})
    } catch (e) {
      console.error('サジェスト追加エラー:', e)
      alert(`追加に失敗しました: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSuggestAdding(false)
    }
  }

  const handleEditStart = (sb: SuggestBookDB) => {
    setEditingId(sb.id)
    setEditForm({ title: sb.title, author: sb.author, genre: sb.genre, publisher: sb.publisher, totalPages: String(sb.totalPages || ''), isbn: sb.isbn ?? '', ccode: sb.ccode ?? '', catalogNumber: sb.catalogNumber ?? '', ndc: sb.ndc ?? '' })
  }

  const handleEditSave = async (id: string) => {
    const errs = validateBookFields(editForm)
    setSuggestEditErrors(errs)
    if (hasErrors(errs)) return
    await updateSuggestBook({
      id,
      title: editForm.title.trim(),
      author: formatAuthor(editForm.author.trim()),
      genre: editForm.genre,
      publisher: editForm.publisher.trim(),
      totalPages: Number(editForm.totalPages) || 0,
      isbn: editForm.isbn.trim() || undefined,
      ccode: editForm.ccode.trim() || undefined,
      catalogNumber: editForm.catalogNumber.trim() || undefined,
      ndc: editForm.ndc.trim() || undefined,
    })
    setEditingId(null)
    setSuggestEditErrors({})
    const sb = await getSuggestBooks()
    setSuggestBooks(sb)
    setAdminBooksCache(sb, user?.id)
  }

  const handleDeleteSuggest = (id: string) => {
    const book = suggestBooks.find(b => b.id === id)
    const title = book?.title ?? ''
    confirm({
      message: `サジェスト「${title}」を削除しますか？`,
      confirmLabel: '削除する',
      danger: true,
      // サジェストの変更は操作履歴に残さないので、理由の入力も求めない
      requireReason: false,
      onConfirm: async () => {
        await deleteSuggestBook(id)
        const sb = await getSuggestBooks()
        setSuggestBooks(sb)
        setAdminBooksCache(sb, user?.id)
      },
    })
  }

  const handleSuggestStatus = async (id: string, status: SuggestStatus) => {
    await updateSuggestStatus(id, status)
    const sb = await getSuggestBooks()
    setSuggestBooks(sb)
    setAdminBooksCache(sb, user?.id)
  }

  const totalSessions = sessions.length
  const totalMinutes = sessions.reduce((sum, s) => sum + s.duration, 0)
  const totalBooks = books.length
  const doneBooks = books.filter(b => b.status === 'done').length

  const actionLabel = (a: AdminAction) => {
    const target = profiles.find(p => p.id === a.targetUserId)?.email ?? a.targetUserId
    if (a.actionType === 'role_change') return `${target} のロールを「${a.previousValue}」→「${a.newValue}」に変更`
    if (a.actionType === 'ban') return `${target} をBAN`
    return `${target} のBANを解除`
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  return (
    <div className="admin-tab">
      <div className="admin-header">
        <IconShield size={20} />
        <h2>管理者パネル</h2>
        <div className="admin-header-actions">
          <button className="admin-refresh-btn" onClick={load} title="更新">
            <IconRefresh size={16} />
          </button>
          <a className="help-btn" href={issueUrl()} target="_blank" rel="noopener noreferrer" title="GitHub の Issue 一覧を開く">
            <IconBrandGithub size={15} />
            Issue
          </a>
          <button className="help-btn" onClick={() => setShowHelp(true)}>
            <IconQuestionMark size={15} />
            使い方
          </button>
        </div>
      </div>

      <div className="admin-nav">
        <button className={`admin-nav-btn${activeSection === 'users' ? ' active' : ''}`} onClick={() => setActiveSection('users')}>
          <IconUser size={16} /> ユーザー管理
        </button>
        <button className={`admin-nav-btn${activeSection === 'stats' ? ' active' : ''}`} onClick={() => setActiveSection('stats')}>
          <IconChartBar size={16} /> 全体統計
        </button>
        <button className={`admin-nav-btn${activeSection === 'suggests' ? ' active' : ''}`} onClick={() => setActiveSection('suggests')}>
          <IconBookmark size={16} /> サジェスト
        </button>
        <button className={`admin-nav-btn${activeSection === 'feedback' ? ' active' : ''}`} onClick={() => { setActiveSection('feedback'); setFeedbackViewedCount(feedbackList.length); markFeedbackViewed(feedbackList.length) }}>
          <IconMessage size={16} /> フィードバック
          {feedbackList.length > feedbackViewedCount && <span className="admin-history-badge">{feedbackList.length - feedbackViewedCount}</span>}
        </button>
        <button className={`admin-nav-btn${activeSection === 'history' ? ' active' : ''}`} onClick={() => { setActiveSection('history'); setViewedCount(actions.length); localStorage.setItem('admin_history_viewed', String(actions.length)) }}>
          <IconHistory size={16} /> 操作履歴
          {actions.length > viewedCount && <span className="admin-history-badge">{actions.length - viewedCount}</span>}
        </button>
      </div>

      {loading ? (
        <div className="admin-loading">読み込み中...</div>
      ) : loadError ? (
        <div className="admin-load-error">
          <p>データの読み込みに失敗しました</p>
          <button className="admin-refresh-btn" onClick={load}><IconRefresh size={14} /> 再試行</button>
        </div>
      ) : activeSection === 'users' ? (
        <div className="admin-section">
          <p className="admin-count">{profiles.length} アカウント</p>
          <div className="admin-user-list">
            {profiles.map(p => (
              <div key={p.id} className={`admin-user-card${p.banned ? ' banned' : ''}`}>
                <div className="admin-user-info">
                  <span className="admin-user-email">{p.email || '(メールなし)'}</span>
                  <span className="admin-user-meta">
                    {books.filter(b => b.userId === p.id).length} 冊 ·{' '}
                    {sessions.filter(s => s.userId === p.id).length} セッション
                  </span>
                </div>
                <div className="admin-user-actions">
                  <select
                    className="admin-role-select"
                    value={p.role}
                    onChange={e => handleRoleChange(p.id, e.target.value as UserRole, p.email, p.role)}
                  >
                    <option value="user">一般</option>
                    <option value="admin">管理者</option>
                  </select>
                  <button
                    className={`admin-ban-btn${p.banned ? ' unbanning' : ''}`}
                    onClick={() => handleBanToggle(p.id, !p.banned, p.email)}
                    title={p.banned ? 'BANを解除' : 'BANする'}
                  >
                    <IconBan size={15} />
                    {p.banned ? '解除' : 'BAN'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeSection === 'stats' ? (
        <div className="admin-section">
          <div className="admin-stats-grid">
            <div className="admin-stat-card"><span className="admin-stat-value">{profiles.length}</span><span className="admin-stat-label">総ユーザー数</span></div>
            <div className="admin-stat-card"><span className="admin-stat-value">{totalBooks}</span><span className="admin-stat-label">総登録冊数</span></div>
            <div className="admin-stat-card"><span className="admin-stat-value">{doneBooks}</span><span className="admin-stat-label">総読了冊数</span></div>
            <div className="admin-stat-card"><span className="admin-stat-value">{totalSessions}</span><span className="admin-stat-label">総セッション数</span></div>
            <div className="admin-stat-card"><span className="admin-stat-value">{totalMinutes}</span><span className="admin-stat-label">総集中時間（分）</span></div>
            <div className="admin-stat-card"><span className="admin-stat-value">{profiles.length > 0 ? Math.round(totalSessions / profiles.length) : 0}</span><span className="admin-stat-label">平均セッション数/人</span></div>
          </div>
          <h3 className="admin-section-title"><IconBook size={16} /> ユーザー別アクティビティ</h3>
          <div className="admin-user-list">
            {profiles
              .map(p => ({ ...p, bookCount: books.filter(b => b.userId === p.id).length, sessionCount: sessions.filter(s => s.userId === p.id).length }))
              .sort((a, b) => b.sessionCount - a.sessionCount)
              .map(p => (
                <div key={p.id} className="admin-user-card">
                  <span className="admin-user-email">{p.email || '(メールなし)'}</span>
                  <div className="admin-user-activity"><span>{p.bookCount} 冊</span><span>{p.sessionCount} セッション</span></div>
                </div>
              ))}
          </div>
        </div>
      ) : activeSection === 'history' ? (
        <div className="admin-section">
          {actions.length === 0 ? (
            <p className="admin-empty">操作履歴はありません</p>
          ) : (() => {
            const unread = actions.slice(0, actions.length - viewedCount)
            const read = actions.slice(actions.length - viewedCount)
            const renderCard = (a: AdminAction) => (
              <div key={a.id} className="admin-action-card">
                <div className="admin-action-info">
                  <span className="admin-action-desc">{actionLabel(a)}</span>
                  <span className="admin-action-reason">理由: {a.reason}</span>
                  <span className="admin-action-date">{formatDate(a.createdAt)}</span>
                </div>
                <button className="admin-revert-btn" onClick={() => handleRevert(a)} title="この変更を巻き戻す">
                  <IconArrowBackUp size={15} />巻き戻し
                </button>
              </div>
            )
            return (
              <>
                {unread.length > 0 && (
                  <>
                    <p className="admin-history-section-label unread">未確認 {unread.length}件</p>
                    <div className="admin-action-list">{unread.map(renderCard)}</div>
                  </>
                )}
                {read.length > 0 && (
                  <>
                    <p className="admin-history-section-label">{unread.length > 0 ? '確認済み' : `全 ${read.length}件`}</p>
                    <div className="admin-action-list">{read.map(renderCard)}</div>
                  </>
                )}
              </>
            )
          })()}
        </div>
      ) : activeSection === 'feedback' ? (
        <div className="admin-section">
          {(() => {
            const unreadCount = Math.max(0, feedbackList.length - feedbackViewedCount)
            const unreadItems = feedbackList.slice(0, unreadCount)
            const getUnread = (val: FeedbackStatus | 'all') =>
              val === 'all' ? unreadCount : unreadItems.filter(f => f.status === val).length
            return (
          <div className="feedback-filter-row">
            {([['all', 'すべて'], ['pending', '未着手'], ['in_progress', '対応中'], ['done', '完了'], ['rejected', '却下']] as [FeedbackStatus | 'all', string][]).map(([val, label]) => {
              const unread = getUnread(val)
              return (
              <button
                key={val}
                className={`feedback-filter-btn${feedbackFilter === val ? ' active' : ''}${val !== 'all' ? ` feedback-filter-btn--${val}` : ''}`}
                onClick={() => setFeedbackFilter(val)}
              >
                {label}
                {unread > 0 && <span className="feedback-filter-count">{unread}</span>}
              </button>
            )})}
          </div>
            )
          })()}
          {feedbackList.length === 0 ? (
            <p className="admin-empty">フィードバックはありません</p>
          ) : (() => {
            const filtered = feedbackFilter === 'all' ? feedbackList : feedbackList.filter(f => f.status === feedbackFilter)
            return filtered.length === 0 ? (
              <p className="admin-empty">該当するフィードバックはありません</p>
            ) : (
            <>
              <p className="admin-count">{filtered.length} / {feedbackList.length} 件</p>
              <div className="admin-action-list">
                {filtered.map(f => {
                  const sender = f.userId ? profiles.find(p => p.id === f.userId)?.email ?? f.userId : '匿名'
                  return (
                    <div key={f.id} className="admin-feedback-card">
                      <div className="admin-feedback-meta">
                        <span className="admin-feedback-sender">{sender}</span>
                        <span className="admin-action-date">{formatDate(f.createdAt)}</span>
                      </div>
                      <p className="admin-feedback-content">{f.content}</p>
                      <div className="feedback-issue-row">
                        {f.issueUrl ? (
                          <a className="feedback-issue-link" href={f.issueUrl} target="_blank" rel="noopener noreferrer">
                            <IconBrandGithub size={13} /> Issue {issueNumberLabel(f.issueUrl)} を開く
                          </a>
                        ) : (
                          <IssueMenu formUrl={kind => feedbackIssueUrl(f.content, kind)} />
                        )}
                      </div>
                      <div className="feedback-status-picker">
                        {([['pending', '未着手'], ['in_progress', '対応中'], ['done', '完了'], ['rejected', '却下']] as [FeedbackStatus, string][]).map(([val, label]) => (
                          <button
                            key={val}
                            className={`feedback-status-btn feedback-status-btn--${val}${f.status === val ? ' active' : ''}`}
                            onClick={async () => {
                              if (f.status === val) return
                              await updateFeedbackStatus(f.id, val)
                              setFeedbackList(prev => prev.map(x => x.id === f.id ? { ...x, status: val } : x))
                            }}
                          >{label}</button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
            )
          })()}
        </div>
      ) : (
        <div className="admin-section">
          <div className="admin-suggest-form">
            <input
              className="admin-suggest-input"
              placeholder="タイトル *"
              value={suggestForm.title}
              onChange={e => setSuggestForm(f => ({ ...f, title: e.target.value }))}
            />
            <input
              className="admin-suggest-input"
              placeholder="著者 *"
              value={suggestForm.author}
              onChange={e => setSuggestForm(f => ({ ...f, author: e.target.value }))}
            />
            <select
              className="admin-role-select"
              value={suggestForm.genre}
              onChange={e => setSuggestForm(f => ({ ...f, genre: e.target.value }))}
            >
              {['小説', 'ビジネス', '自己啓発', '技術', '歴史', 'その他'].map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <input
              className="admin-suggest-input"
              placeholder="出版社 *"
              value={suggestForm.publisher}
              onChange={e => setSuggestForm(f => ({ ...f, publisher: e.target.value }))}
            />
            <input
              className="admin-suggest-input admin-suggest-pages"
              placeholder="ページ数"
              type="number"
              min="0"
              value={suggestForm.totalPages}
              onChange={e => setSuggestForm(f => ({ ...f, totalPages: e.target.value }))}
            />
            <div style={{ display: 'contents' }}>
              <input className={`admin-suggest-input${suggestAddErrors.isbn ? ' field-error' : ''}`} placeholder="ISBN" value={suggestForm.isbn} onChange={e => { setSuggestForm(f => ({ ...f, isbn: e.target.value })); setSuggestAddErrors(p => ({ ...p, isbn: undefined })) }} />
              {suggestAddErrors.isbn && <span className="field-error-msg admin-suggest-error">{suggestAddErrors.isbn}</span>}
            </div>
            <div style={{ display: 'contents' }}>
              <input className={`admin-suggest-input${suggestAddErrors.ccode ? ' field-error' : ''}`} placeholder="Cコード（例：0093）" value={suggestForm.ccode} onChange={e => { setSuggestForm(f => ({ ...f, ccode: formatCcode(e.target.value) })); setSuggestAddErrors(p => ({ ...p, ccode: undefined })) }} />
              {suggestAddErrors.ccode && <span className="field-error-msg admin-suggest-error">{suggestAddErrors.ccode}</span>}
            </div>
            <div style={{ display: 'contents' }}>
              <input className={`admin-suggest-input${suggestAddErrors.catalogNumber ? ' field-error' : ''}`} placeholder="整理番号" value={suggestForm.catalogNumber} onChange={e => { setSuggestForm(f => ({ ...f, catalogNumber: e.target.value })); setSuggestAddErrors(p => ({ ...p, catalogNumber: undefined })) }} />
              {suggestAddErrors.catalogNumber && <span className="field-error-msg admin-suggest-error">{suggestAddErrors.catalogNumber}</span>}
            </div>
            <div style={{ display: 'contents' }}>
              <input className={`admin-suggest-input${suggestAddErrors.ndc ? ' field-error' : ''}`} placeholder="NDC" value={suggestForm.ndc} onChange={e => { setSuggestForm(f => ({ ...f, ndc: e.target.value })); setSuggestAddErrors(p => ({ ...p, ndc: undefined })) }} />
              {suggestAddErrors.ndc && <span className="field-error-msg admin-suggest-error">{suggestAddErrors.ndc}</span>}
            </div>
            <button
              className="admin-suggest-add-btn"
              onClick={handleAddSuggest}
              disabled={suggestAdding || !suggestForm.title.trim() || !suggestForm.author.trim() || !suggestForm.publisher.trim()}
            >
              <IconPlus size={15} /> 追加
            </button>
          </div>
          {suggestBooks.length < SUGGEST_BOOKS.length && (
            <div className="admin-seed-row">
              <span className="admin-seed-hint">初期サジェスト（{SUGGEST_BOOKS.length}件）がDBに未登録です</span>
              <button className="admin-suggest-add-btn" onClick={handleSeedSuggests} disabled={seeding}>
                <IconPlus size={15} /> 初期データを投入
              </button>
              {seedProgress && <span className="admin-seed-progress">{seedProgress}</span>}
            </div>
          )}
          <div className="bookshelf-search-wrap" style={{ margin: '8px 0' }}>
            <IconSearch size={15} className="bookshelf-search-icon" />
            <input
              className="bookshelf-search-input"
              value={suggestSearch}
              onChange={e => setSuggestSearch(e.target.value)}
              placeholder="タイトル・著者・出版社で検索..."
              autoComplete="off"
            />
            {suggestSearch && (
              <button className="bookshelf-search-clear" onClick={() => setSuggestSearch('')} title="クリア">
                <IconX size={13} />
              </button>
            )}
          </div>
          {(() => {
            const q = suggestSearch.trim().toLowerCase()
            const byStatus = suggestFilter === 'all' ? suggestBooks : suggestBooks.filter(sb => (sb.status ?? 'approved') === suggestFilter)
            const filtered = q ? byStatus.filter(sb =>
              sb.title.toLowerCase().includes(q) ||
              sb.author.toLowerCase().includes(q) ||
              sb.publisher.toLowerCase().includes(q) ||
              sb.genre.toLowerCase().includes(q) ||
              (sb.isbn ?? '').toLowerCase().includes(q) ||
              (sb.ccode ?? '').toLowerCase().includes(q) ||
              (sb.catalogNumber ?? '').toLowerCase().includes(q) ||
              (sb.ndc ?? '').toLowerCase().includes(q)
            ) : byStatus
            const countOf = (val: SuggestStatus | 'all') =>
              val === 'all' ? suggestBooks.length : suggestBooks.filter(sb => (sb.status ?? 'approved') === val).length
            const filterRow = (
              <div className="feedback-filter-row">
                {SUGGEST_FILTERS.map(([val, label]) => (
                  <button
                    key={val}
                    className={`feedback-filter-btn${suggestFilter === val ? ' active' : ''}${val !== 'all' ? ` suggest-filter-btn--${val}` : ''}`}
                    onClick={() => setSuggestFilter(val)}
                  >
                    {label}
                    {val === 'pending' && countOf('pending') > 0 && <span className="feedback-filter-count">{countOf('pending')}</span>}
                  </button>
                ))}
              </div>
            )
            if (suggestBooks.length === 0) return <p className="admin-empty">サジェストはありません</p>
            if (filtered.length === 0) return (
              <>
                {filterRow}
                <p className="admin-empty">{q ? `「${suggestSearch}」に一致するサジェストが見つかりません` : '該当するサジェストはありません'}</p>
              </>
            )
            return (
              <>
                {filterRow}
                <p className="admin-count">{filtered.length} / {countOf(suggestFilter)} 件</p>
                <div className="admin-user-list">
                  {filtered.map(sb => editingId === sb.id ? (
                <div key={sb.id} className="admin-user-card admin-suggest-edit-card">
                  <div className="admin-suggest-edit-fields">
                    <input className="admin-suggest-input" placeholder="タイトル *" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
                    <input className="admin-suggest-input" placeholder="著者 *" value={editForm.author} onChange={e => setEditForm(f => ({ ...f, author: e.target.value }))} />
                    <select className="admin-role-select" value={editForm.genre} onChange={e => setEditForm(f => ({ ...f, genre: e.target.value }))}>
                      {['小説', 'ビジネス', '自己啓発', '技術', '歴史', 'その他'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <input className="admin-suggest-input" placeholder="出版社" value={editForm.publisher} onChange={e => setEditForm(f => ({ ...f, publisher: e.target.value }))} />
                    <input className="admin-suggest-input admin-suggest-pages" placeholder="ページ数" type="number" min="0" value={editForm.totalPages} onChange={e => setEditForm(f => ({ ...f, totalPages: e.target.value }))} />
                    <div style={{ display: 'contents' }}>
                      <input className={`admin-suggest-input${suggestEditErrors.isbn ? ' field-error' : ''}`} placeholder="ISBN" value={editForm.isbn} onChange={e => { setEditForm(f => ({ ...f, isbn: e.target.value })); setSuggestEditErrors(p => ({ ...p, isbn: undefined })) }} />
                      {suggestEditErrors.isbn && <span className="field-error-msg admin-suggest-error">{suggestEditErrors.isbn}</span>}
                    </div>
                    <div style={{ display: 'contents' }}>
                      <input className={`admin-suggest-input${suggestEditErrors.ccode ? ' field-error' : ''}`} placeholder="Cコード（例：0093）" value={editForm.ccode} onChange={e => { setEditForm(f => ({ ...f, ccode: formatCcode(e.target.value) })); setSuggestEditErrors(p => ({ ...p, ccode: undefined })) }} />
                      {suggestEditErrors.ccode && <span className="field-error-msg admin-suggest-error">{suggestEditErrors.ccode}</span>}
                    </div>
                    <div style={{ display: 'contents' }}>
                      <input className={`admin-suggest-input${suggestEditErrors.catalogNumber ? ' field-error' : ''}`} placeholder="整理番号" value={editForm.catalogNumber} onChange={e => { setEditForm(f => ({ ...f, catalogNumber: e.target.value })); setSuggestEditErrors(p => ({ ...p, catalogNumber: undefined })) }} />
                      {suggestEditErrors.catalogNumber && <span className="field-error-msg admin-suggest-error">{suggestEditErrors.catalogNumber}</span>}
                    </div>
                    <div style={{ display: 'contents' }}>
                      <input className={`admin-suggest-input${suggestEditErrors.ndc ? ' field-error' : ''}`} placeholder="NDC" value={editForm.ndc} onChange={e => { setEditForm(f => ({ ...f, ndc: e.target.value })); setSuggestEditErrors(p => ({ ...p, ndc: undefined })) }} />
                      {suggestEditErrors.ndc && <span className="field-error-msg admin-suggest-error">{suggestEditErrors.ndc}</span>}
                    </div>
                  </div>
                  <div className="admin-suggest-edit-actions">
                    <button className="admin-suggest-add-btn" onClick={() => handleEditSave(sb.id)} disabled={!editForm.title.trim() || !editForm.author.trim() || !editForm.publisher.trim()}><IconDeviceFloppy size={15} /> 保存</button>
                    <button className="admin-ban-btn" onClick={() => setEditingId(null)}><IconX size={15} /> キャンセル</button>
                  </div>
                </div>
              ) : (
                <div key={sb.id} className="admin-user-card">
                  <div className="admin-user-info">
                    <span className="admin-user-email">
                      {sb.title}
                      <span className={`suggest-status-badge suggest-status-badge--${sb.status ?? 'approved'}`}>{SUGGEST_STATUS_LABEL[sb.status ?? 'approved']}</span>
                    </span>
                    <span className="admin-user-meta">{formatAuthor(sb.author)} / {sb.genre}{sb.publisher ? ` / ${sb.publisher}` : ''}{sb.totalPages ? ` / ${sb.totalPages}p` : ''}</span>
                    <span className="admin-user-meta">
                      登録: {sb.createdAt ? formatDate(sb.createdAt) : '不明'}
                      {' / '}
                      {sb.createdBy == null ? '登録者不明' : profiles.find(p => p.id === sb.createdBy)?.email ?? 'ユーザー'}
                    </span>
                  </div>
                  <div className="admin-user-actions">
                    {(sb.status ?? 'approved') !== 'approved' && (
                      <button className="admin-edit-btn" onClick={() => handleSuggestStatus(sb.id, 'approved')} title={sb.status === 'pending' ? '承認して全ユーザーに公開' : '公開に戻す'}>
                        <IconCheck size={15} /> {sb.status === 'pending' ? '承認' : '公開に戻す'}
                      </button>
                    )}
                    {(sb.status ?? 'approved') !== 'hidden' && (
                      <button className="admin-ban-btn" onClick={() => handleSuggestStatus(sb.id, 'hidden')} title="だれの候補にも出さない">
                        <IconEyeOff size={15} /> 非表示
                      </button>
                    )}
                    <button className="admin-edit-btn" onClick={() => handleEditStart(sb)} title="編集"><IconPencil size={15} /> 編集</button>
                    <button className="admin-delete-btn" onClick={() => handleDeleteSuggest(sb.id)} title="削除"><IconTrash size={15} /> 削除</button>
                  </div>
                </div>
              ))}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          danger={pending.danger}
          requireReason={pending.requireReason ?? true}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
      {showHelp && <HelpModal title="管理者パネルの使い方" items={ADMIN_HELP} onClose={() => setShowHelp(false)} />}
    </div>
  )
}
