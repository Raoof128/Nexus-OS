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
function ChapterViewer({ book, chapter, onBack, onAskAion, onNavigateChapter }) {
  const { verses, isLoading, error, refetch } = useAionReader(book.id, chapter)
  const [activeVerse, setActiveVerse] = useState(null)
  const [scrollPct, setScrollPct] = useState(0)

  const chapterNum = Number(chapter)
  const hasPrev = chapterNum > 1
  const hasNext = chapterNum < book.chapters

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget
    const pct = el.scrollHeight > el.clientHeight
      ? Math.min(el.scrollTop / (el.scrollHeight - el.clientHeight), 1)
      : 1
    setScrollPct(Math.round(pct * 100))
    // Dismiss active verse on scroll
    if (activeVerse !== null) setActiveVerse(null)
  }, [activeVerse])

  const handleCopy = (verse) => {
    const text = `${book.name} ${chapterNum}:${verse.verse} — "${verse.content}"`
    navigator.clipboard.writeText(text).catch(() => {})
  }

  const bgUrl = getBookBackground(book.id)

  return (
    <div className="relative flex h-full w-full flex-col bg-[#0a0a0c]">
      {/* Per-book background art — vivid, same as original (gradient handles readability) */}
      {bgUrl && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: `url(${bgUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
          }}
        />
      )}
      {/* Original gradient: rgba(10,10,12,0.45) top → rgba(10,10,12,0.95) bottom */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,10,12,0.45) 0%, rgba(10,10,12,0.95) 100%)',
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 border-b border-white/[0.06] px-3 py-2.5">
        <button
          onClick={onBack}
          aria-label="Back to chapter list"
          className="rounded p-1 text-amber-400/60 hover:bg-white/[0.05] hover:text-amber-400"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Prev / Next arrows in header */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => hasPrev && onNavigateChapter(chapterNum - 1)}
            disabled={!hasPrev}
            aria-label="Previous chapter"
            className="rounded-full bg-white/[0.06] p-1 text-white/50 disabled:opacity-30 hover:bg-violet-500/20 hover:text-violet-300"
          >
            <ArrowLeft className="h-3 w-3" />
          </button>
          <span className="min-w-[5rem] text-center font-mono text-xs text-white/70">
            {book.name} · {chapterNum}
          </span>
          <button
            onClick={() => hasNext && onNavigateChapter(chapterNum + 1)}
            disabled={!hasNext}
            aria-label="Next chapter"
            className="rounded-full bg-white/[0.06] p-1 text-white/50 disabled:opacity-30 hover:bg-violet-500/20 hover:text-violet-300"
          >
            <ArrowLeft className="h-3 w-3 rotate-180" />
          </button>
        </div>

        {/* Reading progress bar replaces the old side bar */}
        <div className="ml-auto h-0.5 w-16 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full rounded-full bg-violet-500/70 transition-all"
            style={{ width: `${scrollPct}%` }}
          />
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="relative z-10 flex flex-1 flex-col gap-3 p-6" role="status" aria-label="Loading verses">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-white/[0.04]" style={{ width: `${85 - i * 8}%` }} />
          ))}
        </div>
      )}

      {error && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="font-mono text-xs text-white/30">Couldn&apos;t load chapter</p>
          <button
            onClick={refetch}
            className="flex items-center gap-2 rounded border border-violet-500/30 px-4 py-1.5 font-mono text-xs text-violet-400 hover:bg-violet-500/10"
          >
            <RefreshCw className="h-3 w-3" /> Tap to retry
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <div
          className="relative z-10 flex-1 overflow-y-auto"
          onScroll={handleScroll}
        >
          <div className="mx-auto w-full max-w-[680px] px-4 pb-20 pt-7">

            {/* Chapter heading: ——— BOOK NAME ——— */}
            <div className="mb-2 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.08]" />
              <span className="font-mono text-[10px] font-bold tracking-[0.25em] text-white/40 uppercase">
                {book.name}
              </span>
              <div className="h-px flex-1 bg-white/[0.08]" />
            </div>

            {/* Large chapter number — purple glow, thin weight */}
            <p className="mb-8 text-center font-mono text-5xl font-thin tracking-widest text-violet-400/80">
              {chapterNum}
            </p>

            {/* Verses */}
            {verses.map((v, i) => {
              const isFirst = i === 0
              const isParagraphBreak = i > 0 && i % 5 === 0

              // Drop cap for first verse
              let dropCap = ''
              let rest = v.content
              if (isFirst && v.content.trim().length > 0) {
                const t = v.content.trim()
                if (['"', '“', "'", '‘'].includes(t[0])) {
                  dropCap = t.slice(0, 2)
                  rest = t.slice(2)
                } else {
                  dropCap = t[0]
                  rest = t.slice(1)
                }
              }

              return (
                <div
                  key={v.verse}
                  className={isParagraphBreak ? 'mt-5' : ''}
                >
                  <button
                    onClick={() => setActiveVerse(activeVerse === v.verse ? null : v.verse)}
                    className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
                      activeVerse === v.verse
                        ? 'border border-amber-500/25 bg-amber-500/[0.05]'
                        : 'border border-transparent hover:bg-white/[0.02]'
                    }`}
                    aria-label={`Verse ${v.verse}: ${v.content}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Verse number — purple, right-aligned in fixed column */}
                      <span className="w-7 shrink-0 pt-0.5 text-right font-mono text-[11px] leading-7 text-violet-400/60">
                        {v.verse}
                      </span>
                      {/* Verse content */}
                      <span className="flex-1 text-[17px] leading-8 text-white/90" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
                        {isFirst ? (
                          <>
                            <span className="float-left mr-1 font-bold leading-none text-amber-400" style={{ fontSize: '3rem', lineHeight: '3rem', fontFamily: 'Georgia, serif' }}>
                              {dropCap}
                            </span>
                            {rest}
                          </>
                        ) : v.content}
                      </span>
                    </div>
                  </button>

                  {/* Actions on tap */}
                  {activeVerse === v.verse && (
                    <div className="mt-1 flex gap-2 pl-10">
                      <button
                        onClick={() => onAskAion(`What does ${book.name} ${chapterNum}:${v.verse} mean? "${v.content}"`)}
                        className="flex items-center gap-1.5 rounded border border-violet-500/20 bg-violet-500/[0.06] px-2.5 py-1 font-mono text-[10px] text-violet-300/80 hover:bg-violet-500/10"
                        aria-label={`Ask Aion about ${book.name} ${chapterNum}:${v.verse}`}
                      >
                        <MessageSquare className="h-2.5 w-2.5" /> Ask Aion
                      </button>
                      <button
                        onClick={() => handleCopy(v)}
                        className="flex items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono text-[10px] text-white/40 hover:bg-white/[0.05]"
                        aria-label={`Copy verse ${v.verse}`}
                      >
                        <Copy className="h-2.5 w-2.5" /> Copy
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Bottom navigation — Previous / Next chapter */}
            {verses.length > 0 && (
              <div className="mt-12 border-t border-white/[0.06] pt-6">
                <p className="mb-4 text-center font-mono text-[11px] text-white/20">
                  Chapter {chapterNum} of {book.chapters}
                </p>
                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => hasPrev && onNavigateChapter(chapterNum - 1)}
                    disabled={!hasPrev}
                    className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 font-mono text-xs text-white/60 transition-colors hover:border-violet-500/30 hover:bg-violet-500/[0.08] hover:text-violet-300 disabled:opacity-30"
                  >
                    <ArrowLeft className="h-3 w-3" /> Previous
                  </button>
                  <button
                    onClick={() => hasNext && onNavigateChapter(chapterNum + 1)}
                    disabled={!hasNext}
                    className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 py-2.5 font-mono text-xs text-white/60 transition-colors hover:border-violet-500/30 hover:bg-violet-500/[0.08] hover:text-violet-300 disabled:opacity-30"
                  >
                    Next <ArrowLeft className="h-3 w-3 rotate-180" />
                  </button>
                </div>
              </div>
            )}
          </div>
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
        onNavigateChapter={(ch) => setReaderView({ type: 'chapter', book: readerView.book, chapter: ch })}
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
