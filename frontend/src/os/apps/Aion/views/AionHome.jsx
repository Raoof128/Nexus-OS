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
      {/* Background image — full opacity, same as original Aion */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'url(/aion-home-bg.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      {/* Original Aion gradient: top rgba(10,10,12,0.45) → bottom rgba(10,10,12,0.92) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, rgba(10,10,12,0.45) 0%, rgba(10,10,12,0.92) 100%)',
        }}
      />

      {/* Scrollable content */}
      <div className="relative flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[480px] flex-col items-center px-6 py-10">
          {/* Greeting — textSecondary #9494A8 */}
          <p className="mb-5 font-mono text-[10px] tracking-[0.25em] text-[#9494A8] uppercase">
            {getGreeting()}
          </p>

          {/* Wordmark — textPrimary #F0F0F5 */}
          <h1 className="mb-4 font-mono text-4xl font-thin tracking-[0.45em] text-[#F0F0F5]">
            A I O N
          </h1>

          {/* Divider — purple glow */}
          <div className="mb-4 h-px w-12 bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.9)]" />

          {/* Tagline — textSecondary */}
          <p className="mb-6 font-mono text-xs italic text-[#9494A8]">
            "Seek, and you shall find."
          </p>

          {/* VOTD card — rgba(17,17,20,0.8) bg, rgba(217,119,6,0.18) border */}
          <button
            onClick={() =>
              onNavigate({ type: 'reader', bookId: votd.book_id, chapter: votd.chapter })
            }
            className="mb-4 w-full rounded-2xl p-5 text-left transition-colors hover:border-amber-500/30 hover:bg-[rgba(217,119,6,0.07)]"
            style={{
              background: 'rgba(17,17,20,0.80)',
              border: '1px solid rgba(217,119,6,0.18)',
              boxShadow: '0 4px 16px rgba(217,119,6,0.08)',
            }}
            aria-label={`Verse of the Day: ${votd.content} — ${votd.book_name} ${votd.chapter}:${votd.verse}. Click to read in context.`}
          >
            <div className="mb-3 flex items-center justify-between">
              {/* amberGlow #F59E0B */}
              <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-[#F59E0B] uppercase">
                Verse of the Day
              </span>
              <Sparkles className="h-3 w-3 text-[#F59E0B]" />
            </div>
            {/* textPrimary #F0F0F5, italic, 16px */}
            <p
              className="mb-2 text-base italic leading-7 text-[#F0F0F5]"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              "{votd.content}"
            </p>
            {/* textMuted #7A7A8E */}
            <p className="text-right font-mono text-[11px] text-[#7A7A8E]">
              — {votd.book_name} {votd.chapter}:{votd.verse}
            </p>
          </button>

          {/* Read Bible button — rgba(17,17,20,0.7) bg, rgba(255,255,255,0.10) border */}
          <button
            onClick={() => onNavigate({ type: 'reader' })}
            className="mb-6 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:border-[rgba(138,43,226,0.15)]"
            style={{
              background: 'rgba(17,17,20,0.70)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
            aria-label="Open Bible Reader"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-[#F59E0B]" />
            <span className="flex-1 font-mono text-[15px] text-[#F0F0F5]">Read the Bible</span>
            <span className="font-mono text-xs text-[#56566A]">→</span>
          </button>

          {/* Suggestions */}
          <div className="w-full">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span className="font-mono text-[9px] tracking-[0.2em] text-[#56566A] uppercase">
                Explore
              </span>
              <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
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
      <div
        className="relative border-t px-4 py-3"
        style={{ background: 'rgba(10,10,12,0.92)', borderTopColor: 'rgba(255,255,255,0.08)' }}
      >
        <div
          className="mx-auto flex max-w-[480px] items-center gap-2 rounded-xl px-3 py-2"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about Scripture…"
            aria-label="Ask Aion a question"
            className="flex-1 bg-transparent font-mono text-sm text-[#F0F0F5] placeholder:text-[#56566A] focus:outline-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim()}
            aria-label="Send message"
            className="rounded-lg px-2 py-1 font-mono text-xs text-[#F59E0B] transition-colors disabled:opacity-30"
            style={{ background: 'rgba(217,119,6,0.15)' }}
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  )
}
