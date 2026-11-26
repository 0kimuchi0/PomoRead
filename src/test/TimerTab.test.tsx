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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0, 0))
  })
  afterEach(() => { vi.useRealTimers() })

  it('休憩まで終わるほど離れていたら、集中を1回だけ記録し、戻った時刻から次の集中を始める', () => {
    const onSessionComplete = startWithBook()
    jumpAndReturn(8 * 60 * 60 * 1000)
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('集中', { selector: '.phase-badge' })).toBeInTheDocument()
    expect(screen.getByText('25:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /一時停止/ })).toBeInTheDocument()
    // 表示は秒の切り替わりの少しあと（10ms）に更新されるので、少し多めに進める
    act(() => { vi.advanceTimersByTime(60 * 1000 + 20) })
    expect(screen.getByText('24:00')).toBeInTheDocument()
  })

  it('休憩が終わった少しあとに戻っても、次の集中は戻った時刻から数える', () => {
    const onSessionComplete = startWithBook()
    // 集中は 10:25、休憩は 10:30 に終わる。10:31 に戻る
    jumpAndReturn(31 * 60 * 1000)
    expect(onSessionComplete).toHaveBeenCalledTimes(1)
    expect(screen.getByText('集中', { selector: '.phase-badge' })).toBeInTheDocument()
    expect(screen.getByText('25:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /一時停止/ })).toBeInTheDocument()
  })
})

describe('TimerTab の通知', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0, 0))
    Object.values(notify).forEach(f => f.mockClear())
  })
  afterEach(() => { vi.useRealTimers() })

  it('スタートで許可を確認し、集中の終了時刻に通知を予約する', async () => {
    startWithBook()
    expect(notify.requestTimerNotificationPermission).toHaveBeenCalledTimes(1)
    await act(async () => {})
    // アプリが裏にいても休憩の終わりを知らせられるよう、休憩の終わりもあわせて予約する
    expect(notify.scheduleTimerNotification).toHaveBeenCalledWith(
      'focus', new Date(2026, 10, 26, 10, 25, 0).getTime(), new Date(2026, 10, 26, 10, 30, 0).getTime(),
    )
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

describe('TimerTab の秒の精度', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0, 0))
  })
  afterEach(() => { vi.useRealTimers() })

  it('ちょうど1秒で表示が切り替わる', () => {
    startWithBook()
    act(() => { vi.advanceTimersByTime(999) })
    expect(screen.getByText('25:00')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(20) })
    expect(screen.getByText('24:59')).toBeInTheDocument()
  })

  it('一時停止と再開をくり返しても、1秒未満の端数を失わない', () => {
    startWithBook()
    for (let i = 0; i < 3; i++) {
      act(() => { vi.advanceTimersByTime(600) })
      fireEvent.click(screen.getByRole('button', { name: /一時停止/ }))
      fireEvent.click(screen.getByRole('button', { name: /スタート/ }))
    }
    // 動いていた合計は 1.8 秒なので、あと 0.2 秒少しで 24:58 になる
    act(() => { vi.advanceTimersByTime(250) })
    expect(screen.getByText('24:58')).toBeInTheDocument()
  })
})

describe('TimerTab の円のゲージ', () => {
  const CIRC = 2 * Math.PI * 88
  const ringOffset = () => {
    const el = document.querySelector('.ring-progress') as SVGCircleElement
    return parseFloat(el.style.strokeDashoffset || el.getAttribute('stroke-dashoffset') || 'NaN')
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    vi.setSystemTime(new Date(2026, 10, 26, 10, 0, 0))
  })
  afterEach(() => { vi.useRealTimers() })

  it('秒の途中でも止まらずに進む', () => {
    startWithBook()
    act(() => { vi.advanceTimersByTime(500) })
    // 25 分のうち 0.5 秒ぶん進んでいる（秒単位の更新だと、まだ 0 のまま）
    expect(ringOffset()).toBeCloseTo(CIRC * (1500 - 0.5) / 1500, 1)
    act(() => { vi.advanceTimersByTime(250) })
    expect(ringOffset()).toBeCloseTo(CIRC * (1500 - 0.75) / 1500, 1)
  })

  it('一時停止したら、その位置で止まり、停止すると元に戻る', () => {
    startWithBook()
    act(() => { vi.advanceTimersByTime(30 * 1000 + 400) })
    fireEvent.click(screen.getByRole('button', { name: /一時停止/ }))
    const paused = ringOffset()
    expect(paused).toBeCloseTo(CIRC * (1500 - 30.4) / 1500, 1)
    act(() => { vi.advanceTimersByTime(10 * 1000) })
    expect(ringOffset()).toBeCloseTo(paused, 5)
    // 停止ボタン（アイコンだけのボタン）
    fireEvent.click(document.querySelector('.timer-controls .btn-ghost') as HTMLElement)
    expect(ringOffset()).toBeCloseTo(CIRC, 5)
  })
})

describe('TimerTab の本の選択', () => {
  it('本棚に本が 1 冊もなければ、スタートしても集中は始まらず、本の追加を案内する', () => {
    const onSessionComplete = vi.fn()
    render(<TimerTab books={[]} sessions={[]} onSessionComplete={onSessionComplete} onStatusChange={vi.fn()} />)
    // 何も操作していないうちは、案内を出さない（エラーに見えるため）
    expect(screen.queryByText('本棚に本を追加してからスタートしてください')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /スタート/ }))
    expect(screen.getByRole('button', { name: /スタート/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /一時停止/ })).not.toBeInTheDocument()
    expect(screen.getByText('本棚に本を追加してからスタートしてください')).toBeInTheDocument()
  })

  it('読み終わった本しかないときも、スタートできない', () => {
    const done = { ...book, status: 'done' } as Book
    render(<TimerTab books={[done]} sessions={[]} onSessionComplete={vi.fn()} onStatusChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /スタート/ }))
    expect(screen.queryByRole('button', { name: /一時停止/ })).not.toBeInTheDocument()
    expect(screen.getByText('本棚に本を追加してからスタートしてください')).toBeInTheDocument()
  })

  it('本を選ばずにスタートを押したときだけ案内を出し、本を選ぶと消える', () => {
    render(<TimerTab books={[book]} sessions={[]} onSessionComplete={vi.fn()} onStatusChange={vi.fn()} />)
    expect(screen.queryByText('本を選択してからスタートしてください')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /スタート/ }))
    expect(screen.queryByRole('button', { name: /一時停止/ })).not.toBeInTheDocument()
    expect(screen.getByText('本を選択してからスタートしてください')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /本を選択/ }))
    fireEvent.click(screen.getByRole('button', { name: /テスト本/ }))
    expect(screen.queryByText('本を選択してからスタートしてください')).not.toBeInTheDocument()
  })
})
