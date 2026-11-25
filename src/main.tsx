import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { canonicalRedirectUrl, hasLocalGuestData } from './lib/canonicalHost'

// キーボード表示時に、フォーカス中の要素が隠れないよう #root 内でスクロール
document.addEventListener('focusin', (e) => {
  const target = e.target
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return
  setTimeout(() => {
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, 300)
})

// 旧アドレス（*.vercel.app）で開いた人は、表示する前に pomoread.com へ移す。
// 端末にだけ記録が残っている人（未ログインで記録した人や、ログイン後にまだ送れていない人）は、
// 移すと記録が見えなくなるので移さない
const redirectTo = canonicalRedirectUrl({
  hostname: window.location.hostname,
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
  hasLocalData: hasLocalGuestData(),
})

if (redirectTo) {
  window.location.replace(redirectTo)
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
