import { useState, useEffect, useRef, useCallback } from 'react'
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerStop,
  IconSettings,
  IconBook,
  IconQuestionMark,
  IconClock,
  IconRefresh,
  IconChartBar,
  IconChevronDown,
  IconCheck,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import type { Book, Session } from '../types'
import HelpModal from './HelpModal'
import { toLocalDate } from '../lib/format'
import { requestTimerNotificationPermission, scheduleTimerNotification, cancelTimerNotification, showTimerNotificationIfHidden } from '../lib/timerNotify'

// 円のゲージの円周（半径 88）
const RING_CIRCUMFERENCE = 2 * Math.PI * 88

const TIMER_HELP = [
  {
    icon: <IconClock size={18} />,
    title: 'ポモドーロタイマー',
    desc: '集中時間が終わると自動で休憩フェーズへ切り替わります',
    detail: 'ポモドーロ法は25分の集中＋5分の休憩を繰り返す時間管理術です。集中時間が終わると自動で休憩フェーズへ切り替わります。4回連続した場合は長めの休憩をとりましょう。',
    image: <img src="/help/timer-pomodoro.svg" width="280" height="160" alt="" />,
  },
  {
    icon: <IconBook size={18} />,
    title: '本を選んでスタート',
    desc: '読書中・読みたい本を選択してからタイマーを開始できます。ドロップダウン内で検索も可能です',
    detail: 'タイマー開始前に読む本を選択してください。本選択ドロップダウンを開くと一覧が表示され、検索欄にタップするとタイトル・著者名で絞り込めます。「読みたい」ステータスの本を選ぶと、スタート時に自動で「読書中」に変更されます。本を選ばずにスタートすることはできません。',
    image: <img src="/help/timer-book-select.svg" width="280" height="160" alt="" />,
  },
  {
    icon: <IconRefresh size={18} />,
    title: '自動スタート / タブロック',
    desc: 'フェーズ終了後、次のタイマーが自動でスタートします。タイマー動作中は本棚・統計タブへの移動がロックされます',
    detail: '集中フェーズが終わると休憩タイマーが自動でスタートし、休憩が終わると再び集中タイマーが自動でスタートします。途中で一時停止・停止したい場合はボタンを押してください。なお、タイマー動作中は本棚・統計タブへの移動がロックされます（設定タブは引き続き使用できます）。一時停止・停止するとロックは解除されます。',
    image: <img src="/help/timer-auto-start.svg" width="280" height="160" alt="" />,
  },
  {
    icon: <IconSettings size={18} />,
    title: '時間のカスタマイズ',
    desc: '歯車アイコンから集中・休憩時間を自由に変更できます',
    detail: '歯車アイコンから集中時間（1〜90分）と休憩時間（1〜30分）を自由に変更できます。デフォルトは集中25分・休憩5分です。設定変更後は「適用」ボタンを押してください。',
    image: <img src="/help/timer-settings.svg" width="280" height="160" alt="" />,
  },
  {
    icon: <IconChartBar size={18} />,
    title: '今日の実績',
    desc: '今日のセッション数と合計集中時間をリアルタイムで確認できます',
    detail: '画面下部に今日のセッション数と合計集中時間をリアルタイムで表示します。セッションはタイマーが正常に終了した際にカウントされます。統計タブでは過去の記録も確認できます。',
    image: <img src="/help/timer-today-stats.svg" width="280" height="160" alt="" />,
  },
]

type Phase = 'focus' | 'break'

interface Props {
  books: Book[]
  sessions: Session[]
  onSessionComplete: (bookId: string, session: Session) => void
  onStatusChange: (bookId: string, status: Book['status']) => void
  onRunningChange?: (running: boolean) => void
}

