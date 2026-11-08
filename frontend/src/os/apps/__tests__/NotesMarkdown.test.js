import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../Notes/markdown'
import { findInText, insertAt } from '../Notes/noteUtils'

describe('renderMarkdown', () => {
  it('renders headings, emphasis and lists', () => {
    const html = renderMarkdown('# Title\n**bold** and *em*\n- item')
    expect(html).toContain('<h1')
    expect(html).toContain('<strong')
    expect(html).toContain('<em>em</em>')
    expect(html).toContain('<li')
  })

  it('escapes raw HTML in the note', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('strips script tags even if they reach the sanitiser', () => {
    const html = renderMarkdown('hello <script>alert(1)</script>')
    expect(html).not.toContain('<script')
  })

  it('returns an empty string for an empty note', () => {
    expect(renderMarkdown('')).toBe('')
  })
})

describe('note helpers', () => {
  it('insertAt replaces the selection', () => {
    expect(insertAt('abcdef', 2, 4, 'XY')).toBe('abXYef')
    expect(insertAt('abc', 1, 1, '-')).toBe('a-bc')
  })

  it('findInText wraps to the start when nothing follows the caret', () => {
    expect(findInText('one two one', 'one', 1)).toBe(8)
    expect(findInText('one two one', 'one', 9)).toBe(0)
  })

  it('findInText is case-insensitive and returns -1 for no match', () => {
    expect(findInText('Hello', 'hello')).toBe(0)
    expect(findInText('Hello', 'bye')).toBe(-1)
    expect(findInText('Hello', '')).toBe(-1)
  })
})
