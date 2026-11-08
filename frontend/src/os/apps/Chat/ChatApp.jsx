import { useState } from 'react'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useChatSessions } from '../../../hooks/useChat'
import ChatSidebar from './ChatSidebar'
import ChatWindow from './ChatWindow'

export default function ChatApp() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const {
    sessions,
    createSession,
    deleteSession,
    isCreating,
    loading: isLoading,
  } = useChatSessions(userId)
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

  if (isLoading && sessions.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background" role="status">
        <div className="flex w-48 flex-col gap-2">
          <div role="progressbar" aria-label="Loading conversations" className="marquee" />
          <p className="text-[12px] text-muted-foreground">Loading conversations…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden w-[240px] shrink-0 @md:block @lg:w-[280px]">
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
      <div className="flex flex-1 flex-col @md:hidden">
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
            <div className="w7-commandbar">
              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                className="w7-toolbtn min-h-[44px] px-3 text-[12px]"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Conversations
              </button>
            </div>
            <div className="flex-1">
              <ChatWindow sessionId={activeSessionId} userId={userId} />
            </div>
          </div>
        )}
      </div>

      {/* Desktop chat window */}
      <div className="hidden flex-1 @md:block">
        {activeSessionId ? (
          <ChatWindow sessionId={activeSessionId} userId={userId} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-8">
            <MessageSquare size={32} className="text-[#3d5a80]" aria-hidden="true" />
            <p className="text-[12px] text-muted-foreground">Select a conversation</p>
          </div>
        )}
      </div>
    </div>
  )
}
