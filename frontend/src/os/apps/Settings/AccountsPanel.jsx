import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { clearAllBlobs } from '../../../lib/opfsDrive'
import SettingsGroup from './SettingsGroup'
import { isIdleLockEnabled, setIdleLockEnabled } from '../../components/DesktopMenus/desktopPrefs'

export default function AccountsPanel() {
  const { session, signOut } = useAuth()
  const user = session?.user
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Reset removes every browser-local Nexus OS item: settings, notes, the Nexus Drive
  // file tree and its OPFS blobs, and the window layout. The server account is untouched.
  // Blobs are awaited first, because reloading would abort the deletion.
  const handleReset = async () => {
    await clearAllBlobs()
    localStorage.clear()
    window.location.reload()
  }

  const [idleLock, setIdleLock] = useState(isIdleLockEnabled)

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup legend="Screen lock">
        <div className="pt-2">
          <input
            type="checkbox"
            id="settings-idle-lock"
            checked={idleLock}
            onChange={(e) => {
              setIdleLockEnabled(e.target.checked)
              setIdleLock(e.target.checked)
            }}
          />
          <label htmlFor="settings-idle-lock">
            Lock the computer after 5 minutes of inactivity
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup legend="Session">
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 pt-2 text-[12px]">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="min-w-0 truncate">{user?.email || '—'}</dd>
          <dt className="text-muted-foreground">Provider</dt>
          <dd>{user?.app_metadata?.provider || 'email'}</dd>
          <dt className="text-muted-foreground">User ID</dt>
          <dd className="min-w-0 truncate text-[12px]">{user?.id || '—'}</dd>
        </dl>
      </SettingsGroup>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={signOut} className="w7-btn">
          <LogOut size={14} aria-hidden="true" />
          Sign out
        </button>
        {/* The ellipsis marks a command that asks first. Pushed to the far end so it is not next to Sign out. */}
        <button type="button" onClick={() => setShowResetConfirm(true)} className="w7-btn ml-auto">
          Factory reset…
        </button>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        title="Factory reset"
        message="This removes your settings, notes, files on Nexus Drive and window layout from this browser. Your account on the server is not changed. You can't undo this."
        confirmLabel="Reset"
        defaultAction="cancel"
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
        variant="destructive"
      />
    </div>
  )
}
