import { BookOpen, Search, Brain, Flame, Sparkles, Bird, Zap } from 'lucide-react'
import { getVerseOfTheDay } from '../lib/bibleData'
import PromptPill from '../components/PromptPill'
import { useState } from 'react'

const SUGGESTIONS = [
  { icon: Search, label: 'Find verses with the number 444' },
  { icon: Brain, label: 'What is a stoic view on Ecclesiastes?' },
  { icon: Flame, label: "I'm feeling completely burnt out today" },
  { icon: Sparkles, label: 'What does the Bible say about new beginnings?' },
  { icon: Bird, label: 'Verses about finding peace in chaos' },
  { icon: Zap, label: 'What does Proverbs say about wisdom?' },
]

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function AionHome({ onNavigate }) {
  const votd = getVerseOfTheDay()
  const [inputValue, setInputValue] = useState('')

  const handleSend = (text) => {
    const msg = (text ?? inputValue).trim()
    if (!msg) return
    onNavigate({ type: 'chat', initialMessage: msg })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0a0a0c]">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-64 w-64 -translate-x-1/2 translate-y-1/3 rounded-full bg-amber-600/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute left-0 top-0 h-48 w-48 -translate-x-1/3 -translate-y-1/3 rounded-full bg-violet-600/[0.05] blur-3xl" />

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[480px] flex-col items-center px-6 py-10">
          {/* Greeting */}
          <p className="mb-5 font-mono text-[10px] tracking-[0.25em] text-amber-200/30 uppercase">
            {getGreeting()}
          </p>

          {/* Wordmark */}
          <h1 className="mb-4 font-mono text-4xl font-thin tracking-[0.45em] text-white/90">
            A I O N
          </h1>

          {/* Divider */}
          <div className="mb-4 h-px w-12 bg-amber-500/60 shadow-[0_0_8px_rgba(217,119,6,0.8)]" />

          {/* Tagline */}
          <p className="mb-6 font-mono text-xs italic text-amber-200/40">
            "Seek, and you shall find."
          </p>

          {/* VOTD card */}
          <button
            onClick={() =>
              onNavigate({ type: 'reader', bookId: votd.book_id, chapter: votd.chapter })
            }
            className="mb-4 w-full rounded-2xl border border-amber-500/25 bg-black/50 p-5 text-left transition-colors hover:border-amber-500/40 hover:bg-amber-500/[0.04]"
            aria-label={`Verse of the Day: ${votd.content} — ${votd.book_name} ${votd.chapter}:${votd.verse}. Click to read in context.`}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[9px] tracking-[0.2em] text-amber-500 uppercase">
                Verse of the Day
              </span>
              <Sparkles className="h-3 w-3 text-amber-500/70" />
            </div>
            <p className="mb-2 font-mono text-sm italic leading-relaxed text-white/85">
              "{votd.content}"
            </p>
            <p className="text-right font-mono text-[10px] text-amber-200/50">
              — {votd.book_name} {votd.chapter}:{votd.verse}
            </p>
          </button>

          {/* Read Bible button */}
          <button
            onClick={() => onNavigate({ type: 'reader' })}
            className="mb-6 flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-black/40 px-4 py-3 transition-colors hover:border-amber-500/20 hover:bg-white/[0.03]"
            aria-label="Open Bible Reader"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="flex-1 font-mono text-sm text-white/70">Read the Bible</span>
            <span className="font-mono text-xs text-white/20">→</span>
          </button>

          {/* Suggestions */}
          <div className="w-full">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/[0.06]" />
              <span className="font-mono text-[9px] tracking-[0.2em] text-white/30 uppercase">
                Explore
              </span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <PromptPill key={s.label} icon={s.icon} label={s.label} onPress={handleSend} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chat input — pinned bottom */}
      <div className="border-t border-white/[0.06] bg-[#0a0a0c] px-4 py-3">
        <div className="mx-auto flex max-w-[480px] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about Scripture…"
            aria-label="Ask Aion a question"
            className="flex-1 bg-transparent font-mono text-sm text-white/80 placeholder:text-white/20 focus:outline-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim()}
            aria-label="Send message"
            className="rounded-lg bg-amber-500/20 px-2 py-1 font-mono text-xs text-amber-400 transition-colors hover:bg-amber-500/30 disabled:opacity-30"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  )
}
