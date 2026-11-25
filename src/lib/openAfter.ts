/**
 * 非同期処理の結果の URL を新しいタブで開く。
 * ブラウザは、クリックから時間がたってから開くタブをポップアップとしてブロックするので、
 * クリック直後（await の前）に空のタブを開いておき、URL が分かったらそこへ移動する。
 * 失敗したら空のタブを閉じて、エラーをそのまま投げる。
 */
export async function openAfter(task: () => Promise<string>): Promise<string> {
  const tab = window.open('', '_blank')
  try {
    const url = await task()
    if (tab && !tab.closed) {
      tab.opener = null
      tab.location.href = url
    } else {
      // 空のタブがブロックされた・閉じられた場合は、もう一度だけ開いてみる
      window.open(url, '_blank', 'noopener')
    }
    return url
  } catch (e) {
    tab?.close()
    throw e
  }
}
