// 管理者の iPhone でフィードバックのプッシュ通知を受け取るための登録。
// iOS アプリで管理者がログインしているときだけ使う（Web や一般のユーザーでは何もしない）。
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

const TOKEN_KEY = 'pr_push_token'

const isIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

/**
 * 通知の許可を確認し、この端末を通知先として登録する。
 * onOpenFeedback は、通知をタップしてアプリを開いたときに呼ばれる。戻り値は後片付け用の関数。
 */
export async function registerAdminPush(onOpenFeedback: () => void): Promise<() => void> {
  if (!isIOS()) return () => {}
  try {
    let { receive } = await PushNotifications.checkPermissions()
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      receive = (await PushNotifications.requestPermissions()).receive
    }
    if (receive !== 'granted') return () => {}

    const handles = await Promise.all([
      PushNotifications.addListener('registration', ({ value }) => {
        try { localStorage.setItem(TOKEN_KEY, value) } catch { /* 保存できなくても登録は続ける */ }
        void supabase.rpc('register_push_token', { p_token: value, p_platform: 'ios' })
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        if ((notification.data as { kind?: string } | undefined)?.kind === 'feedback') onOpenFeedback()
      }),
    ])
    await PushNotifications.register()
    return () => { handles.forEach(h => void h.remove()) }
  } catch {
    // 通知が使えなくてもアプリは動かす
    return () => {}
  }
}

/** ログアウトする前に呼ぶ。この端末に、ログアウトした人あての通知が届かないようにする */
export async function unregisterAdminPush(): Promise<void> {
  if (!isIOS()) return
  let token: string | null = null
  try { token = localStorage.getItem(TOKEN_KEY) } catch { /* 何もしない */ }
  if (!token) return
  try {
    await supabase.rpc('unregister_push_token', { p_token: token })
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 失敗してもログアウトは続ける
  }
}
