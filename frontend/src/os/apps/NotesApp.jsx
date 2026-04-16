import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Pencil } from 'lucide-react'

const SAVE_DEBOUNCE_MS = 500

function renderMarkdown(text) {
  if (!text) return ''
  return text
    // Code blocks (must come before inline code)
    .replace(/```([\s\S]*?)```/g, '<pre class="my-2 rounded-lg bg-white/[0.03] p-3 font-mono text-[11px] text-white/70 overflow-x-auto border border-white/[0.06]"><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-primary/80">$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3 class="heading-ui mt-3 mb-1 text-sm font-semibold text-white">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="heading-display mt-4 mb-1 text-base font-bold text-primary">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="heading-display mt-4 mb-2 text-lg font-bold text-primary">$1</h1>')
    // Bold + Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-white/80">$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-muted-foreground">$1</li>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr class="my-3 border-white/[0.06]" />')
    // Line breaks
    .replace(/\n/g, '<br />')
}

export default function NotesApp({ windowId }) {
  const storageKey = `nexus-os:note-${windowId}`
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState(false)
  const saveTimeout = useRef(null)

  // Load on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.content) setContent(saved.content)
      }
    } catch {
      // Corrupt data
    }
  }, [storageKey])

  // Debounced save
  const saveToStorage = useCallback((text) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ content: text }))
      } catch {
        // Storage full
      }
    }, SAVE_DEBOUNCE_MS)
  }, [storageKey])

  const handleChange = (e) => {
    const val = e.target.value
    setContent(val)
    saveToStorage(val)
  }

  const charCount = content.length
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.04] bg-black/20 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPreview(false)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] transition-all ${
              !preview ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-white'
            }`}
          >
            <Pencil size={10} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] transition-all ${
              preview ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-white'
            }`}
          >
            <Eye size={10} />
            Preview
          </button>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground/50">
          {wordCount}w · {charCount}c
        </span>
      </div>

      {/* Content */}
      {preview ? (
        <div
          className="flex-1 overflow-y-auto custom-scrollbar p-4 text-xs leading-relaxed text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      ) : (
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="// start typing..."
          className="flex-1 resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-white/80 placeholder-muted-foreground/30 focus:outline-none custom-scrollbar"
          spellCheck={false}
        />
      )}
    </div>
  )
}
