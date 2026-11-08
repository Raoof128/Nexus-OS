import { useCallback, useEffect, useState } from 'react'
import {
  estimateStorage,
  formatBytes,
  isOpfsSupported,
  requestPersistentStorage,
} from '../../../lib/opfsDrive'
import SettingsGroup from './SettingsGroup'

export default function StoragePanel() {
  const [est, setEst] = useState(null)
  // `pending` keeps "still measuring" apart from "the browser gave no estimate".
  const [pending, setPending] = useState(true)
  const [persistResult, setPersistResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const supported = isOpfsSupported()

  // Fire-and-forget refresh — setEst runs in the promise callback (not
  // synchronously in the effect body), which keeps react-hooks/set-state-in-effect
  // happy and mirrors the StorageMeter pattern in FileManagerApp.
  const refresh = useCallback(() => {
    setPending(true)
    estimateStorage().then((e) => {
      setEst(e)
      setPending(false)
    })
  }, [])

  useEffect(() => {
    let active = true
    estimateStorage().then((e) => {
      if (!active) return
      setEst(e)
      setPending(false)
    })
    return () => {
      active = false
    }
  }, [])

  const handlePersist = async () => {
    setBusy(true)
    const ok = await requestPersistentStorage()
    setPersistResult(ok)
    setBusy(false)
  }

  const usage = est?.usage ?? 0
  const quota = est?.quota ?? 0
  const pct = quota > 0 ? Math.min(100, Math.round((usage / quota) * 100)) : 0

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup legend="Nexus Drive storage">
        <div className="flex flex-col gap-2 pt-2">
          {!supported && (
            <p className="text-warning">
              Persistent file storage (OPFS) isn't available in this browser. Imported files won't
              survive a reload.
            </p>
          )}
          {pending ? (
            <>
              <div role="progressbar" className="marquee" aria-label="Measuring storage" />
              <p className="text-muted-foreground">Measuring storage…</p>
            </>
          ) : est ? (
            <>
              <div
                role="progressbar"
                aria-label="Storage used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <div style={{ width: `${pct}%` }} />
              </div>
              <p>
                {formatBytes(usage)} used of {formatBytes(quota)} available{' '}
                <span className="text-muted-foreground">({pct.toFixed(1)}%)</span>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Storage estimate unavailable.</p>
          )}
          <div>
            <button type="button" onClick={refresh} className="w7-btn">
              Refresh
            </button>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup legend="Persistent storage">
        <div className="flex flex-col gap-2 pt-2">
          <p>
            Ask the browser to mark Nexus Drive as persistent so files aren't evicted automatically
            when disk space runs low.
          </p>
          <div>
            <button type="button" onClick={handlePersist} disabled={busy} className="w7-btn">
              {busy ? 'Requesting…' : 'Request persistent storage'}
            </button>
          </div>
          {persistResult === true && <p className="text-success">Storage is now persistent.</p>}
          {persistResult === false && (
            <p className="text-warning">The browser declined. Storage stays best-effort.</p>
          )}
        </div>
      </SettingsGroup>
    </div>
  )
}
