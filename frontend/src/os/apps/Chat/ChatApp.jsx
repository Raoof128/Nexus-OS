import { useState } from 'react'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useChatSessions } from '../../../hooks/useChat'
import ChatSidebar from './ChatSidebar'
import ChatWindow from './ChatWindow'

// One tree for every window width. The window body is a size container, so
// the layout switches with @md container queries instead of mounting a second
// copy of the sidebar and thread (which duplicated ids, state and live regions).
// Narrow: the list fills the window until a conversation is open, then the
// thread replaces it. Wide: list and thread sit side by side.
export default function ChatApp() {
  const { session } = useAuth()
  const userId = session?.user?.id ?? null
  const {
    sessions,
    createSession,
    deleteSession,
    isCreating,
    loading: isLoading,
    loadError,
    refetch,
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
      {/* List: full width when narrow and no conversation is open; fixed column when wide */}
      <div
        className={`${activeSessionId ? 'hidden' : 'flex'} h-full w-full shrink-0 @md:flex @md:w-[240px] @lg:w-[280px]`}
      >
        <ChatSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={setActiveSessionId}
          onCreate={handleCreate}
          onDelete={handleDelete}
          isCreating={isCreating}
          loadError={loadError}
          onRetry={() => refetch()}
        />
      </div>

      {/* Thread: when narrow it appears only after a conversation is chosen */}
      <div className={`${activeSessionId ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col @md:flex`}>
        {activeSessionId ? (
          <>
            <div className="w7-commandbar @md:hidden">
              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                className="w7-toolbtn min-h-[44px] px-3 text-[12px]"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Conversations
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <ChatWindow sessionId={activeSessionId} userId={userId} />
            </div>
          </>
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
