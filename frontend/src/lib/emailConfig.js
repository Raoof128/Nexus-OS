import { Mail, Inbox, Send, FileText, Archive, Trash2, Star } from 'lucide-react'

export const EMAIL_FOLDERS = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileText },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'trash', label: 'Trash', icon: Trash2 },
  { id: 'starred', label: 'Starred', icon: Star },
]

// Provider badges are Windows 7 status pills (`w7-badge`) drawn from the
// design tokens in docs/win7-design-system.md §2. No hard-coded hex values.
export const PROVIDER_CONFIG = {
  google: { label: 'Gmail', bgColor: 'bg-w7-pane', textColor: 'text-w7-title' },
  microsoft: { label: 'Outlook', bgColor: 'bg-w7-pane', textColor: 'text-w7-title' },
}

export const EMAIL_TAB_ICON = Mail

export function getProviderBadge(provider) {
  return PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.google
}

export function formatEmailDate(isoString) {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}
