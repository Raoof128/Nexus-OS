import React from 'react'
import { Archive, MailOpen, Mail, Reply, Trash2, Forward } from 'lucide-react'

const ToolbarButton = React.memo(function ToolbarButton({
  onClick,
  icon: Icon,
  label,
  variant = 'default',
}) {
  const base =
    'relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-black'

  const variants = {
    default:
      'bg-white/[0.03] text-muted-foreground hover:bg-primary/10 hover:text-primary',
    danger:
      'bg-white/[0.03] text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
    accent:
      'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 hover:bg-primary/20 hover:shadow-[0_0_12px_hsl(var(--neon-cyan)/0.15)]',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`${base} ${variants[variant]}`}
    >
      <Icon size={13} />
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
    <div className="relative flex items-center gap-1 border-b border-white/[0.06] bg-white/[0.01] px-3 py-2">
      {/* Neon line at bottom of toolbar */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <ToolbarButton
        onClick={() => onReply?.(email)}
        icon={Reply}
        label="Reply"
        variant="accent"
      />

      <div className="mx-1.5 h-4 w-px bg-white/[0.06]" aria-hidden="true" />

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

      <div className="mx-1.5 h-4 w-px bg-white/[0.06]" aria-hidden="true" />

      <ToolbarButton
        onClick={() => onToggleRead?.(email)}
        icon={email.is_read ? Mail : MailOpen}
        label={email.is_read ? 'Mark Unread' : 'Mark Read'}
      />
    </div>
  )
})

export default EmailToolbar
