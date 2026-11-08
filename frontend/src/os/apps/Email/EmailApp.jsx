import { useState, useCallback, useEffect, useRef } from 'react'
import { motion as Motion } from 'framer-motion'
import { ArrowLeft, Loader2, Menu, Plus, X } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useEmailAccounts } from '../../../hooks/useEmailAccounts'
import { useEmails } from '../../../hooks/useEmails'
import { useEmailActions } from '../../../hooks/useEmailActions'
import { DURATION } from '../../../lib/motion'
import { EMAIL_FOLDERS } from '../../../lib/emailConfig'
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

  const isSearching = searchTerm.trim() !== ''
  const displayedEmails = isSearching ? searchResults : emails
  const folderLabel = EMAIL_FOLDERS.find((f) => f.id === activeFolder)?.label ?? activeFolder

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
      className="relative flex h-full w-full overflow-hidden bg-white text-foreground"
    >
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
            className="absolute inset-0 bg-black/20"
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
        className={`flex w-full shrink-0 flex-col border-r border-border @md:w-80 ${
          mobileView === 'reader' ? 'hidden @md:flex' : 'flex'
        }`}
      >
        {/* List header (command bar) */}
        <div className="w7-commandbar">
          {/* Mobile menu button */}
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="w7-toolbtn @md:hidden"
            aria-label="Open folder menu"
            title="Folders"
          >
            <Menu size={16} aria-hidden="true" />
          </button>
          <span className="truncate px-1 text-[12px] font-semibold text-foreground">
            {folderLabel}
          </span>
          {emailsLoading && (
            <Loader2 size={14} className="animate-spin text-primary" aria-hidden="true" />
          )}
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => {
                setReplyTo(null)
                setComposeOpen(true)
              }}
              className="w7-btn"
              aria-label="Compose new email"
            >
              <Plus size={14} aria-hidden="true" />
              Compose
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search mail"
            className="min-w-0 flex-1"
            aria-label="Search emails"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('')
                setSearchResults([])
              }}
              className="w7-toolbtn"
              aria-label="Clear search"
              title="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
          >
            <span className="w7-error text-[12px]">Your mail couldn&apos;t be loaded. {error}</span>
            <button type="button" onClick={() => refetch()} className="w7-btn">
              Try again
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
          searchActive={isSearching}
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
            className="w7-toolbtn min-h-[44px] gap-1.5 rounded-none border-b border-border px-4 @md:hidden"
          >
            <ArrowLeft size={16} aria-hidden="true" />
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
    </Motion.div>
  )
}
