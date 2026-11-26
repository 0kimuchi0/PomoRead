/**
 * 著者名を表示用にフォーマットする。
 * "Last, First" → "Last・First"
 * "Last1, First1, Last2, First2" → "Last1・First1, Last2・First2"
 * スペース区切りの場合もスペースを・に変換する。
 */
export function formatAuthor(name: string): string {
  const parts = name.split(', ')
  if (parts.length <= 1) return name.replace(/[ 　]+/g, '・')

  const authors: string[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const last = parts[i].trim()
    const first = i + 1 < parts.length ? parts[i + 1].trim() : ''
    authors.push(first ? `${last}・${first}` : last)
  }
  return authors.join(', ')
}

/** 端末のタイムゾーンでの日付を "YYYY-MM-DD" で返す（toISOString は UTC なので日本時間の 0〜9 時に前日になる） */
export function toLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
