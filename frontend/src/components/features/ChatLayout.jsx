import { useState } from 'react'
import { useChatSessions } from '../../hooks/useChat'
import ChatSidebar from './ChatSidebar'
import ChatWindow from './ChatWindow'

export default function ChatLayout() {
  const { sessions, createSession, deleteSession } = useChatSessions()
  const [activeSessionId, setActiveSessionId] = useState(null)

  const handleDelete = async (sessionId) => {
    await deleteSession(sessionId)
    if (activeSessionId === sessionId) {
      setActiveSessionId(null)
    }
  }

  return (
    <div className="flex h-[calc(100vh-112px)] overflow-hidden">
      {/* Sidebar — 280px fixed */}
      <div className="hidden w-[280px] shrink-0 sm:block">
        <ChatSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onCreate={async (data) => {
            const session = await createSession(data)
            if (session?.id) setActiveSessionId(session.id)
          }}
          onDelete={handleDelete}
        />
      </div>

      {/* Mobile sidebar toggle + chat */}
      <div className="flex flex-1 flex-col sm:hidden">
        {!activeSessionId ? (
          <ChatSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onCreate={async (data) => {
              const session = await createSession(data)
              if (session?.id) setActiveSessionId(session.id)
            }}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex h-full flex-col">
            <button
              type="button"
              onClick={() => setActiveSessionId(null)}
              className="border-b border-white/5 px-4 py-2 text-left font-mono text-xs text-muted-foreground hover:text-white"
            >
              ← Back to sessions
            </button>
            <div className="flex-1">
              <ChatWindow sessionId={activeSessionId} />
            </div>
          </div>
        )}
      </div>

      {/* Desktop chat window */}
      <div className="hidden flex-1 sm:block">
        <ChatWindow sessionId={activeSessionId} />
      </div>
    </div>
  )
}
