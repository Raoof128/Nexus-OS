import { useEffect, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { useChatMessages } from '../../hooks/useChat'

export default function ChatWindow({ sessionId }) {
  const { messages, loading, sending, sendMessage, error } = useChatMessages(sessionId)
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim() || sending) return
    const content = input.trim()
    setInput('')
    await sendMessage(content)
  }

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🤖</span>
          </div>
          <p className="font-mono text-sm text-muted-foreground">
            Select or create a chat session
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id || msg.created_at}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 font-mono text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'rounded-br-md bg-primary/20 text-white border border-primary/30'
                  : 'rounded-bl-md bg-white/[0.03] text-neutral-200 border border-white/5'
              }`}
            >
              <div className="mb-1 text-[10px] uppercase tracking-wider opacity-40">
                {msg.role === 'user' ? 'You' : 'Nexus AI'}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-primary">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="animate-pulse font-mono uppercase tracking-wider">Processing...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-white/5 p-4">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Nexus AI..."
            disabled={sending}
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 font-mono text-sm text-white placeholder:text-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
            maxLength={4000}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-lg bg-primary/20 p-2.5 text-primary transition-colors hover:bg-primary/30 disabled:opacity-30"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  )
}
