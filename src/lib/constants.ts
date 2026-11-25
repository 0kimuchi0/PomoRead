export const APP_BUNDLE_ID = 'com.readingpomodoro.app'
export const APP_URL_SCHEME = `${APP_BUNDLE_ID}://`

export const GITHUB_REPO_URL = 'https://github.com/daiki0828/PomoRead'

type IssueTemplate = '1-bug.yml' | '2-feature.yml' | '3-investigation.yml'

/** Issue の種類と、対応するフォーム・タイトルの接頭辞・本文を入れる欄（フォームの項目 ID） */
export type IssueKind = 'bug' | 'feature' | 'investigation'
export const ISSUE_KINDS: Record<IssueKind, { label: string; template: IssueTemplate; prefix: string; field: string }> = {
  bug: { label: '不具合', template: '1-bug.yml', prefix: '[Bug]', field: 'what' },
  feature: { label: '機能の要望', template: '2-feature.yml', prefix: '[Feature]', field: 'problem' },
  investigation: { label: '調査・質問', template: '3-investigation.yml', prefix: '[Investigate]', field: 'question' },
}

/**
 * Issue 作成画面の URL。フォームの項目 ID をクエリに渡すと、その欄に入力済みの状態で開く。
 * 例: issueUrl('2-feature.yml', { title: '[Feature] ...', problem: '...' })
 */
export function issueUrl(template?: IssueTemplate, fields: Record<string, string> = {}): string {
  if (!template) return `${GITHUB_REPO_URL}/issues`
  const params = new URLSearchParams({ template, ...fields })
  return `${GITHUB_REPO_URL}/issues/new?${params.toString()}`
}
