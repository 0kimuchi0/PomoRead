import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IssueMenu from '../components/IssueMenu'

const setup = (creating = false) => {
  const onCreate = vi.fn()
  render(<IssueMenu creating={creating} onCreate={onCreate} editUrl={k => `https://example.com/new?kind=${k}`} />)
  return { onCreate }
}

describe('IssueMenu', () => {
  it('最初はボタン1つだけで、押すと3種類のメニューが開く', () => {
    setup()
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Issue にする/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /不具合/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /機能の要望/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /調査・質問/ })).toBeInTheDocument()
  })

  it('種類を選ぶとその種類で作成し、メニューを閉じる', () => {
    const { onCreate } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Issue にする/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /不具合/ }))
    expect(onCreate).toHaveBeenCalledWith('bug')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('「編集」は選んだ種類のフォームへのリンク', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /Issue にする/ }))
    const edits = screen.getAllByRole('menuitem', { name: /編集/ })
    expect(edits.map(a => a.getAttribute('href'))).toEqual([
      'https://example.com/new?kind=bug',
      'https://example.com/new?kind=feature',
      'https://example.com/new?kind=investigation',
    ])
  })

  it('Esc と外側のクリックで閉じる', () => {
    setup()
    const btn = screen.getByRole('button', { name: /Issue にする/ })
    fireEvent.click(btn)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(btn)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('作成中は押せない', () => {
    setup(true)
    expect(screen.getByRole('button', { name: /作成中/ })).toBeDisabled()
  })
})
