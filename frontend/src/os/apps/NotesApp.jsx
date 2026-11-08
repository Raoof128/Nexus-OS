import { useCallback, useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { Eye, Pencil } from 'lucide-react'

const SAVE_DEBOUNCE_MS = 500

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function renderMarkdown(text) {
  if (!text) return ''
  const escaped = escapeHtml(text)
  // Build the HTML string via regex substitutions on the escaped input,
  // then pass the result through DOMPurify before rendering.  DOMPurify acts
  // as a second-pass safety net: any future regex change that accidentally
  // reintroduces an executable element will be stripped before it reaches
  // dangerouslySetInnerHTML.
  const raw = escaped
    // Code blocks (must come before inline code)
    .replace(
      /```([\s\S]*?)```/g,
      '<pre class="my-2 border border-border bg-muted p-2 font-mono text-[12px] text-foreground overflow-x-auto"><code>$1</code></pre>',
    )
    // Inline code
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-muted px-1 font-mono text-[12px] text-foreground">$1</code>',
    )
    // Headers
    .replace(
      /^### (.+)$/gm,
      '<h3 class="mt-3 mb-1 text-[13px] font-semibold text-w7-title">$1</h3>',
    )
    .replace(/^## (.+)$/gm, '<h2 class="mt-4 mb-1 text-[15px] font-semibold text-w7-title">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="mt-4 mb-2 text-[17px] font-semibold text-w7-title">$1</h1>')
    // Bold + Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-foreground">$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-3 border-border" />')
    // Line breaks
    .replace(/\n/g, '<br />')
  // Sanitize with DOMPurify — strips any executable elements that may have
  // slipped through the regex chain (e.g. event handlers, script tags).
  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'strong', 'em', 'code', 'pre', 'li', 'hr', 'br'],
    ALLOWED_ATTR: ['class'],
  })
}

export default function NotesApp({ windowId }) {
  const storageKey = `nexus-os:note-${windowId}`
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState(false)
  const saveTimeout = useRef(null)

  // Load on mount
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) {
          const saved = JSON.parse(raw)
          if (saved.content) setContent(saved.content)
        }
      } catch {
        // Corrupt data
      }
    })
  }, [storageKey])

  // Clear any pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
    }
  }, [])

  // Debounced save
  const saveToStorage = useCallback(
    (text) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ content: text }))
        } catch {
          // Storage full
        }
      }, SAVE_DEBOUNCE_MS)
    },
    [storageKey],
  )

  const handleChange = (e) => {
    const val = e.target.value
    setContent(val)
    saveToStorage(val)
  }

  const charCount = content.length
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Command bar */}
      <div className="w7-commandbar shrink-0">
        <button
          type="button"
          className="w7-toolbtn"
          onClick={() => setPreview(false)}
          aria-pressed={!preview}
        >
          <Pencil size={14} aria-hidden="true" />
          Edit
        </button>
        <button
          type="button"
          className="w7-toolbtn"
          onClick={() => setPreview(true)}
          aria-pressed={preview}
        >
          <Eye size={14} aria-hidden="true" />
          Preview
        </button>
      </div>

      {/* Content */}
      {preview ? (
        content.trim() ? (
          <div
            className="flex-1 overflow-y-auto bg-white p-3 text-[13px] leading-relaxed text-foreground"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-white p-4 text-center">
            <Eye size={24} className="text-muted-foreground" aria-hidden="true" />
            <p className="text-[12px] text-muted-foreground">
              Nothing to preview yet. Switch to Edit and start writing.
            </p>
          </div>
        )
      ) : (
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="Start typing…"
          aria-label="Note editor"
          className="flex-1 resize-none p-1 font-mono text-[13px] leading-relaxed"
          spellCheck={false}
        />
      )}

      {/* Status bar */}
      <div className="status-bar shrink-0">
        <p className="status-bar-field">
          {wordCount} {wordCount === 1 ? 'word' : 'words'} · {charCount}{' '}
          {charCount === 1 ? 'character' : 'characters'}
        </p>
      </div>
    </div>
  )
}
