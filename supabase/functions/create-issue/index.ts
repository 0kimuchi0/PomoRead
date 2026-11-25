// 管理画面の「Issue にする」から呼ばれ、フィードバックを GitHub の Issue（不具合・機能の要望・調査）として作成する。
// GitHub のトークンはここ（サーバー側）にだけ置き、アプリには渡さない。
//
// 必要なシークレット（Supabase → Edge Functions → Secrets）
//   GITHUB_TOKEN: 対象リポジトリの Issues に「Read and write」権限を持つ fine-grained personal access token
//   GITHUB_REPO : 任意。既定は daiki0828/PomoRead
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

type IssueKind = 'bug' | 'feature' | 'investigation'

// .github/ISSUE_TEMPLATE のフォームと同じタイトル・ラベル・種類・見出しにそろえる
const KINDS: Record<IssueKind, { prefix: string; label: string; type: string; sections: (quoted: string) => string[] }> = {
  bug: {
    prefix: '[Bug]',
    label: 'bug',
    type: 'Bug',
    sections: quoted => [
      '### どこで起きましたか', '', 'わからない', '',
      '### どの画面ですか', '', 'その他・わからない', '',
      '### 何が起きましたか', '', 'アプリのフィードバックより:', '', quoted,
    ],
  },
  feature: {
    prefix: '[Feature]',
    label: 'feature',
    type: 'Feature',
    sections: quoted => [
      '### 困っていること・やりたいこと', '', 'アプリのフィードバックより:', '', quoted, '',
      '### こうなってほしい', '', '_未記入（管理画面でフィードバックから作成）_',
    ],
  },
  investigation: {
    prefix: '[Investigate]',
    label: 'question',
    type: 'Task',
    sections: quoted => [
      '### 調べたいこと', '', 'アプリのフィードバックより:', '', quoted, '',
      '### 何が分かれば完了か', '', '- [ ] ',
    ],
  },
}

function isIssueKind(value: unknown): value is IssueKind {
  return value === 'bug' || value === 'feature' || value === 'investigation'
}

function buildTitle(kind: IssueKind, content: string): string {
  const firstLine = content.trim().split('\n')[0]
  const summary = firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine
  return `${KINDS[kind].prefix} ${summary}`
}

// 公開リポジトリなので送信者の情報は載せない
function buildBody(kind: IssueKind, content: string): string {
  const quoted = content.trim().split('\n').map(line => `> ${line}`).join('\n')
  return KINDS[kind].sections(quoted).join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const githubToken = Deno.env.get('GITHUB_TOKEN')
  if (!githubToken) return json({ error: 'GITHUB_TOKEN が設定されていません' }, 500)
  const repo = Deno.env.get('GITHUB_REPO') ?? 'daiki0828/PomoRead'

  // 呼び出したユーザーの権限でデータベースを読む（RLS がそのまま効く）
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })

  const { data: role } = await supabase.rpc('get_my_role')
  if (role !== 'admin') return json({ error: '管理者のみ実行できます' }, 403)

  let feedbackId: string | undefined
  let kind: unknown = 'feature'
  try {
    const body = await req.json()
    feedbackId = body?.feedbackId
    kind = body?.kind ?? 'feature'
  } catch {
    // 下で弾く
  }
  if (!feedbackId) return json({ error: 'feedbackId がありません' }, 400)
  if (!isIssueKind(kind)) return json({ error: 'kind が不正です' }, 400)

  const { data: feedback, error: readError } = await supabase
    .from('feedback')
    .select('id, content, issue_url')
    .eq('id', feedbackId)
    .single()
  if (readError || !feedback) return json({ error: 'フィードバックが見つかりません' }, 404)
  // 二重に作らない
  if (feedback.issue_url) return json({ url: feedback.issue_url, existing: true })

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'pomoread-create-issue',
    },
    body: JSON.stringify({
      title: buildTitle(kind, feedback.content),
      body: buildBody(kind, feedback.content),
      labels: [KINDS[kind].label],
      type: KINDS[kind].type,
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    return json({ error: `GitHub への作成に失敗しました（${res.status}）`, detail: detail.slice(0, 500) }, 502)
  }
  const issue = await res.json() as { html_url: string; number: number }

  const { error: updateError } = await supabase
    .from('feedback')
    .update({ issue_url: issue.html_url })
    .eq('id', feedbackId)
  // Issue はできているので、記録に失敗しても URL は返す
  return json({ url: issue.html_url, number: issue.number, saved: !updateError })
})
