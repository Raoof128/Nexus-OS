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
    <div className="flex h-full w-full flex-col bg-white">
      {/* Modest banner image; fades to white so the text column stays light */}
      {/* The banner gives way first when the window is short, so the composer below never clips. */}
      <div className="relative h-28 w-full min-h-0 shrink overflow-hidden border-b border-[#d9d9d9]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/aion-home-bg.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0) 0%, #fff 100%)' }}
          aria-hidden="true"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[480px] flex-col gap-4 px-6 py-5">
          <div>
            <p className="text-[12px] text-muted-foreground">{getGreeting()}</p>
            <h1 className="w7-heading">Aion</h1>
            <p className="mt-0.5 text-[12px] italic text-muted-foreground">
              &ldquo;Seek, and you shall find.&rdquo;
            </p>
          </div>

          {/* Verse of the day */}
          <button
            type="button"
            onClick={() =>
              onNavigate({ type: 'reader', bookId: votd.book_id, chapter: votd.chapter })
            }
            className="w7-card w7-item flex flex-col gap-2 p-3 text-left"
            aria-label={`Verse of the Day: ${votd.content} — ${votd.book_name} ${votd.chapter}:${votd.verse}. Click to read in context.`}
          >
            <span className="text-[12px] font-bold text-w7-title">Verse of the day</span>
            <p
              className="text-[15px] italic leading-7 text-foreground"
              style={{ fontFamily: 'Cambria, Georgia, "Times New Roman", serif' }}
            >
              &ldquo;{votd.content}&rdquo;
            </p>
            <p className="text-right text-[12px] text-muted-foreground">
              {votd.book_name} {votd.chapter}:{votd.verse}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate({ type: 'reader' })}
            className="w7-card w7-item flex items-center gap-3 px-3 py-2.5 text-left"
            aria-label="Open Bible Reader"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-[#3d5a80]" aria-hidden="true" />
            <span className="flex-1 text-[13px] text-foreground">Read the Bible</span>
            <span className="text-[12px] text-muted-foreground" aria-hidden="true">
              Open
            </span>
          </button>

          <div>
            <p className="w7-subheading mb-2">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <PromptPill key={s.label} icon={s.icon} label={s.label} onPress={handleSend} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chat input, pinned bottom */}
      <div className="flex shrink-0 items-center gap-2 border-t border-[#d9d9d9] bg-w7-surface px-4 py-2.5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about Scripture…"
          aria-label="Ask Aion a question"
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={!inputValue.trim()}
          aria-label="Send message"
          className="w7-btn default"
        >
          Send
        </button>
      </div>
    </div>
  )
}
