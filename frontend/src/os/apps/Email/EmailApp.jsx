import { useState, useCallback, useEffect, useRef } from 'react'
import { motion as Motion } from 'framer-motion'
import { ArrowLeft, Menu, Search } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useEmailAccounts } from '../../../hooks/useEmailAccounts'
import { useEmails } from '../../../hooks/useEmails'
import { useEmailActions } from '../../../hooks/useEmailActions'
import { DURATION } from '../../../lib/motion'
import FolderSidebar from './FolderSidebar'
import EmailList from './EmailList'
import EmailReader from './EmailReader'
import ComposeModal from './ComposeModal'

export default function EmailApp() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [activeFolder, setActiveFolder] = useState('inbox')
  const [activeAccountId, setActiveAccountId] = useState(null)
  const [selectedEmailId, setSelectedEmailId] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [replyTo, setReplyTo] = useState(null)

  // Mobile view state: 'folders' | 'list' | 'reader'
  const [mobileView, setMobileView] = useState('list')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const searchDebounceRef = useRef(null)

  const { accounts } = useEmailAccounts(userId)
  const {
    emails,
    loading: emailsLoading,
    error,
    refetch,
    loadMore,
    search,
  } = useEmails(session, activeFolder, activeAccountId)
  const actions = useEmailActions(userId, activeFolder, activeAccountId)

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || null

  // Unread dot for inbox
  const hasUnread = activeFolder === 'inbox' && emails.some((e) => !e.is_read)

  // Debounced search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!searchTerm.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([])
      return
    }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await search(searchTerm)
        setSearchResults(results)
      } catch {
        setSearchResults([])
      }
    }, 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchTerm, search])

  const displayedEmails = searchTerm.trim() ? searchResults : emails

  const handleSelect = useCallback(
    (id) => {
      setSelectedEmailId(id)
      const email = emails.find((e) => e.id === id)
      if (email && !email.is_read) {
        actions.markRead({ emailId: id, isRead: true })
      }
      // On mobile, switch to reader view
      setMobileView('reader')
    },
    [emails, actions],
  )

  const handleReply = useCallback(() => {
    if (selectedEmail) {
      setReplyTo({ email: selectedEmail, type: 'reply' })
      setComposeOpen(true)
    }
  }, [selectedEmail])

  const handleConnectAccount = useCallback(() => {
    window.location.href = '/api/email/accounts/connect?provider=google'
  }, [])

  const handleFolderSelect = useCallback((f) => {
    setActiveFolder(f)
    setSelectedEmailId(null)
    setSearchTerm('')
    setSearchResults([])
    setMobileView('list')
    setMobileSidebarOpen(false)
  }, [])

  const handleAccountSelect = useCallback((id) => {
    setActiveAccountId(id === 'all' ? null : id)
    setSelectedEmailId(null)
    setMobileView('list')
    setMobileSidebarOpen(false)
  }, [])

  return (
    <Motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: DURATION.slow }}
      className="neon-border relative flex h-full w-full overflow-hidden rounded-none glass-panel @sm:rounded-2xl"
    >
      {/* Top neon accent */}
      <div className="absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_15px_var(--color-primary)]" />

      {/* Left: Folder Sidebar — hidden on mobile, shown on md+ */}
      <div className="hidden @md:flex">
        <FolderSidebar
          accounts={accounts}
          activeFolder={activeFolder}
          selectedAccountId={activeAccountId ?? 'all'}
          onSelectFolder={handleFolderSelect}
          onSelectAccount={handleAccountSelect}
          onConnectAccount={handleConnectAccount}
          hasUnreadInbox={hasUnread}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex @md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full">
            <FolderSidebar
              accounts={accounts}
              activeFolder={activeFolder}
              selectedAccountId={activeAccountId ?? 'all'}
              onSelectFolder={handleFolderSelect}
              onSelectAccount={handleAccountSelect}
              onConnectAccount={handleConnectAccount}
              hasUnreadInbox={hasUnread}
            />
          </div>
        </div>
      )}

      {/* Middle: Email List */}
      <div
        className={`flex w-full shrink-0 flex-col border-r border-white/[0.06] @md:w-80 ${
          mobileView === 'reader' ? 'hidden @md:flex' : 'flex'
        }`}
      >
        {/* List header */}
        <div className="relative flex items-center justify-between border-b border-white/[0.06] bg-white/[0.01] px-4 py-2.5">
          <div className="flex items-center gap-2">
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="mr-1 rounded-md p-1 text-muted-foreground hover:text-white focus-visible:ring-2 focus-visible:ring-primary @md:hidden"
              aria-label="Open folder menu"
            >
              <Menu size={14} />
            </button>
            <span className="heading-display text-[10px] tracking-[0.2em] text-primary/60">
              // {activeFolder}
            </span>
            {emailsLoading && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]" />
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setReplyTo(null)
              setComposeOpen(true)
            }}
            className="heading-ui rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20 transition-all hover:bg-primary/20 hover:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.15)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label="Compose new email"
          >
            Compose
          </button>
          {/* Neon bottom accent */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
        </div>

        {/* Search bar */}
        <div className="relative border-b border-white/[0.04] bg-white/[0.01] px-3 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 focus-within:border-primary/30 focus-within:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.08)]">
            <Search size={11} className="shrink-0 text-primary/40" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="search::signals..."
              className="flex-1 bg-transparent font-mono text-[11px] text-white/70 placeholder-muted-foreground/30 focus:outline-none"
              aria-label="Search emails"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setSearchResults([])
                }}
                className="text-muted-foreground/40 hover:text-white"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2"
          >
            <span className="font-mono text-[10px] text-red-400">error:: {error}</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded px-2 py-0.5 font-mono text-[10px] text-red-400 ring-1 ring-red-500/30 hover:bg-red-500/20"
            >
              retry
            </button>
          </div>
        )}

        <EmailList
          emails={displayedEmails}
          selectedEmailId={selectedEmailId}
          loading={emailsLoading}
          onSelectEmail={(email) => handleSelect(email.id)}
          onToggleStar={actions.toggleStar}
          onLoadMore={loadMore}
          activeFolder={activeFolder}
        />
      </div>

      {/* Right: Email Reader */}
      <div
        className={`flex min-w-0 flex-1 flex-col ${
          mobileView !== 'reader' ? 'hidden @md:flex' : 'flex'
        }`}
      >
        {/* Mobile back button */}
        {mobileView === 'reader' && (
          <button
            type="button"
            onClick={() => setMobileView('list')}
            className="flex min-h-[44px] items-center gap-1.5 border-b border-white/[0.04] bg-white/[0.01] px-4 heading-ui text-xs text-muted-foreground transition-colors hover:text-white @md:hidden"
          >
            <ArrowLeft size={12} />
            Back
          </button>
        )}
        <EmailReader
          email={selectedEmail}
          onArchive={() =>
            selectedEmail &&
            actions.moveToFolder({
              emailId: selectedEmail.id,
              targetFolder: 'archive',
            })
          }
          onTrash={() =>
            selectedEmail &&
            actions.moveToFolder({
              emailId: selectedEmail.id,
              targetFolder: 'trash',
            })
          }
          onToggleRead={() =>
            selectedEmail &&
            actions.markRead({
              emailId: selectedEmail.id,
              isRead: !selectedEmail.is_read,
            })
          }
          onReply={handleReply}
        />
      </div>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={composeOpen}
        onClose={() => {
          setComposeOpen(false)
          setReplyTo(null)
        }}
        accounts={accounts}
        onSend={actions.sendEmail}
        onReply={actions.replyEmail}
        onForward={actions.forwardEmail}
        onAiDraft={actions.aiDraft}
        isSending={actions.isSending}
        sendError={actions.sendError}
        replyTo={replyTo}
      />

      {/* Bottom neon accent */}
      <div className="absolute inset-x-0 bottom-0 z-10 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
    </Motion.div>
  )
}
