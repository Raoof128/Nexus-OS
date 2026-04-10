import { useState, useCallback } from 'react'
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

  const handleSelect = useCallback((id) => {
    setSelectedEmailId(id)
    const email = emails.find((e) => e.id === id)
    if (email && !email.is_read) {
      actions.markRead({ emailId: id, isRead: true })
    }
  }, [emails, actions])

  const handleReply = useCallback(() => {
    if (selectedEmail) {
      setReplyTo(selectedEmail)
      setComposeOpen(true)
    }
  }, [selectedEmail])

  const handleConnectAccount = useCallback(() => {
    window.location.href = '/api/email/accounts/connect?provider=google'
  }, [])

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-zinc-950 rounded-lg border border-cyan-500/10 overflow-hidden">
      <FolderSidebar
        accounts={accounts}
        activeFolder={activeFolder}
        selectedAccountId={activeAccountId ?? 'all'}
        onSelectFolder={(f) => { setActiveFolder(f); setSelectedEmailId(null) }}
        onSelectAccount={(id) => { setActiveAccountId(id === 'all' ? null : id); setSelectedEmailId(null) }}
        onConnectAccount={handleConnectAccount}
      />
      <div className="w-80 flex-shrink-0 border-r border-cyan-500/10 flex flex-col">
        <div className="px-3 py-2 border-b border-cyan-500/10 flex items-center justify-between">
          <span className="text-xs uppercase tracking-widest text-cyan-500/60 font-medium">{activeFolder}</span>
          <button
            className="px-2 py-1 rounded text-xs text-cyan-400 hover:bg-cyan-500/10 transition-colors"
            onClick={() => { setReplyTo(null); setComposeOpen(true) }}
            aria-label="Compose new email"
          >
            Compose
          </button>
        </div>
        <EmailList
          emails={emails}
          selectedEmailId={selectedEmailId}
          loading={emailsLoading}
          onSelectEmail={(email) => handleSelect(email.id)}
          onToggleStar={(id, starred) => actions.toggleStar({ emailId: id, isStarred: starred })}
          onLoadMore={loadMore}
        />
      </div>
      <EmailReader
        email={selectedEmail}
        onArchive={() => selectedEmail && actions.moveToFolder({ emailId: selectedEmail.id, targetFolder: 'archive' })}
        onTrash={() => selectedEmail && actions.moveToFolder({ emailId: selectedEmail.id, targetFolder: 'trash' })}
        onToggleRead={() => selectedEmail && actions.markRead({ emailId: selectedEmail.id, isRead: !selectedEmail.is_read })}
        onReply={handleReply}
      />
      <ComposeModal
        isOpen={composeOpen}
        onClose={() => { setComposeOpen(false); setReplyTo(null) }}
        accounts={accounts}
        onSend={actions.sendEmail}
        onAiDraft={actions.aiDraft}
        isSending={actions.isSending}
        replyTo={replyTo}
      />
    </div>
  )
}
