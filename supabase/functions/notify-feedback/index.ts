// 新しいフィードバックが届いたことを、管理者に知らせる（メールと iPhone へのプッシュ通知）。
// アプリはフィードバックを送った直後にこの関数を呼ぶ。引数は受け取らず、
// まだ知らせていないフィードバック（notified_at が空）だけをまとめて送るので、何度呼ばれても同じものは二度送らない。
// メールとプッシュ通知は、シークレットが設定されているものだけ送る。
//
// 必要なシークレット（Supabase → Edge Functions → Secrets）
//   メール（Resend）
//     RESEND_API_KEY      : Resend の API キー（送信だけの権限でよい）
//     FEEDBACK_NOTIFY_TO  : 通知を受け取るメールアドレス（公開リポジトリに書かないためシークレットにする）
//     FEEDBACK_NOTIFY_FROM: 任意。差出人。既定は PomoRead <noreply@pomoread.com>（Resend で認証済みのドメインであること）
//   プッシュ通知（APNs）
//     APNS_KEY_ID         : Apple Developer → Keys で作った鍵の Key ID
//     APNS_TEAM_ID        : Apple Developer のチーム ID
//     APNS_PRIVATE_KEY    : 鍵ファイル（.p8）の中身をそのまま
//     APNS_BUNDLE_ID      : 任意。既定は com.readingpomodoro.app
//     APNS_SANDBOX        : 任意。Xcode から直接入れた開発用ビルドに送るときだけ true
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createApnsJwt, sendApns, type ApnsConfig } from '../_shared/apns.ts'

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

function firstLine(content: string, max: number): string {
  const line = content.trim().split('\n')[0]
  return line.length > max ? `${line.slice(0, max)}…` : line
}

export function buildMail(rows: FeedbackRow[]): { subject: string; text: string } {
  const subject = rows.length === 1
    ? `PomoRead: 新しいフィードバック「${firstLine(rows[0].content, 30)}」`
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

export function buildPush(rows: FeedbackRow[]): { title: string; body: string } {
  return rows.length === 1
    ? { title: '新しいフィードバック', body: firstLine(rows[0].content, 80) }
    : { title: `新しいフィードバックが ${rows.length} 件`, body: firstLine(rows[rows.length - 1].content, 80) }
}

// deno-lint-ignore no-explicit-any
type Admin = any

async function sendMail(rows: FeedbackRow[], apiKey: string, to: string, from: string): Promise<boolean> {
  const { subject, text } = buildMail(rows)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  })
  if (!res.ok) console.error('resend failed', res.status)
  return res.ok
}

/** 管理者の iPhone に送る。送り先の端末がなければ null（送っていない） */
async function sendPush(rows: FeedbackRow[], admin: Admin, config: ApnsConfig): Promise<boolean | null> {
  const { data: admins } = await admin.from('profiles').select('id').eq('role', 'admin')
  const adminIds = ((admins ?? []) as { id: string }[]).map(a => a.id)
  if (adminIds.length === 0) return null
  const { data: tokens } = await admin.from('push_tokens').select('token').eq('platform', 'ios').in('user_id', adminIds)
  const list = ((tokens ?? []) as { token: string }[]).map(t => t.token)
  if (list.length === 0) return null

  const jwt = await createApnsJwt(config)
  const message = { ...buildPush(rows), data: { kind: 'feedback' } }
  const results = await Promise.all(list.map(async token => [token, await sendApns(config, jwt, token, message)] as const))
  // アプリが消されたなどで使えなくなったトークンは片付ける
  const invalid = results.filter(([, r]) => r === 'invalid-token').map(([t]) => t)
  if (invalid.length > 0) await admin.from('push_tokens').delete().in('token', invalid)
  if (results.some(([, r]) => r === 'failed')) console.error('apns failed for some devices')
  return results.some(([, r]) => r === 'sent')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('FEEDBACK_NOTIFY_TO')
  const from = Deno.env.get('FEEDBACK_NOTIFY_FROM') ?? 'PomoRead <noreply@pomoread.com>'
  const mailReady = !!(resendKey && to)

  const apnsKeyId = Deno.env.get('APNS_KEY_ID')
  const apnsTeamId = Deno.env.get('APNS_TEAM_ID')
  const apnsKey = Deno.env.get('APNS_PRIVATE_KEY')
  const pushConfig: ApnsConfig | null = apnsKeyId && apnsTeamId && apnsKey
    ? {
      keyId: apnsKeyId,
      teamId: apnsTeamId,
      privateKey: apnsKey,
      bundleId: Deno.env.get('APNS_BUNDLE_ID') ?? 'com.readingpomodoro.app',
      sandbox: Deno.env.get('APNS_SANDBOX') === 'true',
    }
    : null

  if (!mailReady && !pushConfig) return json({ error: '通知先（メール・プッシュ通知）が設定されていません' }, 500)

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

  const [mail, push] = await Promise.all([
    mailReady ? sendMail(rows, resendKey!, to!, from).catch(() => false) : Promise.resolve(null),
    pushConfig ? sendPush(rows, admin, pushConfig).catch(e => { console.error('push error', e); return false }) : Promise.resolve(null),
  ])

  // どの方法でも届けられなかったら、次に呼ばれたときにまた送れるよう戻しておく
  const attempted = [mail, push].filter(r => r !== null)
  if (attempted.length === 0 || attempted.every(r => r === false)) {
    await admin.from('feedback').update({ notified_at: null }).in('id', rows.map(r => r.id))
    return json({ error: '通知を送れませんでした', mail, push }, 502)
  }
  return json({ sent: rows.length, mail, push })
})
