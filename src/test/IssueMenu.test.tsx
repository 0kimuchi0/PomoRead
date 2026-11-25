import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import IssueMenu from '../components/IssueMenu'

const setup = () => render(<IssueMenu formUrl={k => `https://example.com/new?kind=${k}`} />)

describe('IssueMenu', () => {
  it('最初はボタン1つだけで、押すと3種類のメニューが開く', () => {
    setup()
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Issue にする/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').map(a => a.textContent)).toEqual(['不具合', '機能の要望', '調査・質問'])
    expect(screen.queryByText('編集')).toBeNull()
  })

  it('各種類は入力済みフォームを新しいタブで開くリンク', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /Issue にする/ }))
    const items = screen.getAllByRole('menuitem')
    expect(items.map(a => a.getAttribute('href'))).toEqual([
      'https://example.com/new?kind=bug',
      'https://example.com/new?kind=feature',
      'https://example.com/new?kind=investigation',
    ])
    items.forEach(a => expect(a).toHaveAttribute('target', '_blank'))
  })

  it('種類を選ぶとメニューを閉じる', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /Issue にする/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: /不具合/ }))
    expect(screen.queryByRole('menu')).toBeNull()
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
})
