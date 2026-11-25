import { describe, it, expect } from 'vitest'
import { canonicalRedirectUrl } from '../lib/canonicalHost'

const base = {
  hostname: 'pomoread.vercel.app',
  pathname: '/',
  search: '',
  hash: '',
  hasLocalData: false,
}

describe('canonicalRedirectUrl', () => {
  it('旧アドレスで端末に記録がなければ pomoread.com へ移す', () => {
    expect(canonicalRedirectUrl(base)).toBe('https://pomoread.com/')
  })

  it('パスとクエリを引き継ぐ', () => {
    expect(canonicalRedirectUrl({ ...base, pathname: '/privacy.html', search: '?a=1' }))
      .toBe('https://pomoread.com/privacy.html?a=1')
  })

  it('旧プロジェクト名のアドレスも対象', () => {
    expect(canonicalRedirectUrl({ ...base, hostname: 'pomread.vercel.app' })).toBe('https://pomoread.com/')
  })

  it('端末にだけ記録がある人は移さない', () => {
    expect(canonicalRedirectUrl({ ...base, hasLocalData: true })).toBeNull()
  })

  it('pomoread.com・プレビュー・アプリ内では何もしない', () => {
    expect(canonicalRedirectUrl({ ...base, hostname: 'pomoread.com' })).toBeNull()
    expect(canonicalRedirectUrl({ ...base, hostname: 'pomoread-git-feature-0daiki0-projects.vercel.app' })).toBeNull()
    expect(canonicalRedirectUrl({ ...base, hostname: 'localhost' })).toBeNull()
  })

  it('ログイン・パスワード再設定のリンクから戻った直後は移さない', () => {
    expect(canonicalRedirectUrl({ ...base, search: '?code=abc' })).toBeNull()
    expect(canonicalRedirectUrl({ ...base, hash: '#access_token=x&type=recovery' })).toBeNull()
  })
})
