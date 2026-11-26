import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const native = vi.hoisted(() => ({ value: false }))
const ln = vi.hoisted(() => ({
  checkPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })),
  requestPermissions: vi.fn(() => Promise.resolve({ display: 'granted' })),
  schedule: vi.fn(() => Promise.resolve()),
  cancel: vi.fn(() => Promise.resolve()),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }))

import { scheduleTimerNotification, cancelTimerNotification, showTimerNotificationIfHidden } from '../lib/timerNotify'

describe('timerNotify（アプリ）', () => {
  beforeEach(() => { native.value = true; Object.values(ln).forEach(f => f.mockClear()) })

  it('終了時刻にローカル通知を予約する（前の予約は取り消す）', async () => {
    const at = new Date(2026, 10, 26, 10, 25).getTime()
    await scheduleTimerNotification('focus', at)
    expect(ln.cancel).toHaveBeenCalled()
    expect(ln.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({ title: '集中時間が終わりました', schedule: expect.objectContaining({ at: new Date(at) }) })],
    })
  })

  it('許可されていなければ予約しない', async () => {
    ln.checkPermissions.mockResolvedValueOnce({ display: 'denied' })
    await scheduleTimerNotification('break', Date.now() + 1000)
    expect(ln.schedule).not.toHaveBeenCalled()
  })

  it('取り消し', async () => {
    await cancelTimerNotification()
    expect(ln.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1001 }] })
  })
})

describe('timerNotify（Web）', () => {
  const ctor = vi.fn()
  let hidden = true
  beforeEach(() => {
    native.value = false
    ctor.mockClear()
    hidden = true
    vi.stubGlobal('Notification', Object.assign(function (this: object, title: string, opts: object) { ctor(title, opts) }, { permission: 'granted' }))
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('タブが裏にあるときだけ通知を出す', () => {
    showTimerNotificationIfHidden('focus')
    expect(ctor).toHaveBeenCalledWith('集中時間が終わりました', expect.objectContaining({ body: expect.any(String) }))
    hidden = false
    showTimerNotificationIfHidden('break')
    expect(ctor).toHaveBeenCalledTimes(1)
  })

  it('Web ではローカル通知の予約はしない', async () => {
    await scheduleTimerNotification('focus', Date.now() + 1000)
    expect(ln.schedule).not.toHaveBeenCalled()
  })
})
