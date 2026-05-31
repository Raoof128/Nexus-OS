import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { useAionChat } from '../hooks/useAionChat'
import VerseCard from '../components/VerseCard'

export default function AionChat({ view, onNavigate, session }) {
  const { messages, sendMessage, isStreaming, error, reset } = useAionChat(session)
  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef(null)
  const didAutoSubmitRef = useRef(false)

  // Auto-submit initial message exactly once (Strict Mode safe)
  useEffect(() => {
    if (!view.initialMessage || didAutoSubmitRef.current) return
    didAutoSubmitRef.current = true
    setInputValue(view.initialMessage)
    sendMessage(view.initialMessage, view.conversationId ?? null)
  }, [view.initialMessage, view.conversationId, sendMessage])

  // Abort on unmount
  useEffect(() => {
    return () => reset()
  }, [reset])

  // Scroll to bottom on new message content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    const text = inputValue.trim()
    if (!text || isStreaming) return
    setInputValue('')
    sendMessage(text, null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Esc inside input: blur only (don't navigate home)
    if (e.key === 'Escape') {
      e.stopPropagation()
      e.currentTarget.blur()
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#0a0a0c]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-2.5">
        <button
          onClick={() => onNavigate({ type: 'home' })}
          aria-label="Back to home"
          className="rounded p-1 text-amber-400/60 transition-colors hover:bg-white/[0.05] hover:text-amber-400"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="font-mono text-xs tracking-widest text-white/40 uppercase">
          Aion · Chat
        </span>
        {isStreaming && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
            <span className="font-mono text-[9px] tracking-widest text-violet-400/60 uppercase">
              Thinking
            </span>
          </span>
        )}
      </div>

      {/* Message area */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <MessageSquare className="h-8 w-8 text-amber-500/20" />
            <p className="font-mono text-xs text-white/20">Ask anything about Scripture</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 font-mono text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-amber-500/15 text-amber-100/90'
                  : 'bg-white/[0.04] text-white/80'
              }`}
            >
              {msg.content}
              {/* Streaming cursor */}
              {msg.role === 'assistant' && isStreaming && msg === messages[messages.length - 1] && (
                <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-violet-400" />
              )}
            </div>

            {/* Verse cards attached to this assistant message */}
            {msg.role === 'assistant' && msg.verses && msg.verses.length > 0 && (
              <div className="w-full max-w-[85%] space-y-2">
                {msg.verses.map((v) => (
                  <VerseCard
                    key={`${v.book_id ?? v.book_name}-${v.chapter}-${v.verse}`}
                    verse={v}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Inline error */}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2">
            <p className="font-mono text-xs text-red-400/80">{error}</p>
            <button
              onClick={() => sendMessage(messages.findLast((m) => m.role === 'user')?.content ?? '', null)}
              className="mt-1 font-mono text-[10px] text-red-400 underline underline-offset-2 hover:text-red-300"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Chat input */}
      <div className="border-t border-white/[0.06] bg-[#0a0a0c] px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about Scripture…"
            aria-label="Chat message"
            className="flex-1 bg-transparent font-mono text-sm text-white/80 placeholder:text-white/20 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            aria-label="Send"
            className="rounded-lg bg-amber-500/20 px-2 py-1 font-mono text-xs text-amber-400 hover:bg-amber-500/30 disabled:opacity-30"
          >
            ↵
          </button>
        </div>
      </div>
    </div>
  )
}
