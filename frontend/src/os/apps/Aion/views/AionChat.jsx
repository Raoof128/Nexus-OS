import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import VerseCard from '../components/VerseCard'

// Module-level Set survives React Strict Mode's simulated unmount/remount.
// Each chat navigation gets a unique _chatKey from AionApp; the Set prevents
// double-send across the two Strict Mode effect invocations.
const sentChatKeys = new Set()

// The chat state comes from AionApp so it survives view changes (see useAionChat).
export default function AionChat({ view, onNavigate, session, chat }) {
  const { messages, sendMessage, isStreaming, error, retryLast } = chat
  const [inputValue, setInputValue] = useState(view.initialMessage ?? '')
  const scrollRef = useRef(null)

  // Auto-submit initial message exactly once per navigation.
  // useAionChat handles its own AbortController cleanup on unmount.
  useEffect(() => {
    if (!view.initialMessage || !session || !view._chatKey) return
    if (sentChatKeys.has(view._chatKey)) return
    sentChatKeys.add(view._chatKey)
    sendMessage(view.initialMessage, view.conversationId ?? null)
  }, [view.initialMessage, view.conversationId, view._chatKey, sendMessage, session])

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
    <div className="flex h-full w-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#d9d9d9] px-3 py-1.5">
        <button
          type="button"
          onClick={() => onNavigate({ type: 'home' })}
          aria-label="Back to home"
          title="Back to home"
          className="w7-toolbtn h-6 w-6 px-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <h1 className="w7-heading text-[12px]">Chat with Aion</h1>
        {isStreaming && (
          <span className="ml-auto text-[12px] text-muted-foreground" role="status">
            Aion is writing…
          </span>
        )}
      </div>

      {/* Message area */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-[12px] text-muted-foreground">Ask anything about Scripture</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[85%] whitespace-pre-wrap rounded-[4px] border border-w7-select-border bg-w7-select px-3 py-2 text-[13px] leading-relaxed text-foreground">
                {msg.content}
              </div>
            ) : (
              <div className="w7-card max-w-[85%] whitespace-pre-wrap px-3 py-2 text-[13px] leading-relaxed text-foreground">
                {msg.content}
                {/* Streaming cursor */}
                {isStreaming && msg === messages[messages.length - 1] && (
                  <span
                    className="ml-0.5 inline-block h-3 w-0.5 bg-primary align-middle"
                    aria-hidden="true"
                  />
                )}
              </div>
            )}

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
          <div className="flex flex-col items-start gap-1">
            <p role="alert" className="w7-error text-[12px]">
              {error}
            </p>
            <button type="button" onClick={retryLast} className="w7-btn">
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 border-t border-[#d9d9d9] bg-w7-surface px-4 py-2.5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about Scripture…"
          aria-label="Chat message"
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!inputValue.trim() || isStreaming}
          aria-label="Send"
          className="w7-btn default"
        >
          Send
        </button>
      </div>
    </div>
  )
}
