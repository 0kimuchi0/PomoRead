import { describe, it, expect, vi, beforeEach } from 'vitest'

const env = vi.hoisted(() => ({ native: true, platform: 'ios' }))
const listeners = vi.hoisted(() => ({} as Record<string, (arg: unknown) => void>))
const pn = vi.hoisted(() => ({
  checkPermissions: vi.fn(() => Promise.resolve({ receive: 'prompt' })),
  requestPermissions: vi.fn(() => Promise.resolve({ receive: 'granted' })),
  register: vi.fn(() => Promise.resolve()),
  addListener: vi.fn((name: string, cb: (arg: unknown) => void) => { listeners[name] = cb; return Promise.resolve({ remove: vi.fn() }) }),
}))
const rpc = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => env.native, getPlatform: () => env.platform } }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: pn }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc } }))

import { registerAdminPush, unregisterAdminPush } from '../lib/adminPush'

describe('adminPush', () => {
  beforeEach(() => {
    env.native = true
    env.platform = 'ios'
    localStorage.clear()
    Object.values(pn).forEach(f => f.mockClear())
    rpc.mockClear()
  })

  it('許可を取り、届いたトークンを今のユーザーの端末として登録する', async () => {
    await registerAdminPush(vi.fn())
    expect(pn.requestPermissions).toHaveBeenCalled()
    expect(pn.register).toHaveBeenCalled()
    listeners.registration({ value: 'TOKEN1' })
    expect(rpc).toHaveBeenCalledWith('register_push_token', { p_token: 'TOKEN1', p_platform: 'ios' })
    expect(localStorage.getItem('pr_push_token')).toBe('TOKEN1')
  })

  it('フィードバックの通知をタップしたら、フィードバックを開く', async () => {
    const open = vi.fn()
    await registerAdminPush(open)
    listeners.pushNotificationActionPerformed({ notification: { data: { kind: 'feedback' } } })
    expect(open).toHaveBeenCalled()
  })

  it('許可されなければ登録しない', async () => {
    pn.requestPermissions.mockResolvedValueOnce({ receive: 'denied' })
    await registerAdminPush(vi.fn())
    expect(pn.register).not.toHaveBeenCalled()
  })

  it('Web では何もしない', async () => {
    env.native = false
    await registerAdminPush(vi.fn())
    expect(pn.checkPermissions).not.toHaveBeenCalled()
  })

  it('ログアウト前に、この端末の登録を外す', async () => {
    localStorage.setItem('pr_push_token', 'TOKEN1')
    await unregisterAdminPush()
    expect(rpc).toHaveBeenCalledWith('unregister_push_token', { p_token: 'TOKEN1' })
    expect(localStorage.getItem('pr_push_token')).toBeNull()
  })
})