export default function TimerTab({ books, sessions, onSessionComplete, onStatusChange, onRunningChange }: Props) {
  const [showHelp, setShowHelp] = useState(false)
  const [focusMin, setFocusMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [inputFocusMin, setInputFocusMin] = useState(25)
  const [inputBreakMin, setInputBreakMin] = useState(5)
  const [phase, setPhase] = useState<Phase>('focus')
  const [secondsLeft, setSecondsLeft] = useState(focusMin * 60)
  const [running, setRunning] = useState(false)
  const [selectedBookId, setSelectedBookId] = useState<string>('')
  // 本を選ばずにスタートを押したときだけ案内を出す（何もしていないうちに出すとエラーに見えるため）
  const [showBookHint, setShowBookHint] = useState(false)
  const [showBookDropdown, setShowBookDropdown] = useState(false)
  const [bookSearch, setBookSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const bookDropdownRef = useRef<HTMLDivElement>(null)
  const bookSearchRef = useRef<HTMLInputElement>(null)
  const today = toLocalDate()
  // 今日の実績は親から渡されるセッション一覧から毎回求める（記録すると親の一覧に追加される）
  const todaySessionList = sessions.filter(s => s.date === today)
  const todaySessions = todaySessionList.length
  const totalMinutes = todaySessionList.reduce((sum, s) => sum + s.duration, 0)
  // 実行中のフェーズが終わる時刻（ミリ秒）。止まっている間は null。
  // 1秒ごとに数を減らす方式だと、別タブ表示中やアプリが裏にいる間にタイマーが遅れるため、終了時刻から残りを計算する
  const endAtRef = useRef<number | null>(null)
  // 描画を待たずに同じフェーズを二重に終わらせないよう、今のフェーズを ref でも持つ
  const phaseRef = useRef<Phase>(phase)
  // 一時停止中の残り時間（ミリ秒）。秒に丸めると、止めるたびに1秒未満ずつずれるため、ミリ秒のまま持つ
  const pausedMsRef = useRef<number | null>(null)
  // 円のゲージ。秒ごとではなく描画のたびに動かすため、React の描画を通さず直接書き換える
  const ringRef = useRef<SVGCircleElement>(null)

  const selectableBooks = books.filter(b => b.status !== 'done')
  const selectedBook = selectableBooks.find(b => b.id === selectedBookId) ?? null

  const bq = bookSearch.trim().toLowerCase()
  const filteredSelectableBooks = bq
    ? selectableBooks.filter(b =>
        b.title.toLowerCase().includes(bq) ||
        b.author.toLowerCase().includes(bq) ||
        (b.publisher ?? '').toLowerCase().includes(bq)
      )
    : selectableBooks

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bookDropdownRef.current && !bookDropdownRef.current.contains(e.target as Node)) {
        setShowBookDropdown(false)
        setBookSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // running 変化を親に通知
  useEffect(() => {
    onRunningChange?.(running)
  }, [running, onRunningChange])

  // フェーズを切り替え、次のフェーズの終了時刻を endAtRef に入れる。endedAt は終わったフェーズの終了時刻
  const finishPhase = useCallback((endedAt: number) => {
    if (phaseRef.current === 'focus') {
      if (selectedBookId) {
        const book = books.find(b => b.id === selectedBookId)
        const newSession: Session = {
          id: crypto.randomUUID(),
          bookId: selectedBookId,
          bookTitle: book?.title ?? '',
          date: toLocalDate(new Date(endedAt)),
          duration: focusMin,
        }
        onSessionComplete(selectedBookId, newSession)
      }
      phaseRef.current = 'break'
      setPhase('break')
      setSecondsLeft(breakMin * 60)
      endAtRef.current = endedAt + breakMin * 60 * 1000
      showTimerNotificationIfHidden('focus')
      // 次のフェーズ（休憩）の終わりを通知で予約する（アプリのみ）
      void scheduleTimerNotification('break', endAtRef.current)
    } else {
      // 次の集中は、休憩が終わった時刻ではなく今から数える。
      // アプリが裏にいる間に休憩が終わっていたら、戻った時刻から集中を始める（読んでいない時間を集中に数えない）
      const focusEndAt = Math.max(endedAt, Date.now()) + focusMin * 60 * 1000
      phaseRef.current = 'focus'
      setPhase('focus')
      setSecondsLeft(focusMin * 60)
      endAtRef.current = focusEndAt
      showTimerNotificationIfHidden('break')
      // 集中の終わりと、そのあとの休憩の終わりを予約する（アプリのみ）
      void scheduleTimerNotification('focus', focusEndAt, focusEndAt + breakMin * 60 * 1000)
    }
  }, [selectedBookId, books, focusMin, breakMin, onSessionComplete])

  // 画面を離れてタイマーが消えるときは、予約した通知も取り消す
  useEffect(() => () => { void cancelTimerNotification() }, [])

  // タイマーの更新処理からは常に最新の finishPhase を呼ぶ
  const finishPhaseRef = useRef(finishPhase)
  useEffect(() => {
    finishPhaseRef.current = finishPhase
  }, [finishPhase])

  useEffect(() => {
    if (!running) return
    const tick = () => {
      const endAt = endAtRef.current
      if (endAt === null) return
      const left = Math.ceil((endAt - Date.now()) / 1000)
      if (left > 0) {
        setSecondsLeft(left)
        return
      }
      finishPhaseRef.current(endAt)
      // 集中のあとの休憩まで終わるほど離れていたら、休憩も終わらせて、今から次の集中を始める。
      // 次の集中は今から数えるので、何時間離れていても記録される集中は 1 回だけ
      const breakEndAt = endAtRef.current
      if (phaseRef.current === 'break' && breakEndAt !== null && breakEndAt <= Date.now()) {
        finishPhaseRef.current(breakEndAt)
      }
      const nextEndAt = endAtRef.current
      if (nextEndAt !== null) setSecondsLeft(Math.max(0, Math.ceil((nextEndAt - Date.now()) / 1000)))
    }
    // 表示の秒が切り替わる瞬間に合わせて次の更新を予約する（一定間隔だと最大で間隔ぶん表示が遅れるため）
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = () => {
      clearTimeout(timer)
      tick()
      const endAt = endAtRef.current
      if (endAt === null) return
      const msToNextSecond = ((endAt - Date.now()) % 1000 + 1000) % 1000
      timer = setTimeout(run, msToNextSecond + 10)
    }
    run()
    // 別タブやアプリから戻ったら、すぐに正しい残り時間にする
    document.addEventListener('visibilitychange', run)
    window.addEventListener('focus', run)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('focus', run)
    }
  }, [running])

  const totalMs = (phase === 'focus' ? focusMin : breakMin) * 60 * 1000

  // 動作中は、画面の描画のたびに残りミリ秒から円のゲージを動かす（秒ごとだと 1 秒ごとに止まって見える）
  useEffect(() => {
    if (!running) return
    let frame = 0
    const draw = () => {
      const endAt = endAtRef.current
      const ring = ringRef.current
      if (endAt !== null && ring) {
        const phaseMs = (phaseRef.current === 'focus' ? focusMin : breakMin) * 60 * 1000
        ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * Math.min(1, Math.max(0, (endAt - Date.now()) / phaseMs)))
      }
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [running, focusMin, breakMin])

  // 止まっているときは、一時停止した位置（なければ表示中の残り秒）に合わせる
  useEffect(() => {
    if (running) return
    const ring = ringRef.current
    if (!ring) return
    const leftMs = pausedMsRef.current ?? secondsLeft * 1000
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * Math.min(1, Math.max(0, leftMs / totalMs)))
  }, [running, secondsLeft, totalMs])

  const handleStart = () => {
    // 集中は本を選んでから始める（本棚が空のときも始めない。記録先の本がないため）
    if (phase === 'focus' && !selectedBook) {
      setShowBookHint(true)
      return
    }
    if (phase === 'focus' && selectedBookId) {
      const book = books.find(b => b.id === selectedBookId)
      if (book?.status === 'want') onStatusChange(selectedBookId, 'reading')
    }
    const endAt = Date.now() + (pausedMsRef.current ?? secondsLeft * 1000)
    pausedMsRef.current = null
    endAtRef.current = endAt
    setRunning(true)
    const endingPhase = phase
    // 集中なら、そのあとの休憩の終わりもあわせて予約する（アプリが裏にいても休憩の終わりを知らせるため）
    const followingBreakEndAt = endingPhase === 'focus' ? endAt + breakMin * 60 * 1000 : undefined
    void requestTimerNotificationPermission().then(() => {
      // 許可を待つ間に一時停止・停止されていたら予約しない
      if (endAtRef.current !== endAt) return
      if (followingBreakEndAt === undefined) void scheduleTimerNotification(endingPhase, endAt)
      else void scheduleTimerNotification(endingPhase, endAt, followingBreakEndAt)
    })
  }

  const handlePause = () => {
    if (endAtRef.current !== null) {
      const ms = Math.max(0, endAtRef.current - Date.now())
      pausedMsRef.current = ms
      setSecondsLeft(Math.ceil(ms / 1000))
    }
    endAtRef.current = null
    void cancelTimerNotification()
    setRunning(false)
  }

  const handleStop = () => {
    endAtRef.current = null
    pausedMsRef.current = null
    void cancelTimerNotification()
    phaseRef.current = 'focus'
    setRunning(false)
    setPhase('focus')
    setSecondsLeft(focusMin * 60)
  }

  const openSettings = () => {
    setInputFocusMin(focusMin)
    setInputBreakMin(breakMin)
    setShowSettings(true)
  }

  const applySettings = () => {
    const newFocus = Math.max(1, Math.min(90, inputFocusMin))
    const newBreak = Math.max(1, Math.min(30, inputBreakMin))
    setFocusMin(newFocus)
    setBreakMin(newBreak)
    setShowSettings(false)
    endAtRef.current = null
    pausedMsRef.current = null
    void cancelTimerNotification()
    phaseRef.current = 'focus'
    setRunning(false)
    setPhase('focus')
    setSecondsLeft(newFocus * 60)
  }

  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
  const seconds = (secondsLeft % 60).toString().padStart(2, '0')

  return (
    <div className="timer-tab">
      {showHelp && <HelpModal title="タイマーの使い方" items={TIMER_HELP} onClose={() => setShowHelp(false)} />}
      <div className="tab-help-row">
        <button className="help-btn" onClick={() => setShowHelp(true)}>
          <IconQuestionMark size={15} />
          使い方
        </button>
      </div>
      <div className="timer-card">
        <div className={`phase-badge ${phase}`}>
          {phase === 'focus' ? '集中' : '休憩'}
        </div>

        <div className="timer-ring-wrap">
          <svg className="timer-ring" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="88" className="ring-bg" />
            <circle
              ref={ringRef}
              cx="100" cy="100" r="88"
              className={`ring-progress ${phase}`}
              strokeDasharray={`${RING_CIRCUMFERENCE}`}
            />
          </svg>
          <div className="timer-display">{minutes}:{seconds}</div>
        </div>

        <div className="timer-controls">
          {!running ? (
            <button className="btn-primary" onClick={handleStart}>
              <IconPlayerPlay size={20} />
              スタート
            </button>
          ) : (
            <button className="btn-secondary" onClick={handlePause}>
              <IconPlayerPause size={20} />
              一時停止
            </button>
          )}
          <button className="btn-ghost" onClick={handleStop}>
            <IconPlayerStop size={20} />
          </button>
          <button className="btn-ghost" onClick={() => showSettings ? setShowSettings(false) : openSettings()}>
            <IconSettings size={20} />
          </button>
        </div>

        {showSettings && (
          <div className="settings-panel">
            <div className="settings-row">
              <label>集中時間（分）</label>
              <input
                type="number" min={1} max={90} value={inputFocusMin}
                onChange={e => setInputFocusMin(Number(e.target.value))}
              />
            </div>
            <div className="settings-row">
              <label>休憩時間（分）</label>
              <input
                type="number" min={1} max={30} value={inputBreakMin}
                onChange={e => setInputBreakMin(Number(e.target.value))}
              />
            </div>
            <button className="btn-primary" onClick={applySettings}>適用</button>
          </div>
        )}

        <div className="book-select-wrap" ref={bookDropdownRef}>
          <button
            className={`book-select-btn${showBookDropdown ? ' open' : ''}${running ? ' disabled' : ''}`}
            onClick={() => { if (!running) { setShowBookDropdown(v => !v); setBookSearch('') } }}
            disabled={running}
          >
            <IconBook size={16} className="book-select-icon" />
            <span className="book-select-label">
              {selectedBook ? selectedBook.title : '本を選択...'}
            </span>
            {selectedBook && (
              <span className="book-select-author">
                {selectedBook.author}{selectedBook.publisher ? `/${selectedBook.publisher}` : ''}
              </span>
            )}
            <IconChevronDown size={16} className={`book-select-chevron${showBookDropdown ? ' rotated' : ''}`} />
          </button>

          {showBookDropdown && (
            <div className="book-select-dropdown">
              {selectableBooks.length === 0 ? (
                <div className="book-select-empty">本棚に本を追加してください</div>
              ) : (
                <>
                  <div className="book-dropdown-search-wrap">
                    <IconSearch size={13} className="book-dropdown-search-icon" />
                    <input
                      ref={bookSearchRef}
                      className="book-dropdown-search-input"
                      value={bookSearch}
                      onChange={e => setBookSearch(e.target.value)}
                      placeholder="タイトル・著者で検索..."
                      autoComplete="off"
                    />
                    {bookSearch && (
                      <button className="book-dropdown-search-clear" onClick={() => setBookSearch('')}>
                        <IconX size={11} />
                      </button>
                    )}
                  </div>
                  <div className="book-dropdown-list">
                    {filteredSelectableBooks.length === 0 ? (
                      <div className="book-select-empty">「{bookSearch}」に一致する本がありません</div>
                    ) : (
                      filteredSelectableBooks.map(b => (
                        <button
                          key={b.id}
                          className={`book-select-option${b.id === selectedBookId ? ' selected' : ''}`}
                          onClick={() => { setSelectedBookId(b.id); setShowBookHint(false); setShowBookDropdown(false); setBookSearch('') }}
                        >
                          <span className={`book-status-dot status-${b.status}`} />
                          <span className="book-option-title">{b.title}</span>
                          <span className="book-option-meta">
                            {b.author}{b.publisher ? `/${b.publisher}` : ''}
                          </span>
                          {b.id === selectedBookId && <IconCheck size={14} className="book-option-check" />}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {showBookHint && phase === 'focus' && !selectedBook && !running && (
          <p className="hint">
            {selectableBooks.length === 0 ? '本棚に本を追加してからスタートしてください' : '本を選択してからスタートしてください'}
          </p>
        )}
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{todaySessions}</span>
          <span className="stat-label">今日のセッション</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{totalMinutes}</span>
          <span className="stat-label">今日の集中（分）</span>
        </div>
      </div>
    </div>
  )
}
