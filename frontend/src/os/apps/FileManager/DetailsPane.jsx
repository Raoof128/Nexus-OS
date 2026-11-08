import { formatBytes } from '../../../lib/opfsDrive'
import StorageMeter from './StorageMeter'

// Explorer status strip: item count or selection summary on the left, the active sort
// in the middle when it is not the default (its column header may be hidden at this
// width), import progress in the same slot while importing, storage on the right.
export default function DetailsPane({
  itemCount,
  selected,
  selectedSize,
  singleLabel,
  sortLabel,
  importProgress,
}) {
  let summary
  if (selected.length === 0) {
    summary = `${itemCount} item${itemCount !== 1 ? 's' : ''}`
  } else if (selected.length === 1) {
    summary = singleLabel
  } else {
    summary = `${selected.length} items selected${selectedSize ? ` · ${formatBytes(selectedSize)}` : ''}`
  }

  return (
    <div className="w7-detailspane flex shrink-0 items-center justify-between gap-3 px-3 py-1 text-[12px]">
      <span className="max-w-[50%] shrink-0 truncate">{summary}</span>
      {importProgress ? (
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-muted-foreground">
            Importing {importProgress.name} ({importProgress.done + 1} of {importProgress.total})
          </span>
          <div
            role="progressbar"
            aria-label="Import progress"
            aria-valuemin={0}
            aria-valuemax={importProgress.total}
            aria-valuenow={importProgress.done}
            className="w-24 shrink-0"
          >
            <div
              style={{
                width: `${Math.round((importProgress.done / importProgress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      ) : (
        sortLabel && (
          <span className="min-w-0 truncate text-muted-foreground" title={sortLabel}>
            {sortLabel}
          </span>
        )
      )}
      <StorageMeter />
    </div>
  )
}
