import React from 'react'
import { Archive, MailOpen, Mail, Reply, Trash2 } from 'lucide-react'

const ToolbarButton = React.memo(function ToolbarButton({ onClick, icon: Icon, label, variant = 'default' }) {
  const variantClass =
    variant === 'danger'
      ? 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'
      : 'text-muted-foreground hover:bg-white/5 hover:text-white'

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-black ${variantClass}`}
    >
      <Icon size={14} />
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
    <div className="flex items-center gap-0.5 border-b border-white/[0.06] px-3 py-2">
      <ToolbarButton onClick={() => onReply?.(email)} icon={Reply} label="Reply" />

      <div className="mx-1 h-4 w-px bg-white/10" />

      <ToolbarButton
        onClick={() => onArchive?.(email)}
        icon={Archive}
        label="Archive"
      />
      <ToolbarButton
        onClick={() => onTrash?.(email)}
        icon={Trash2}
        label="Trash"
        variant="danger"
      />

      <div className="mx-1 h-4 w-px bg-white/10" />

      <ToolbarButton
        onClick={() => onToggleRead?.(email)}
        icon={email.is_read ? Mail : MailOpen}
        label={email.is_read ? 'Mark unread' : 'Mark read'}
      />
    </div>
  )
})

export default EmailToolbar
