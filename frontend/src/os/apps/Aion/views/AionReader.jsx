import { Fragment, useState, useCallback, useEffect, useRef } from 'react'
import { ArrowLeft, Copy, MessageSquare, RefreshCw } from 'lucide-react'
import { OT_BOOKS, NT_BOOKS, getBookBackground, getOmittedVerses } from '../lib/bibleData'
import { useAionReader } from '../hooks/useAionReader'
import { useReaderFontScale } from '../hooks/useReaderFontScale'

// Verse text uses a readable serif stack; UI text stays Segoe UI (inherited).
const READING_FONT = 'Cambria, Georgia, "Times New Roman", serif'

// ── Sub-view: Book list ─────────────────────────────────────
function BookList({ onSelectBook }) {
  const [testament, setTestament] = useState('OT')
  const books = testament === 'OT' ? OT_BOOKS : NT_BOOKS

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#d9d9d9] bg-w7-pane px-3 py-1.5">
        <h1 className="w7-heading mr-2 text-[12px]">Bible</h1>
        {['OT', 'NT'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTestament(t)}
            aria-pressed={testament === t}
            className="w7-toolbtn"
          >
            {t === 'OT'
              ? `Old Testament (${OT_BOOKS.length})`
              : `New Testament (${NT_BOOKS.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 p-3">
          {books.map((book) => {
            const bg = getBookBackground(book.id)
            return (
              <button
                key={book.id}
                type="button"
                onClick={() => onSelectBook(book)}
                aria-label={`${book.name}, ${book.chapters} chapters`}
                className="w7-card w7-item flex flex-col overflow-hidden text-left"
              >
                {bg && <img src={bg} alt="" loading="lazy" className="h-16 w-full object-cover" />}
                <span className="flex flex-col gap-0.5 px-2 py-1.5">
                  <span className="text-[12px] text-foreground">{book.name}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {book.chapters} {book.chapters === 1 ? 'chapter' : 'chapters'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sub-view: Chapter list ──────────────────────────────────
function ChapterList({ book, onSelectChapter, onBack }) {
  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-[#d9d9d9] bg-w7-pane px-3 py-1.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to book list"
          title="Back to book list"
          className="w7-toolbtn h-6 w-6 px-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <h1 className="w7-heading text-[12px]">{book.name}</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 p-3">
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => onSelectChapter(ch)}
              aria-label={`Chapter ${ch}`}
              className="w7-card w7-item py-2 text-[12px] text-foreground"
            >
              {ch}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Marker for verses the BSB intentionally omits ───────────
// Renders where a verse number is skipped (e.g. Matthew 17:21) so a deliberate
// critical-text gap reads as "complete by design", not a loading bug.
function OmittedVerseNote({ bookName, chapterNum, verse }) {
  return (
    <div className="flex items-start gap-3 px-2 py-1">
      <span className="w-7 shrink-0 pt-0.5 text-right text-[11px] leading-7 text-muted-foreground">
        {verse}
      </span>
      <span className="flex-1 text-[13px] italic leading-7 text-muted-foreground">
        {bookName} {chapterNum}:{verse} is not found in the earliest manuscripts and is omitted in
        this translation.
      </span>
    </div>
  )
}

// ── Sub-view: Chapter viewer ────────────────────────────────
// Reading progress 0–100 for a scroll container; content that fits counts as read.
function readScrollPct(el) {
  const pct =
    el.scrollHeight > el.clientHeight
      ? Math.min(el.scrollTop / (el.scrollHeight - el.clientHeight), 1)
      : 1
  return Math.round(pct * 100)
}

function ChapterViewer({ book, chapter, onBack, onAskAion, onPick, onNavigateChapter }) {
  const { verses, isLoading, error, refetch } = useAionReader(book.id, chapter)
  const [activeVerse, setActiveVerse] = useState(null)
  const [scrollPct, setScrollPct] = useState(0)
  const scrollRef = useRef(null)

  const chapterNum = Number(chapter)
  const omittedVerses = getOmittedVerses(book.id, chapterNum)
  const { level, increase, decrease, canIncrease, canDecrease } = useReaderFontScale()
  const hasPrev = chapterNum > 1
  const hasNext = chapterNum < book.chapters

  // Short chapters never fire a scroll event, so read the meter once content lands.
  // Re-measure when content loads or the window is resized (the window animates in).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    const update = () => setScrollPct(readScrollPct(el))
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [verses, isLoading, error])

  const handleScroll = useCallback(
    (e) => {
      setScrollPct(readScrollPct(e.currentTarget))
      // Dismiss active verse on scroll
      if (activeVerse !== null) setActiveVerse(null)
    },
    [activeVerse],
  )

  const handleCopy = (verse) => {
    const text = `${book.name} ${chapterNum}:${verse.verse} — "${verse.content}"`
    // navigator.clipboard is undefined on non-secure origins; don't throw from a click.
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Toolbar: back, book/chapter pickers, prev/next, text size, progress */}
      {/* Two intentional groups: navigation (never split) and text size + progress.
          On narrow windows (@md = < 28rem) the second group drops to its own row. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-[#d9d9d9] bg-w7-pane px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to chapter list"
            title="Back to chapter list"
            className="w7-toolbtn h-6 w-6 shrink-0 px-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <select
            aria-label="Book"
            value={book.id}
            onChange={(e) => {
              const next = [...OT_BOOKS, ...NT_BOOKS].find((b) => b.id === e.target.value)
              if (next) onPick(next, 1)
            }}
            className="min-w-0 max-w-[12rem]"
          >
            <optgroup label="Old Testament">
              {OT_BOOKS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="New Testament">
              {NT_BOOKS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          </select>
          <select
            aria-label="Chapter"
            value={chapterNum}
            onChange={(e) => onNavigateChapter(Number(e.target.value))}
          >
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map((ch) => (
              <option key={ch} value={ch}>
                {ch}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => hasPrev && onNavigateChapter(chapterNum - 1)}
            disabled={!hasPrev}
            aria-label="Previous chapter"
            title="Previous chapter"
            className="w7-toolbtn shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden @md:inline">Previous</span>
          </button>
          <button
            type="button"
            onClick={() => hasNext && onNavigateChapter(chapterNum + 1)}
            disabled={!hasNext}
            aria-label="Next chapter"
            title="Next chapter"
            className="w7-toolbtn shrink-0"
          >
            <span className="hidden @md:inline">Next</span>
            <ArrowLeft className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
          </button>
        </div>

        {/* Right cluster: text-size control + reading progress */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div role="group" aria-label="Text size" className="flex items-center gap-1.5">
            <span className="hidden text-[12px] text-muted-foreground @md:inline">Text size</span>
            <button
              type="button"
              onClick={decrease}
              disabled={!canDecrease}
              aria-label="Decrease text size"
              title="Decrease text size"
              className="w7-toolbtn"
            >
              A−
            </button>
            <span
              className="min-w-[2rem] text-center text-[12px] text-foreground"
              aria-hidden="true"
            >
              {level.label}
            </span>
            {/* The visible S/M/L code is terse; announce the size by name on change. */}
            <span className="sr-only" role="status" aria-live="polite">
              {`Text size: ${level.name}`}
            </span>
            <button
              type="button"
              onClick={increase}
              disabled={!canIncrease}
              aria-label="Increase text size"
              title="Increase text size"
              className="w7-toolbtn"
            >
              A+
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              role="progressbar"
              aria-label="Reading progress"
              aria-valuenow={scrollPct}
              aria-valuetext={`${scrollPct}% read`}
              aria-valuemin="0"
              aria-valuemax="100"
              title={`${scrollPct}% read`}
              className="w-12 @md:w-20"
            >
              <div style={{ width: `${scrollPct}%` }} />
            </div>
            <span
              className="w-9 text-right text-[12px] tabular-nums text-muted-foreground"
              aria-hidden="true"
            >
              {scrollPct}%
            </span>
          </div>
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex flex-1 flex-col gap-3 p-6" role="status" aria-label="Loading verses">
          <div role="progressbar" className="marquee" aria-label="Loading verses" />
          <p className="text-[12px] text-muted-foreground">Loading the chapter…</p>
        </div>
      )}

      {error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <p role="alert" className="w7-error text-[12px]">
            Couldn&apos;t load this chapter. Check your connection and try again.
          </p>
          <button type="button" onClick={refetch} className="w7-btn">
            <RefreshCw className="h-3 w-3" aria-hidden="true" /> Try again
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          <article className="mx-auto w-full max-w-[70ch] px-5 pb-16 pt-6">
            <h2 className="w7-heading mb-5 text-[14px]">
              {book.name} {chapterNum}
            </h2>

            {/* Verses */}
            {verses.map((v, i) => {
              const isFirst = i === 0
              const isParagraphBreak = i > 0 && i % 5 === 0

              // Omission markers for any BSB-skipped verse number that falls
              // between the previous rendered verse and this one.
              const prevVerse = i > 0 ? verses[i - 1].verse : 0
              const gapMarkers = omittedVerses.filter((n) => n > prevVerse && n < v.verse)

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
                <Fragment key={v.verse}>
                  {gapMarkers.map((n) => (
                    <OmittedVerseNote
                      key={`omitted-${n}`}
                      bookName={book.name}
                      chapterNum={chapterNum}
                      verse={n}
                    />
                  ))}
                  <div className={isParagraphBreak ? 'mt-5' : ''}>
                    <button
                      type="button"
                      onClick={() => setActiveVerse(activeVerse === v.verse ? null : v.verse)}
                      className={`w-full rounded-[3px] border px-2 py-1 text-left ${
                        activeVerse === v.verse
                          ? 'border-w7-select-border bg-w7-select'
                          : 'border-transparent hover:bg-w7-hover'
                      }`}
                      aria-label={`Verse ${v.verse}: ${v.content}`}
                    >
                      <span
                        className="text-foreground"
                        style={{
                          fontFamily: READING_FONT,
                          fontSize: `${level.size}px`,
                          lineHeight: level.lineHeight,
                        }}
                      >
                        {isFirst ? (
                          <>
                            {/* The verse number sits inside the floated drop cap so it never
                                splits the first word ("I1n the beginning"). */}
                            <span
                              className="float-left font-bold leading-none text-w7-title"
                              style={{
                                fontSize: `${level.size * 2.7}px`,
                                lineHeight: `${level.size * 2.7}px`,
                              }}
                            >
                              {/* Verse number: small superscript in the title blue */}
                              <sup className="select-none align-top font-sans text-[10px] font-bold">
                                {v.verse}
                              </sup>
                              {dropCap}
                            </span>
                            {rest}
                          </>
                        ) : (
                          <>
                            {/* Verse number: small superscript in the title blue */}
                            <sup className="mr-1 select-none font-sans text-[10px] font-bold text-w7-title">
                              {v.verse}
                            </sup>
                            {v.content}
                          </>
                        )}
                      </span>
                    </button>

                    {/* Actions on tap */}
                    {activeVerse === v.verse && (
                      <div className="mt-1 flex gap-2 pl-2">
                        <button
                          type="button"
                          onClick={() =>
                            onAskAion(
                              `What does ${book.name} ${chapterNum}:${v.verse} mean? "${v.content}"`,
                            )
                          }
                          className="w7-btn"
                          aria-label={`Ask Aion about ${book.name} ${chapterNum}:${v.verse}`}
                        >
                          <MessageSquare className="h-3 w-3" aria-hidden="true" /> Ask Aion
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(v)}
                          className="w7-btn"
                          aria-label={`Copy verse ${v.verse}`}
                        >
                          <Copy className="h-3 w-3" aria-hidden="true" /> Copy
                        </button>
                      </div>
                    )}
                  </div>
                </Fragment>
              )
            })}

            {/* Trailing omissions: BSB-skipped verses after the last present verse */}
            {verses.length > 0 &&
              omittedVerses
                .filter((n) => n > verses[verses.length - 1].verse)
                .map((n) => (
                  <OmittedVerseNote
                    key={`omitted-trailing-${n}`}
                    bookName={book.name}
                    chapterNum={chapterNum}
                    verse={n}
                  />
                ))}

            {/* Bottom navigation — Previous / Next chapter */}
            {verses.length > 0 && (
              <div className="mt-10 border-t border-[#d9d9d9] pt-5">
                <p className="mb-3 text-center text-[12px] text-muted-foreground">
                  Chapter {chapterNum} of {book.chapters}
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => hasPrev && onNavigateChapter(chapterNum - 1)}
                    disabled={!hasPrev}
                    className="w7-btn"
                  >
                    <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => hasNext && onNavigateChapter(chapterNum + 1)}
                    disabled={!hasNext}
                    className="w7-btn"
                  >
                    Next <ArrowLeft className="h-3 w-3 rotate-180" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </article>
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
    if (initialBook && view.chapter)
      return { type: 'chapter', book: initialBook, chapter: view.chapter }
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
        onPick={(book, ch) => setReaderView({ type: 'chapter', book, chapter: ch })}
        onNavigateChapter={(ch) =>
          setReaderView({ type: 'chapter', book: readerView.book, chapter: ch })
        }
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

  return <BookList onSelectBook={(book) => setReaderView({ type: 'chapters', book })} />
}
