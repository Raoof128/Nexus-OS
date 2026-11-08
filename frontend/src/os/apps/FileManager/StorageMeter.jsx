import { useEffect, useState } from 'react'
import { HardDrive } from 'lucide-react'
import { useFileSystemStore } from '../../stores/fileSystemStore'
import { estimateStorage, formatBytes } from '../../../lib/opfsDrive'

export default function StorageMeter() {
  const [info, setInfo] = useState(null)
  // The dependency is the whole file map so the meter refreshes when files
  // are imported/removed. estimateStorage() is cheap and best-effort.
  const files = useFileSystemStore((s) => s.files)

  useEffect(() => {
    let cancelled = false
    estimateStorage().then((est) => {
      // Only set when there is a value, so an unavailable estimate causes no re-render.
      if (!cancelled && est) setInfo(est)
    })
    return () => {
      cancelled = true
    }
  }, [files])

  if (!info || !info.quota) return null
  const pct = Math.min(100, Math.round((info.usage / info.quota) * 100))
  return (
    <div
      className="flex shrink-0 items-center gap-2"
      title={`${formatBytes(info.usage)} of ${formatBytes(info.quota)} used`}
    >
      <HardDrive size={14} className="text-muted-foreground" aria-hidden="true" />
      <div role="progressbar" aria-label="Storage used" aria-valuenow={pct} className="w-24">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">{formatBytes(info.usage)}</span>
    </div>
  )
}
