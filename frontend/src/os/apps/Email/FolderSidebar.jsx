import React, { useCallback, useId } from 'react'
import { Plus } from 'lucide-react'
import { EMAIL_FOLDERS, getProviderBadge } from '../../../lib/emailConfig'

const FolderSidebar = React.memo(function FolderSidebar({
  accounts = [],
  selectedAccountId = 'all',
  activeFolder = 'inbox',
  onSelectAccount,
  onSelectFolder,
  onConnectAccount,
  hasUnreadInbox = false,
}) {
  // The sidebar renders twice (desktop column and mobile overlay), so the id
  // must be unique per instance.
  const accountSelectId = `email-account-select-${useId()}`

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
    <aside className="w7-navpane flex h-full w-56 shrink-0 flex-col">
      {/* Account selector */}
      <div className="px-3 pb-2 pt-3">
        <label htmlFor={accountSelectId} className="w7-subheading mb-1 block">
          Accounts
        </label>
        <select
          id={accountSelectId}
          value={selectedAccountId}
          onChange={handleAccountChange}
          className="w-full"
          aria-label="Select email account"
        >
          <option value="all">All accounts</option>
          {accounts.map((account) => {
            const badge = getProviderBadge(account.provider)
            return (
              <option key={account.id} value={account.id}>
                {badge.label} — {account.email}
              </option>
            )
          })}
        </select>

        {/* Provider badges */}
        {selectedAccountId === 'all' && accounts.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {accounts.map((account) => {
              const badge = getProviderBadge(account.provider)
              return (
                <span key={account.id} className={`w7-badge ${badge.bgColor} ${badge.textColor}`}>
                  {badge.label}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* Folder list */}
      <nav className="flex-1 overflow-y-auto p-2" aria-label="Email folders">
        <ul className="space-y-px">
          {EMAIL_FOLDERS.map(({ id, label, icon: Icon }) => {
            const isActive = activeFolder === id
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => handleFolderClick(id)}
                  className="w7-item flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] pointer-coarse:min-h-[44px]"
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={16} aria-hidden="true" className="shrink-0 text-[#3d5a80]" />
                  <span className="flex-1">{label}</span>
                  {id === 'inbox' && hasUnreadInbox && (
                    <span
                      className="ml-auto h-2 w-2 rounded-full bg-primary"
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
      <div className="border-t border-border p-3">
        <button
          type="button"
          onClick={onConnectAccount}
          className="w7-btn w-full gap-2 pointer-coarse:min-h-[44px]"
        >
          <Plus size={14} aria-hidden="true" />
          Connect account
        </button>
      </div>
    </aside>
  )
})

export default FolderSidebar
