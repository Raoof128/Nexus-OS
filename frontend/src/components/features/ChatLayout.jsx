import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useChatSessions } from '../../hooks/useChat'
import ChatSidebar from './ChatSidebar'
import ChatWindow from './ChatWindow'

export default function ChatLayout() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const { sessions, createSession, deleteSession, isCreating } = useChatSessions(userId)
  const [activeSessionId, setActiveSessionId] = useState(null)

  const handleDelete = async (sessionId) => {
    await deleteSession(sessionId)
    if (activeSessionId === sessionId) {
      setActiveSessionId(null)
    }
  }

  const handleCreate = async (data) => {
    const newSession = await createSession(data)
    if (newSession?.id) setActiveSessionId(newSession.id)
  }

  return (
    <div className="flex h-[calc(100dvh-7rem)] overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden w-[240px] shrink-0 md:block lg:w-[280px]">
        <ChatSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onCreate={handleCreate}
          onDelete={handleDelete}
          isCreating={isCreating}
        />
      </div>

      {/* Mobile: toggle sidebar/chat */}
      <div className="flex flex-1 flex-col md:hidden">
        {!activeSessionId ? (
          <ChatSidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onCreate={handleCreate}
            onDelete={handleDelete}
            isCreating={isCreating}
          />
        ) : (
          <div className="flex h-full flex-col">
            <button
              type="button"
              onClick={() => setActiveSessionId(null)}
              className="flex min-h-[44px] items-center gap-1.5 border-b border-white/[0.04] bg-white/[0.01] px-4 heading-ui text-xs text-muted-foreground transition-colors hover:text-white"
            >
              <ArrowLeft size={12} />
              Sessions
            </button>
            <div className="flex-1">
              <ChatWindow sessionId={activeSessionId} userId={userId} />
            </div>
          </div>
        )}
      </div>

      {/* Desktop chat window */}
      <div className="hidden flex-1 md:block">
        <ChatWindow sessionId={activeSessionId} userId={userId} />
      </div>
    </div>
  )
}
