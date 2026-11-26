// 新しいフィードバックが届いたことを、管理者にメール（Resend）で知らせる。
// アプリはフィードバックを送った直後にこの関数を呼ぶ。引数は受け取らず、
// まだ知らせていないフィードバック（notified_at が空）だけをまとめて送るので、何度呼ばれても同じものは二度送らない。
//
// 必要なシークレット（Supabase → Edge Functions → Secrets）
//   RESEND_API_KEY      : Resend の API キー（送信だけの権限でよい）
//   FEEDBACK_NOTIFY_TO  : 通知を受け取るメールアドレス（公開リポジトリに書かないためシークレットにする）
//   FEEDBACK_NOTIFY_FROM: 任意。差出人。既定は PomoRead <noreply@pomoread.com>（Resend で認証済みのドメインであること）
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface FeedbackRow {
  id: string
  content: string
  created_at: string
  user_id: string | null
}

function formatJst(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
}

export function buildMail(rows: FeedbackRow[]): { subject: string; text: string } {
  const subject = rows.length === 1
    ? `PomoRead: 新しいフィードバック「${rows[0].content.trim().split('\n')[0].slice(0, 30)}」`
    : `PomoRead: 新しいフィードバックが ${rows.length} 件届きました`
  const blocks = rows.map(r => [
    `■ ${formatJst(r.created_at)}（${r.user_id ? 'ログインユーザー' : 'ゲスト'}）`,
    r.content.trim(),
  ].join('\n'))
  const text = [
    ...blocks,
    '管理画面のフィードバックから確認・Issue にできます: https://pomoread.com',
  ].join('\n\n')
  return { subject, text }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('FEEDBACK_NOTIFY_TO')
  if (!resendKey || !to) return json({ error: 'RESEND_API_KEY / FEEDBACK_NOTIFY_TO が設定されていません' }, 500)
  const from = Deno.env.get('FEEDBACK_NOTIFY_FROM') ?? 'PomoRead <noreply@pomoread.com>'

  // まだ知らせていないものを「知らせた」に変えつつ取り出す（1つの UPDATE なので、同時に呼ばれても二重に送らない）
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin
    .from('feedback')
    .update({ notified_at: new Date().toISOString() })
    .is('notified_at', null)
    .select('id, content, created_at, user_id')
  if (error) return json({ error: 'フィードバックを読めませんでした' }, 500)
  const rows = ((data ?? []) as FeedbackRow[]).sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (rows.length === 0) return json({ sent: 0 })

  const { subject, text } = buildMail(rows)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  })
  if (!res.ok) {
    // 送れなかった分は次に呼ばれたときにまた送れるよう、戻しておく
    await admin.from('feedback').update({ notified_at: null }).in('id', rows.map(r => r.id))
    return json({ error: `メールを送れませんでした（${res.status}）` }, 502)
  }
  return json({ sent: rows.length })
})
