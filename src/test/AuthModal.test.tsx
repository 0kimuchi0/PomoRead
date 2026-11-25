import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AuthModal from '../auth/AuthModal'

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(() => Promise.resolve(null)),
  resetPassword: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: mocks.signUp,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    resetPassword: mocks.resetPassword,
  }),
}))

const SPAM_NOTE = /迷惑メールフォルダもご確認ください/

describe('メール送信後の迷惑メールフォルダの案内', () => {
  it('新規登録後に案内を表示する', async () => {
    render(<AuthModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '新規登録' }))
    fireEvent.change(screen.getByPlaceholderText('メールアドレス'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('パスワード（8文字以上）'), { target: { value: 'password123' } })
    fireEvent.change(screen.getByPlaceholderText('パスワード（確認）'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'アカウント作成' }))

    await waitFor(() => expect(screen.getByText('確認メールを送信しました。')).toBeInTheDocument())
    expect(screen.getByText(SPAM_NOTE)).toBeInTheDocument()
  })

  it('パスワードリセットメール送信後に案内を表示する', async () => {
    render(<AuthModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'パスワードをお忘れですか？' }))
    fireEvent.change(screen.getByPlaceholderText('メールアドレス'), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'リセットメールを送信' }))

    await waitFor(() => expect(screen.getByText('パスワードリセットメールを送信しました。')).toBeInTheDocument())
    expect(screen.getByText(SPAM_NOTE)).toBeInTheDocument()
  })

  it('送信前のフォームには案内を表示しない', () => {
    render(<AuthModal onClose={vi.fn()} />)
    expect(screen.queryByText(SPAM_NOTE)).not.toBeInTheDocument()
  })
})
