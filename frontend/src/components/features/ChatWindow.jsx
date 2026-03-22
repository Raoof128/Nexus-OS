import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Loader2, MessageCircle, Send, User } from 'lucide-react'
import { useChatMessages } from '../../hooks/useChat'

function isNearBottom(element, threshold = 150) {
  if (!element) return true
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold
}

export default function ChatWindow({ sessionId, userId }) {
  const { messages, loading, sending, sendMessage, error } = useChatMessages(userId, sessionId)
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const wasNearBottom = useRef(true)

  const checkScroll = useCallback(() => {
    wasNearBottom.current = isNearBottom(scrollRef.current)
  }, [])

  useEffect(() => {
    if (scrollRef.current && wasNearBottom.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    wasNearBottom.current = true
    await sendMessage(content)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!sending && input.trim()) {
        handleSubmit(e)
      }
    }
  }

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="relative mx-auto mb-5">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
              <Bot size={28} className="text-primary/50" />
            </div>
            <div className="absolute -inset-4 rounded-3xl bg-primary/5 blur-xl" />
          </div>
          <p className="heading-display text-xs tracking-wider text-muted-foreground/50">
            Select or initialize a session
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-5"
      >
        {loading && (
          <div className="flex justify-center py-10" role="status">
            <div className="relative">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
              <Bot size={12} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-primary" />
            </div>
            <span className="sr-only">Loading messages</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 opacity-40">
            <MessageCircle size={32} className="text-muted-foreground" />
            <p className="heading-ui text-xs text-muted-foreground">Start the conversation</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id || `${msg.created_at}-${msg.role}`}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${
              msg.role === 'user'
                ? 'bg-primary/15 ring-primary/20'
                : 'bg-accent/15 ring-accent/20'
            }`}>
              {msg.role === 'user'
                ? <User size={12} className="text-primary" />
                : <Bot size={12} className="text-accent" />
              }
            </div>

            <div
              className={`max-w-[78%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'rounded-tr-md bg-primary/[0.08] text-white ring-1 ring-primary/20'
                  : 'rounded-tl-md glass-panel text-neutral-200'
              }`}
            >
              <div className={`mb-1.5 heading-ui text-[10px] tracking-wider ${
                msg.role === 'user' ? 'text-primary/40' : 'text-accent/40'
              }`}>
                {msg.role === 'user' ? 'Operator' : 'Nexus AI'}
              </div>
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </div>
            <span className={`text-[9px] font-mono text-muted-foreground/50 mt-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {sending && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 ring-1 ring-accent/20">
              <Bot size={12} className="text-accent" />
            </div>
            <div className="glass-panel rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent/60" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="heading-ui text-[10px] tracking-wider text-accent/50">Processing</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="mx-4 mb-2 neon-border rounded-lg bg-destructive/[0.06] px-4 py-2">
          <p className="heading-ui text-[10px] text-destructive/60 mb-0.5">Error</p>
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t border-white/[0.04] bg-white/[0.01] p-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="nexus:// transmit message..."
            disabled={sending}
            aria-label="Chat message"
            className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 heading-ui text-sm text-white placeholder:text-muted-foreground/30 focus:border-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 transition-all"
            maxLength={4000}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/25 disabled:opacity-20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  )
}
