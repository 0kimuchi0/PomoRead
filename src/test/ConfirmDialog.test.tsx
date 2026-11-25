import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmDialog from '../components/ConfirmDialog'

describe('ConfirmDialog', () => {
  it('理由が不要なときも確認ダイアログを表示し、理由の入力欄は出さない', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        message="サジェスト「本」を削除しますか？"
        confirmLabel="削除する"
        danger
        requireReason={false}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByText('サジェスト「本」を削除しますか？')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('変更理由を入力してください...')).toBeNull()
    const ok = screen.getByRole('button', { name: '削除する' })
    expect(ok).toBeEnabled()
    fireEvent.click(ok)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('理由が必要なときは、入力するまで確定できない', () => {
    render(
      <ConfirmDialog message="BANしますか？" confirmLabel="BANする" requireReason onConfirm={() => {}} onCancel={() => {}} />,
    )
    const ok = screen.getByRole('button', { name: 'BANする' })
    expect(ok).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('変更理由を入力してください...'), { target: { value: '規約違反' } })
    expect(ok).toBeEnabled()
  })

  it('キャンセルで閉じる', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog message="削除しますか？" onConfirm={() => {}} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
