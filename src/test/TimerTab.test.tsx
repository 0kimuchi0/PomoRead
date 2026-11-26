import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import TimerTab from '../components/TimerTab'
import type { Book } from '../types'

const notify = vi.hoisted(() => ({
  requestTimerNotificationPermission: vi.fn(() => Promise.resolve()),
  scheduleTimerNotification: vi.fn(() => Promise.resolve()),
  cancelTimerNotification: vi.fn(() => Promise.resolve()),
  showTimerNotificationIfHidden: vi.fn(),
}))
vi.mock('../lib/timerNotify', () => notify)

const book = {
  id: 'b1', title: 'テスト本', author: '著者', totalPages: 100, currentPage: 0,
  genre: 'other', status: 'reading', sessions: 0, createdAt: '2026-11-01',
} as unknown as Book

function startWithBook(onSessionComplete = vi.fn()) {
  render(<TimerTab books={[book]} sessions={[]} onSessionComplete={onSessionComplete} onStatusChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /本を選択/ }))
  fireEvent.click(screen.getByRole('button', { name: /テスト本/ }))
  fireEvent.click(screen.getByRole('button', { name: /スタート/ }))
  return onSessionComplete
}

// setInterval が呼ばれない（裏で止まっている）まま時間だけ進め、画面に戻ったことにする
function jumpAndReturn(ms: number) {
  act(() => {
    vi.setSystemTime(Date.now() + ms)
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('TimerTab のタイマー', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0, 0))
  })
  afterEach(() => { vi.useRealTimers() })

  it('裏にいる間も時間が進み、戻ったときに正しい残り時間を表示する', () => {
    startWithBook()
    jumpAndReturn(10 * 60 * 1000)
    expect(screen.getByText('15:00')).toBeInTheDocument()
  })

  it('裏にいる間に集中が終わっていたら、1回だけ記録して休憩に移る', () => {
    const onSessionComplete = startWithBook()
    jumpAndReturn(26 * 60 * 1000)
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    expect(onSessionComplete.mock.calls[0][1]).toMatchObject({ bookId: 'b1', duration: 25, date: '2026-11-26' })
    expect(screen.getByText('休憩', { selector: '.phase-badge' })).toBeInTheDocument()
    // 集中の終了（10:25）から 1 分経っているので、休憩は残り 4 分
    expect(screen.getByText('04:00')).toBeInTheDocument()
  })

  it('一時停止中は時間が進まない', () => {
    startWithBook()
    jumpAndReturn(5 * 60 * 1000)
    fireEvent.click(screen.getByRole('button', { name: /一時停止/ }))
    jumpAndReturn(60 * 60 * 1000)
    expect(screen.getByText('20:00')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /スタート/ }))
    jumpAndReturn(60 * 1000)
    expect(screen.getByText('19:00')).toBeInTheDocument()
  })
})

describe('TimerTab の長時間放置', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0, 0))
  })
  afterEach(() => { vi.useRealTimers() })

  it('休憩まで終わるほど離れていたら、集中を1回だけ記録して止まる', () => {
    const onSessionComplete = startWithBook()
    jumpAndReturn(8 * 60 * 60 * 1000)
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('集中', { selector: '.phase-badge' })).toBeInTheDocument()
    expect(screen.getByText('25:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /スタート/ })).toBeInTheDocument()
  })
})

describe('TimerTab の通知', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0, 0))
    Object.values(notify).forEach(f => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  it('スタートで許可を確認し、集中の終了時刻に通知を予約する', async () => {
    startWithBook()
    expect(notify.requestTimerNotificationPermission).toHaveBeenCalledTimes(1)
    await act(async () => {})
    expect(notify.scheduleTimerNotification).toHaveBeenCalledWith('focus', new Date(2026, 10, 26, 10, 25, 0).getTime())
  })

  it('集中が終わったら終わったことを知らせ、休憩の終わりを予約し直す', async () => {
    startWithBook()
    await act(async () => {})
    jumpAndReturn(25 * 60 * 1000)
    expect(notify.showTimerNotificationIfHidden).toHaveBeenCalledWith('focus')
    expect(notify.scheduleTimerNotification).toHaveBeenLastCalledWith('break', new Date(2026, 10, 26, 10, 30, 0).getTime())
  })

  it('一時停止・停止すると予約を取り消す', () => {
    startWithBook()
    fireEvent.click(screen.getByRole('button', { name: /一時停止/ }))
    expect(notify.cancelTimerNotification).toHaveBeenCalled()
  })
})
