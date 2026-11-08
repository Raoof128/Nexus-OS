import React from 'react'
import { Archive, MailOpen, Mail, Reply, Trash2 } from 'lucide-react'

const ToolbarButton = React.memo(function ToolbarButton({
  onClick,
  icon: Icon,
  label,
  variant = 'default',
}) {
  const danger = variant === 'danger' ? ' w7-toolbtn--danger' : ''

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w7-toolbtn pointer-coarse:min-h-[44px]${danger}`}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
})

const EmailToolbar = React.memo(function EmailToolbar({
  email,
  onReply,
  onArchive,
  onTrash,
  onToggleRead,
}) {
  if (!email) return null

  return (
    <div className="w7-commandbar" role="toolbar" aria-label="Message actions">
      <ToolbarButton onClick={() => onReply?.(email)} icon={Reply} label="Reply" />

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <ToolbarButton onClick={() => onArchive?.(email)} icon={Archive} label="Archive" />
      <ToolbarButton
        onClick={() => onTrash?.(email)}
        icon={Trash2}
        label="Trash"
        variant="danger"
      />

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <ToolbarButton
        onClick={() => onToggleRead?.(email)}
        icon={email.is_read ? Mail : MailOpen}
        label={email.is_read ? 'Mark as unread' : 'Mark as read'}
      />
    </div>
  )
})

export default EmailToolbar
