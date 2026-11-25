import { describe, it, expect } from 'vitest'
import { issueUrl, GITHUB_REPO_URL } from '../lib/constants'

describe('issueUrl', () => {
  it('テンプレートなしなら Issue 一覧', () => {
    expect(issueUrl()).toBe(`${GITHUB_REPO_URL}/issues`)
  })

  it('テンプレートと入力済みの項目をクエリに入れる', () => {
    const url = new URL(issueUrl('2-feature.yml', { title: '[Feature] 検索', problem: '一覧が\n探しにくい' }))
    expect(url.pathname).toBe('/daiki0828/PomoRead/issues/new')
    expect(url.searchParams.get('template')).toBe('2-feature.yml')
    expect(url.searchParams.get('title')).toBe('[Feature] 検索')
    expect(url.searchParams.get('problem')).toBe('一覧が\n探しにくい')
  })
})
