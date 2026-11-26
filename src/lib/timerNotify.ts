// タイマーのフェーズが終わったことを知らせる通知。
// iOS / Android アプリ: 終了時刻にローカル通知を予約する（アプリが裏にいても OS が出す）
// Web: タブが裏にあるときだけ、ブラウザの通知を出す（ブラウザがタイマーを間引くため、最大1分ほど遅れることがある）
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export type TimerPhase = 'focus' | 'break'

const NOTIFICATION_ID = 1001

const MESSAGES: Record<TimerPhase, { title: string; body: string }> = {
  focus: { title: '集中時間が終わりました', body: '休憩が始まりました。少し目を休めましょう。' },
  break: { title: '休憩が終わりました', body: '次の集中が始まりました。' },
}

const isNative = () => Capacitor.isNativePlatform()

/** スタートを押したときに呼ぶ（ブラウザの許可ダイアログはユーザーの操作の中でしか出せないため） */
export async function requestTimerNotificationPermission(): Promise<void> {
  try {
    if (isNative()) {
      const { display } = await LocalNotifications.checkPermissions()
      if (display === 'prompt' || display === 'prompt-with-rationale') await LocalNotifications.requestPermissions()
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  } catch {
    // 通知が使えなくてもタイマーは動かす
  }
}

/** endingPhase が endAt に終わることを予約する（アプリのみ。前の予約は置き換える） */
export async function scheduleTimerNotification(endingPhase: TimerPhase, endAt: number): Promise<void> {
  if (!isNative()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] })
    const { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [{
        id: NOTIFICATION_ID,
        ...MESSAGES[endingPhase],
        schedule: { at: new Date(endAt), allowWhileIdle: true },
      }],
    })
  } catch {
    // 通知が使えなくてもタイマーは動かす
  }
}

/** 予約した通知を取り消す（一時停止・停止・設定変更のとき） */
export async function cancelTimerNotification(): Promise<void> {
  if (!isNative()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] })
  } catch {
    // 何もしない
  }
}

/** Web 用: フェーズが終わったとき、タブが裏にあれば通知を出す（アプリは予約した通知が出るので何もしない） */
export function showTimerNotificationIfHidden(endedPhase: TimerPhase): void {
  if (isNative()) return
  if (typeof document === 'undefined' || !document.hidden) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const n = new Notification(MESSAGES[endedPhase].title, { body: MESSAGES[endedPhase].body, icon: '/favicon.svg', tag: 'pomoread-timer' })
    n.onclick = () => { window.focus(); n.close() }
  } catch {
    // スマホのブラウザなど、ページから直接通知を出せない環境では何もしない
  }
}
