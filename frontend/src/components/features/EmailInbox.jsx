import { useState, useCallback } from 'react'
import { motion as Motion } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import { useEmailAccounts } from '../../hooks/useEmailAccounts'
import { useEmails } from '../../hooks/useEmails'
import { useEmailActions } from '../../hooks/useEmailActions'
import FolderSidebar from './FolderSidebar'
import EmailList from './EmailList'
import EmailReader from './EmailReader'
import ComposeModal from './ComposeModal'

export default function EmailInbox() {
  const { session } = useAuth()
  const [activeFolder, setActiveFolder] = useState('inbox')
  const [activeAccountId, setActiveAccountId] = useState(null)
  const [selectedEmailId, setSelectedEmailId] = useState(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [replyTo, setReplyTo] = useState(null)

  const { accounts } = useEmailAccounts(session)
  const { emails, loading: emailsLoading, loadMore } = useEmails(session, activeFolder, activeAccountId)
  const actions = useEmailActions(session, activeFolder, activeAccountId)

  const selectedEmail = emails.find((e) => e.id === selectedEmailId) || null

  const handleSelect = useCallback(
    (id) => {
      setSelectedEmailId(id)
      const email = emails.find((e) => e.id === id)
      if (email && !email.is_read) {
        actions.markRead({ emailId: id, isRead: true })
      }
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

  return (
    <Motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className="neon-border relative flex h-[calc(100dvh-7rem)] overflow-hidden rounded-2xl glass-panel"
    >
      {/* Top neon accent */}
      <div className="absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_15px_var(--color-primary)]" />

      {/* Left: Folder Sidebar */}
      <FolderSidebar
        accounts={accounts}
        activeFolder={activeFolder}
        selectedAccountId={activeAccountId ?? 'all'}
        onSelectFolder={(f) => {
          setActiveFolder(f)
          setSelectedEmailId(null)
        }}
        onSelectAccount={(id) => {
          setActiveAccountId(id === 'all' ? null : id)
          setSelectedEmailId(null)
        }}
        onConnectAccount={handleConnectAccount}
      />

      {/* Middle: Email List */}
      <div className="flex w-80 shrink-0 flex-col border-r border-white/[0.06]">
        {/* List header */}
        <div className="relative flex items-center justify-between border-b border-white/[0.06] bg-white/[0.01] px-4 py-2.5">
          <div className="flex items-center gap-2">
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
            className="heading-ui rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/20 transition-all hover:bg-primary/20 hover:shadow-[0_0_10px_hsl(var(--neon-cyan)/0.15)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            aria-label="Compose new email"
          >
            Compose
          </button>
          {/* Neon bottom accent */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
        </div>

        <EmailList
          emails={emails}
          selectedEmailId={selectedEmailId}
          loading={emailsLoading}
          onSelectEmail={(email) => handleSelect(email.id)}
          onToggleStar={actions.toggleStar}
          onLoadMore={loadMore}
        />
      </div>

      {/* Right: Email Reader */}
      <div className="flex min-w-0 flex-1 flex-col">
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
