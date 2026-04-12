import React, { useCallback } from 'react'
import { ChevronDown, Plus, Zap } from 'lucide-react'
import { EMAIL_FOLDERS, getProviderBadge } from '../../lib/emailConfig'

const FolderSidebar = React.memo(function FolderSidebar({
  accounts = [],
  selectedAccountId = 'all',
  activeFolder = 'inbox',
  onSelectAccount,
  onSelectFolder,
  onConnectAccount,
  hasUnreadInbox = false,
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
    <aside className="relative flex h-full w-56 shrink-0 flex-col glass-panel border-r border-white/[0.06]">
      {/* Neon top accent line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent shadow-[0_0_10px_var(--color-primary)]" />

      {/* Section header */}
      <div className="border-b border-white/[0.06] px-3 py-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary/60">
          // Uplinks
        </div>
        <div className="relative">
          <select
            value={selectedAccountId}
            onChange={handleAccountChange}
            className="heading-ui w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 pr-8 text-xs text-white/80 transition-all focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:shadow-[0_0_12px_hsl(var(--neon-yellow)/0.15)]"
            aria-label="Select email account"
          >
            <option value="all">All Uplinks</option>
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
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-primary/40"
          />
        </div>

        {/* Provider badges */}
        {selectedAccountId === 'all' && accounts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {accounts.map((account) => {
              const badge = getProviderBadge(account.provider)
              return (
                <span
                  key={account.id}
                  className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold ring-1 ring-inset ring-white/10 ${badge.bgColor} ${badge.textColor}`}
                >
                  {badge.label}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Folder list */}
      <nav className="flex-1 overflow-y-auto custom-scrollbar p-2" aria-label="Email folders">
        <div className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50">
          // Channels
        </div>
        <ul className="space-y-0.5">
          {EMAIL_FOLDERS.map(({ id, label, icon: Icon }) => {
            const isActive = activeFolder === id
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => handleFolderClick(id)}
                  className={`heading-ui flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                    isActive
                      ? 'bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--neon-yellow)/0.3),0_0_12px_hsl(var(--neon-yellow)/0.1)]'
                      : 'text-muted-foreground hover:bg-white/[0.04] hover:text-white'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon
                    size={14}
                    className={
                      isActive
                        ? 'text-primary drop-shadow-[0_0_6px_hsl(var(--neon-yellow)/0.6)]'
                        : 'text-muted-foreground'
                    }
                  />
                  <span className="flex-1">{label}</span>
                  {id === 'inbox' && hasUnreadInbox && (
                    <span
                      className="ml-auto h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]"
                      aria-label="Has unread messages"
                    />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Connect account */}
      <div className="border-t border-white/[0.06] p-3">
        <button
          type="button"
          onClick={onConnectAccount}
          className="neon-pulse flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/20 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary hover:shadow-[0_0_15px_hsl(var(--neon-yellow)/0.1)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <Zap size={11} />
          Uplink Account
        </button>
      </div>

      {/* Neon bottom accent */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </aside>
  )
})

export default FolderSidebar
