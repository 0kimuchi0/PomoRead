import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openAfter } from '../lib/openAfter'

function fakeTab() {
  return { closed: false, opener: {} as unknown, location: { href: '' }, close: vi.fn() }
}

describe('openAfter', () => {
  let open: ReturnType<typeof vi.fn>
  beforeEach(() => {
    open = vi.fn()
    vi.stubGlobal('open', open)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('先に空のタブを開き、完了したらその URL に移動する', async () => {
    const tab = fakeTab()
    open.mockReturnValue(tab)
    let resolve!: (url: string) => void
    const p = openAfter(() => new Promise(r => { resolve = r }))
    // await より前に（クリックの直後に）タブを開いている
    expect(open).toHaveBeenCalledWith('', '_blank')
    resolve('https://github.com/daiki0828/PomoRead/issues/9')
    await expect(p).resolves.toBe('https://github.com/daiki0828/PomoRead/issues/9')
    expect(tab.location.href).toBe('https://github.com/daiki0828/PomoRead/issues/9')
    expect(tab.opener).toBeNull()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('失敗したら空のタブを閉じてエラーを投げる', async () => {
    const tab = fakeTab()
    open.mockReturnValue(tab)
    await expect(openAfter(() => Promise.reject(new Error('NG')))).rejects.toThrow('NG')
    expect(tab.close).toHaveBeenCalled()
  })

  it('空のタブがブロックされたら、完了後にもう一度開く', async () => {
    open.mockReturnValueOnce(null)
    await openAfter(() => Promise.resolve('https://example.com/issues/1'))
    expect(open).toHaveBeenLastCalledWith('https://example.com/issues/1', '_blank', 'noopener')
  })
})
