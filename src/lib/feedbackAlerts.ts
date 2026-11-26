// 管理者が「どこまでフィードバックを見たか」を端末ごとに覚える（管理タブのバッジ・お知らせ用）
const VIEWED_KEY = 'admin_feedback_viewed'
export const FEEDBACK_VIEWED_EVENT = 'pomoread:feedback-viewed'

export function readFeedbackViewed(): number {
  try {
    return Number(localStorage.getItem(VIEWED_KEY) ?? 0) || 0
  } catch {
    return 0
  }
}

/** 管理画面でフィードバックを見たときに呼ぶ。開いている画面（管理タブのバッジ）にも知らせる */
export function markFeedbackViewed(count: number): void {
  try {
    localStorage.setItem(VIEWED_KEY, String(count))
  } catch {
    // 保存できなくても表示は続ける
  }
  window.dispatchEvent(new Event(FEEDBACK_VIEWED_EVENT))
}
