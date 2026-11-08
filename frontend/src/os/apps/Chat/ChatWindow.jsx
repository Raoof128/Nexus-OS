import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, MessageCircle, Send } from 'lucide-react'
import { useChatMessages } from '../../../hooks/useChat'

function isNearBottom(element, threshold = 150) {
  if (!element) return true
  return element.scrollHeight - element.scrollTop - element.clientHeight < threshold
}

export default function ChatWindow({ sessionId, userId }) {
  const { messages, loading, sending, sendMessage, error } = useChatMessages(userId, sessionId)
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const textareaRef = useRef(null)
  const wasNearBottom = useRef(true)

  const checkScroll = useCallback(() => {
    wasNearBottom.current = isNearBottom(scrollRef.current)
  }, [])

  useEffect(() => {
    if (scrollRef.current && wasNearBottom.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = textarea.scrollHeight + 'px'
    }
  }, [input])

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
      <div className="flex h-full items-center justify-center bg-background p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Bot size={32} className="text-[#3d5a80]" aria-hidden="true" />
          <p className="text-[12px] text-muted-foreground">
            Select a conversation or start a new one.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        role="log"
        aria-live="polite"
        aria-label="Chat messages"
        tabIndex={0}
        className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-4"
      >
        {loading && (
          <div className="flex flex-col items-center gap-2 py-10" role="status">
            <div className="w-40">
              <div role="progressbar" aria-label="Loading messages" className="marquee" />
            </div>
            <p className="text-[12px] text-muted-foreground">Loading messages…</p>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16">
            <MessageCircle size={32} className="text-[#3d5a80]" aria-hidden="true" />
            <p className="text-[12px] text-muted-foreground">Start the conversation</p>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'user'
          return (
            <div
              key={msg.id || `${msg.created_at}-${msg.role}`}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="mb-1 flex items-baseline gap-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{isUser ? 'You' : 'Nexus AI'}</span>
                <time dateTime={msg.created_at}>
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words px-3 py-2 text-[13px] leading-relaxed text-foreground sm:max-w-[78%] ${
                  isUser ? 'rounded-[4px] border border-[#a8cbf0] bg-[#dcebfc]' : 'w7-card'
                }`}
              >
                {msg.content}
              </div>
            </div>
          )
        })}

        {sending && (
          <div className="flex flex-col items-start">
            <div className="mb-1 flex items-baseline gap-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Nexus AI</span>
            </div>
            <div className="w7-card w-48 space-y-2 px-3 py-2">
              <p className="text-[12px] text-muted-foreground">Assistant is typing…</p>
              <div role="progressbar" aria-label="Assistant is typing" className="marquee" />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="w7-error mx-3 mb-2 text-[12px]">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="border-t border-border bg-w7-surface p-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message"
            disabled={sending}
            aria-label="Chat message"
            rows={1}
            className="min-w-0 flex-1 resize-none px-2 py-1.5 text-[13px]"
            maxLength={4000}
            style={{ maxHeight: `${4 * 1.5 * 14 + 24}px` }}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="w7-btn default shrink-0"
            aria-label="Send message"
          >
            <Send size={14} aria-hidden="true" />
            Send
          </button>
        </div>
      </form>
    </div>
  )
}
