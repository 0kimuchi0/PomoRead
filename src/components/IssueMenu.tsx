import { useEffect, useRef, useState } from 'react'
import { IconBrandGithub, IconChevronDown } from '@tabler/icons-react'
import { ISSUE_KINDS } from '../lib/constants'
import type { IssueKind } from '../lib/constants'

interface Props {
  /** 選んだ種類の Issue フォームを、内容を入れた状態で GitHub で開く URL */
  formUrl: (kind: IssueKind) => string
}

/** 「Issue にする」ボタン。押すと種類のメニューが開き、選んだ種類のフォームを入力済みで開く */
export default function IssueMenu({ formUrl }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="issue-menu" ref={ref}>
      <button
        type="button"
        className="feedback-issue-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <IconBrandGithub size={13} /> Issue にする <IconChevronDown size={12} />
      </button>
      {open && (
        <div className="issue-menu-list" role="menu">
          {(Object.keys(ISSUE_KINDS) as IssueKind[]).map(k => (
            <a
              key={k}
              role="menuitem"
              className="issue-menu-create"
              href={formUrl(k)}
              target="_blank"
              rel="noopener noreferrer"
              title={`${ISSUE_KINDS[k].label}のフォームを、内容を入れた状態で GitHub で開く`}
              onClick={() => setOpen(false)}
            >
              <span className={`issue-menu-dot issue-menu-dot--${k}`} aria-hidden="true" />
              {ISSUE_KINDS[k].label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
