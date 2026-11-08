import { useState, useCallback, useEffect } from 'react'
import { motion as Motion } from 'framer-motion'
import { ArrowLeft, Loader2, Menu, Plus, X } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useEmailAccounts } from '../../../hooks/useEmailAccounts'
import { useEmails } from '../../../hooks/useEmails'
import { useEmailActions } from '../../../hooks/useEmailActions'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { DURATION } from '../../../lib/motion'
import { EMAIL_FOLDERS } from '../../../lib/emailConfig'
import FolderSidebar from './FolderSidebar'
import EmailList from './EmailList'
import EmailReader from './EmailReader'
import ComposeModal from './ComposeModal'

const SEARCH_DEBOUNCE_MS = 300

export default function EmailApp() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [activeFolder, setActiveFolder] = useState('inbox')
  const [activeAccountId, setActiveAccountId] = useState(null)
  const [selectedEmailId, setSelectedEmailId] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  // Message from a failed star, read, move or archive. Cleared by the next
  // action that succeeds, or when the folder changes.
  const [actionError, setActionError] = useState(null)

  // Mobile view state: 'folders' | 'list' | 'reader'
  const [mobileView, setMobileView] = useState('list')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  // Focus is held inside the mobile folder overlay while it is open, and goes
  // back to the folder menu button when it closes.
  const mobileSidebarRef = useFocusTrap(mobileSidebarOpen)

  // Search state. The box shows what is typed; the query waits until typing
  // pauses, so each pause sends one request. Results come from the same
  // paginated query as the folder list.
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Clearing the box takes effect at once; only typing waits for the debounce.
  const activeSearch = searchTerm.trim() ? debouncedSearch : ''
  const isSearching = activeSearch !== ''

  const resetSearch = useCallback(() => {
    setSearchTerm('')
    setDebouncedSearch('')
  }, [])

  const { accounts } = useEmailAccounts(userId)
  const {
    emails,
    loading: emailsLoading,
    error,
    refetch,
    loadMore,
  } = useEmails(session, activeFolder, activeAccountId, activeSearch)
  const actions = useEmailActions(userId, activeFolder, activeAccountId)

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || null

  // Unread dot for inbox
  const hasUnread = activeFolder === 'inbox' && emails.some((e) => !e.is_read)

  // Runs a mutation started from the UI and reports a failure, instead of
  // leaving the rejection unhandled.
  const runAction = useCallback((request, failureText) => {
    Promise.resolve(request).then(
      () => setActionError(null),
      (err) => setActionError(`${failureText} ${err?.message ?? ''}`.trim()),
    )
  }, [])

  // Escape closes the mobile folder overlay.
  useEffect(() => {
    if (!mobileSidebarOpen) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileSidebarOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileSidebarOpen])

  // emails is the displayed list: the folder when the box is empty, otherwise
  // the search results. Selection looks in the same list.
  const handleSelect = useCallback(
    (id) => {
      setSelectedEmailId(id)
      const email = emails.find((e) => e.id === id)
      if (email && !email.is_read) {
        runAction(
          actions.markRead({ emailId: id, isRead: true }),
          "Couldn't mark the message as read.",
        )
      }
      // On mobile, switch to reader view
      setMobileView('reader')
    },
    [emails, actions, runAction],
  )

  const openCompose = useCallback(
    (reply = null) => {
      // A failure from an earlier send belongs to that message, not this one.
      actions.clearSendError()
      setReplyTo(reply)
      setComposeOpen(true)
    },
    [actions],
  )

  const handleReply = useCallback(() => {
    if (selectedEmail) openCompose({ email: selectedEmail, type: 'reply' })
  }, [selectedEmail, openCompose])

  const handleConnectAccount = useCallback(() => {
    window.location.href = '/api/email/accounts/connect?provider=google'
  }, [])

  const handleFolderSelect = useCallback(
    (f) => {
      setActiveFolder(f)
      setSelectedEmailId(null)
      resetSearch()
      setActionError(null)
      setMobileView('list')
      setMobileSidebarOpen(false)
    },
    [resetSearch],
  )

  const handleAccountSelect = useCallback((id) => {
    setActiveAccountId(id === 'all' ? null : id)
    setSelectedEmailId(null)
    setMobileView('list')
    setMobileSidebarOpen(false)
  }, [])

  const handleToggleStar = useCallback(
    (args) => runAction(actions.toggleStar(args), "Couldn't update the star."),
    [actions, runAction],
  )

  const handleArchive = useCallback(
    () =>
      selectedEmail &&
      runAction(
        actions.moveToFolder({ emailId: selectedEmail.id, targetFolder: 'archive' }),
        "Couldn't archive the message.",
      ),
    [actions, runAction, selectedEmail],
  )

  const handleTrash = useCallback(
    () =>
      selectedEmail &&
      runAction(
        actions.moveToFolder({ emailId: selectedEmail.id, targetFolder: 'trash' }),
        "Couldn't move the message to Trash.",
      ),
    [actions, runAction, selectedEmail],
  )

  const handleToggleRead = useCallback(
    () =>
      selectedEmail &&
      runAction(
        actions.markRead({ emailId: selectedEmail.id, isRead: !selectedEmail.is_read }),
        "Couldn't change the read state.",
      ),
    [actions, runAction, selectedEmail],
  )

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
          <div ref={mobileSidebarRef} className="relative z-10 flex h-full">
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
            className="w7-toolbtn pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] @md:hidden"
            aria-label="Open folder menu"
            title="Folders"
          >
            <Menu size={16} aria-hidden="true" />
          </button>
          <span className="truncate px-1 text-[12px] font-semibold text-foreground">
            {folderLabel(activeFolder)}
          </span>
          {emailsLoading && (
            <Loader2 size={14} className="animate-spin text-primary" aria-hidden="true" />
          )}
          <div className="ml-auto">
            <button
              type="button"
              onClick={() => openCompose(null)}
              className="w7-btn pointer-coarse:min-h-[44px]"
              aria-label="Compose new email"
            >
              <Plus size={14} aria-hidden="true" />
              Compose
            </button>
          </div>
        </div>

        {/* Search. The native clear control is hidden; the X button below is the one clear control. */}
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search mail"
            className="min-w-0 flex-1 [&::-webkit-search-cancel-button]:appearance-none"
            aria-label="Search emails"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={resetSearch}
              className="w7-toolbtn pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]"
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

        {/* Action error (star, read, move, archive) */}
        {actionError && (
          <p role="alert" className="w7-error border-b border-border px-3 py-2 text-[12px]">
            {actionError}
          </p>
        )}

        <EmailList
          emails={emails}
          selectedEmailId={selectedEmailId}
          loading={emailsLoading}
          error={error}
          onSelectEmail={(email) => handleSelect(email.id)}
          onToggleStar={handleToggleStar}
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
          onArchive={handleArchive}
          onTrash={handleTrash}
          onToggleRead={handleToggleRead}
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

function folderLabel(folderId) {
  return EMAIL_FOLDERS.find((f) => f.id === folderId)?.label ?? folderId
}
