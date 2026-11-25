import { getBooks, getSessions } from '../storage'

export const CANONICAL_ORIGIN = 'https://pomoread.com'

// Vercel が自動で付ける本番用のアドレス。プレビュー（pomoread-git-<ブランチ>-...）は対象外
const LEGACY_HOSTS = new Set([
  'pomoread.vercel.app',
  'pomread.vercel.app',
  'pomoread-0daiki0-projects.vercel.app',
  'pomoread-git-master-0daiki0-projects.vercel.app',
])

// ログインやパスワード再設定のリンクから戻ってきた直後は、この URL のまま処理する必要がある
const AUTH_PARAMS = ['code', 'access_token', 'refresh_token', 'token_hash', 'type', 'error', 'error_description']

function hasAuthParams(search: string, hash: string): boolean {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  return AUTH_PARAMS.some(k => query.has(k) || fragment.has(k))
}

export function hasLocalGuestData(): boolean {
  return getBooks().length > 0 || getSessions().length > 0
}

/**
 * 旧アドレス（*.vercel.app）で開かれたとき、pomoread.com へ移すべきかを判定する。
 * 端末にだけ記録が残っている人（未ログインで記録した人や、ログイン直後でまだ送信中の人）は、
 * 移すと記録が見えなくなるため移さない。ログイン済みの人の記録はアカウントにあるので移してよい。
 */
export function canonicalRedirectUrl(opts: {
  hostname: string
  pathname: string
  search: string
  hash: string
  hasLocalData: boolean
}): string | null {
  if (!LEGACY_HOSTS.has(opts.hostname)) return null
  if (hasAuthParams(opts.search, opts.hash)) return null
  if (opts.hasLocalData) return null
  return `${CANONICAL_ORIGIN}${opts.pathname}${opts.search}${opts.hash}`
}
