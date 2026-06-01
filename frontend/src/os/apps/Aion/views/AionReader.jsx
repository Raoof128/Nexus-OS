import { useState, useCallback } from 'react'
import { ArrowLeft, Copy, MessageSquare, RefreshCw } from 'lucide-react'
import { OT_BOOKS, NT_BOOKS, getBookBackground } from '../lib/bibleData'
import { useAionReader } from '../hooks/useAionReader'

// ── Sub-view: Book list ─────────────────────────────────────
function BookList({ onSelectBook }) {
  const [testament, setTestament] = useState('OT')
  const books = testament === 'OT' ? OT_BOOKS : NT_BOOKS

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0c]">
      <div className="border-b border-white/[0.06] px-4 py-2.5">
        <span className="font-mono text-xs tracking-widest text-white/40 uppercase">
          Aion · Bible
        </span>
      </div>

      {/* OT / NT toggle */}
      <div className="flex gap-2 border-b border-white/[0.06] px-4 py-3">
        {['OT', 'NT'].map((t) => (
          <button
            key={t}
            onClick={() => setTestament(t)}
            className={`rounded-lg px-3 py-1 font-mono text-xs transition-colors ${
              testament === t
                ? 'bg-amber-500/20 text-amber-400'
                : 'text-white/30 hover:text-white/60'
            }`}
          >
            {t === 'OT' ? `Old Testament (${OT_BOOKS.length})` : `New Testament (${NT_BOOKS.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-1 p-3">
          {books.map((book) => (
            <button
              key={book.id}
              onClick={() => onSelectBook(book)}
              aria-label={`${book.name}, ${book.chapters} chapters`}
              className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-amber-500/20 hover:bg-amber-500/[0.04]"
            >
              <p className="mb-0.5 font-mono text-[9px] font-bold tracking-widest text-amber-500/80">
                {book.id}
              </p>
              <p className="font-mono text-xs text-white/80">{book.name}</p>
              <p className="font-mono text-[9px] text-white/25">{book.chapters} ch.</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sub-view: Chapter list ──────────────────────────────────
function ChapterList({ book, onSelectChapter, onBack }) {
  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0c]">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <button
          onClick={onBack}
          aria-label="Back to book list"
          className="rounded p-1 text-amber-400/60 hover:bg-white/[0.05] hover:text-amber-400"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-white/70">{book.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-5 gap-1 p-3">
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((ch) => (
            <button
              key={ch}
              onClick={() => onSelectChapter(ch)}
              aria-label={`Chapter ${ch}`}
              className="rounded-lg border border-white/[0.05] bg-white/[0.02] py-2 font-mono text-xs text-white/60 transition-colors hover:border-amber-500/20 hover:bg-amber-500/[0.04] hover:text-amber-300"
            >
              {ch}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Sub-view: Chapter viewer ────────────────────────────────
function ChapterViewer({ book, chapter, onBack, onAskAion }) {
  const { verses, isLoading, error, refetch } = useAionReader(book.id, chapter)
  const [activeVerse, setActiveVerse] = useState(null)
  const [scrollPct, setScrollPct] = useState(0)

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget
    const pct = el.scrollHeight > el.clientHeight
      ? Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100)
      : 100
    setScrollPct(pct)
  }, [])

  const handleCopy = (verse) => {
    const text = `"${verse.content}" — ${book.name} ${chapter}:${verse.verse}`
    navigator.clipboard.writeText(text).catch(() => {})
  }

  const bgUrl = getBookBackground(book.id)

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0a0a0c]">
      {/* Per-book background art */}
      {bgUrl && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            opacity: 0.18,
          }}
        />
      )}
      {/* Dark gradient overlay so text stays readable */}
      {bgUrl && (
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
      )}
      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <button
          onClick={onBack}
          aria-label="Back to chapter list"
          className="rounded p-1 text-amber-400/60 hover:bg-white/[0.05] hover:text-amber-400"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs text-white/70">
          {book.name} · Ch. {chapter}
        </span>
        {/* Scroll progress */}
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-amber-500/50 transition-all"
              style={{ width: `${scrollPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Verse list */}
      {isLoading && (
        <div className="relative z-10 flex flex-1 flex-col gap-2 p-4" role="status" aria-label="Loading verses">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-white/[0.04]" />
          ))}
        </div>
      )}

      {error && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="font-mono text-xs text-amber-200/40">Couldn&apos;t load chapter</p>
          <button
            onClick={refetch}
            className="flex items-center gap-2 rounded border border-amber-500/20 px-3 py-1.5 font-mono text-xs text-amber-400 hover:bg-amber-500/10"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4" onScroll={handleScroll}>
          {verses.map((v) => (
            <div key={v.verse} className="group mb-4">
              <button
                onClick={() => setActiveVerse(activeVerse === v.verse ? null : v.verse)}
                className="w-full text-left"
                aria-label={`Verse ${v.verse}: ${v.content}`}
              >
                <span className="mr-2 font-mono text-[10px] font-bold text-amber-500/70">
                  {v.verse}
                </span>
                <span className="font-mono text-sm leading-relaxed text-white/80">{v.content}</span>
              </button>

              {/* Inline actions revealed on click */}
              {activeVerse === v.verse && (
                <div className="mt-2 flex gap-2 pl-5">
                  <button
                    onClick={() =>
                      onAskAion(
                        `What does ${book.name} ${chapter}:${v.verse} mean? "${v.content}"`,
                      )
                    }
                    className="flex items-center gap-1.5 rounded border border-violet-500/20 bg-violet-500/[0.06] px-2 py-1 font-mono text-[10px] text-violet-300/80 hover:bg-violet-500/10"
                    aria-label={`Ask Aion about ${book.name} ${chapter}:${v.verse}`}
                  >
                    <MessageSquare className="h-2.5 w-2.5" /> Ask Aion
                  </button>
                  <button
                    onClick={() => handleCopy(v)}
                    className="flex items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-white/40 hover:bg-white/[0.05]"
                    aria-label={`Copy verse ${v.verse}`}
                  >
                    <Copy className="h-2.5 w-2.5" /> Copy
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Root AionReader ─────────────────────────────────────────
export default function AionReader({ view, onNavigate }) {
  // Deep-init: if bookId + chapter → chapter view; bookId only → chapter list; neither → book list
  const initialBook = view.bookId
    ? (OT_BOOKS.find((b) => b.id === view.bookId) ?? NT_BOOKS.find((b) => b.id === view.bookId))
    : null

  const [readerView, setReaderView] = useState(() => {
    if (initialBook && view.chapter) return { type: 'chapter', book: initialBook, chapter: view.chapter }
    if (initialBook) return { type: 'chapters', book: initialBook }
    return { type: 'books' }
  })

  const handleAskAion = (message) => onNavigate({ type: 'chat', initialMessage: message })

  if (readerView.type === 'chapter') {
    return (
      <ChapterViewer
        book={readerView.book}
        chapter={readerView.chapter}
        onBack={() => setReaderView({ type: 'chapters', book: readerView.book })}
        onAskAion={handleAskAion}
      />
    )
  }

  if (readerView.type === 'chapters') {
    return (
      <ChapterList
        book={readerView.book}
        onSelectChapter={(ch) =>
          setReaderView({ type: 'chapter', book: readerView.book, chapter: ch })
        }
        onBack={() => setReaderView({ type: 'books' })}
      />
    )
  }

  return (
    <BookList
      onSelectBook={(book) => setReaderView({ type: 'chapters', book })}
    />
  )
}
