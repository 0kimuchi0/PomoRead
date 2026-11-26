import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getFeedbackCount } from '../lib/db'
import { FEEDBACK_VIEWED_EVENT, readFeedbackViewed } from '../lib/feedbackAlerts'

export interface FeedbackAlert {
  id: number
  content: string
}

/**
 * 管理者向け: まだ見ていないフィードバックの件数と、アプリを開いている間に届いたもののお知らせ。
 * 新しいフィードバックは Supabase Realtime で受け取る（RLS により管理者にしか届かない）。
 */
export function useFeedbackAlerts(enabled: boolean) {
  const [total, setTotal] = useState(0)
  const [viewed, setViewed] = useState(readFeedbackViewed)
  const [alert, setAlert] = useState<FeedbackAlert | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const refresh = () => {
      void getFeedbackCount().then(n => { if (alive) setTotal(n) })
    }
    refresh()
    const channel = supabase
      .channel('admin-feedback-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feedback' }, payload => {
        const content = String((payload.new as { content?: unknown }).content ?? '')
        setTotal(t => t + 1)
        setAlert({ id: Date.now(), content })
      })
      .subscribe()
    const onViewed = () => setViewed(readFeedbackViewed())
    // 裏にいる間に届いた分は Realtime で受け取れないことがあるので、戻ったときに数え直す
    const onVisible = () => { if (!document.hidden) refresh() }
    window.addEventListener(FEEDBACK_VIEWED_EVENT, onViewed)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      void supabase.removeChannel(channel)
      window.removeEventListener(FEEDBACK_VIEWED_EVENT, onViewed)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])

  // お知らせは 10 秒で自動的に消す
  useEffect(() => {
    if (!alert) return
    const t = setTimeout(() => setAlert(null), 10000)
    return () => clearTimeout(t)
  }, [alert])

  return {
    unread: enabled ? Math.max(0, total - viewed) : 0,
    alert: enabled ? alert : null,
    dismissAlert: () => setAlert(null),
  }
}
