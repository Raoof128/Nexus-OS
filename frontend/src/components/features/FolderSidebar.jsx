import React, { useCallback } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { EMAIL_FOLDERS, getProviderBadge } from '../../lib/emailConfig'

const FolderSidebar = React.memo(function FolderSidebar({
  accounts = [],
  selectedAccountId = 'all',
  activeFolder = 'inbox',
  onSelectAccount,
  onSelectFolder,
  onConnectAccount,
}) {
  const handleFolderClick = useCallback(
    (folderId) => {
      onSelectFolder?.(folderId)
    },
    [onSelectFolder],
  )

  const handleAccountChange = useCallback(
    (e) => {
      onSelectAccount?.(e.target.value)
    },
    [onSelectAccount],
  )

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-white/[0.06] bg-background/60 backdrop-blur-sm">
      {/* Account selector */}
      <div className="border-b border-white/[0.06] p-3">
        <div className="relative">
          <select
            value={selectedAccountId}
            onChange={handleAccountChange}
            className="w-full appearance-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 pr-8 text-xs font-medium text-white/80 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
            aria-label="Select email account"
          >
            <option value="all">All Accounts</option>
            {accounts.map((account) => {
              const badge = getProviderBadge(account.provider)
              return (
                <option key={account.id} value={account.id}>
                  {badge.label} — {account.email}
                </option>
              )
            })}
          </select>
          <ChevronDown
            size={12}
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </div>

        {/* Account provider badges */}
        {selectedAccountId === 'all' && accounts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {accounts.map((account) => {
              const badge = getProviderBadge(account.provider)
              return (
                <span
                  key={account.id}
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.bgColor} ${badge.textColor}`}
                >
                  {badge.label}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Folder list */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Email folders">
        <ul className="space-y-0.5">
          {EMAIL_FOLDERS.map(({ id, label, icon: Icon }) => {
            const isActive = activeFolder === id
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => handleFolderClick(id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-black ${
                    isActive
                      ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--color-primary)/0.3)]'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-white'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    size={14}
                    className={isActive ? 'text-primary' : 'text-muted-foreground'}
                  />
                  <span>{label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Connect account button */}
      <div className="border-t border-white/[0.06] p-3">
        <button
          type="button"
          onClick={onConnectAccount}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-black"
        >
          <Plus size={12} />
          Connect Account
        </button>
      </div>
    </aside>
  )
})

export default FolderSidebar
