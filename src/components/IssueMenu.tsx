import { useEffect, useRef, useState } from 'react'
import { IconBrandGithub, IconChevronDown, IconPencil } from '@tabler/icons-react'
import { ISSUE_KINDS } from '../lib/constants'
import type { IssueKind } from '../lib/constants'

interface Props {
  creating: boolean
  /** 選んだ種類でその場で作成する */
  onCreate: (kind: IssueKind) => void
  /** 選んだ種類のフォームを、内容を入れた状態で GitHub で開く URL */
  editUrl: (kind: IssueKind) => string
}

/** 「Issue にする」ボタン。押すと種類のメニューが開き、選んだ種類で作成する */
export default function IssueMenu({ creating, onCreate, editUrl }: Props) {
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
        disabled={creating}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <IconBrandGithub size={13} /> {creating ? '作成中...' : 'Issue にする'} <IconChevronDown size={12} />
      </button>
      {open && (
        <div className="issue-menu-list" role="menu">
          {(Object.keys(ISSUE_KINDS) as IssueKind[]).map(k => (
            <div key={k} className="issue-menu-item">
              <button
                type="button"
                role="menuitem"
                className={`issue-menu-create issue-menu-create--${k}`}
                onClick={() => { setOpen(false); onCreate(k) }}
              >
                <span className={`issue-menu-dot issue-menu-dot--${k}`} aria-hidden="true" />
                {ISSUE_KINDS[k].label}
              </button>
              <a
                role="menuitem"
                className="issue-menu-edit"
                href={editUrl(k)}
                target="_blank"
                rel="noopener noreferrer"
                title={`${ISSUE_KINDS[k].label}のフォームを GitHub で開き、編集してから作成する`}
                onClick={() => setOpen(false)}
              >
                <IconPencil size={12} /> 編集
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
