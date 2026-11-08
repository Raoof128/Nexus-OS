import { memo, useMemo, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from 'lucide-react'
import { MEDIA_CONFIG, TYPE_ICONS, getStatusNav } from '../../../lib/mediaConfig'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'

function MediaVault({
  items,
  mediaType,
  filterStatus,
  onBack,
  onUpdate,
  onDelete,
  onSelect,
  onEdit,
}) {
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const config = MEDIA_CONFIG[mediaType]
  const Icon = TYPE_ICONS[mediaType]
  const isJob = mediaType === 'job'
  const rowGrid = isJob
    ? '@sm:grid-cols-[2fr_1.5fr_1fr_0.8fr_72px]'
    : '@sm:grid-cols-[2fr_1.5fr_1fr_0.8fr_0.5fr_72px]'

  const filtered = useMemo(() => {
    let result = items
    if (filterStatus) {
      result = result.filter((item) => item.status === filterStatus)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (item) =>
          (item.title || '').toLowerCase().includes(q) ||
          (item.creator || '').toLowerCase().includes(q) ||
          (item.genre || '').toLowerCase().includes(q),
      )
    }
    return result
  }, [items, filterStatus, search])

  const handleStatusChange = (event, item, newStatus) => {
    event.stopPropagation()
    if (!newStatus || !onUpdate) return
    onUpdate({ mediaId: item.id, data: { status: newStatus } })
  }

  const handleDelete = (event, item) => {
    event.stopPropagation()
    if (!onDelete) return
    setDeleteTarget(item.id)
  }

  const confirmDeleteAction = () => {
    if (!deleteTarget || !onDelete) return
    onDelete(deleteTarget)
    setDeleteTarget(null)
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 flex-col gap-2 p-3 @sm:flex-row @sm:items-center @sm:justify-between @sm:p-4">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onBack} className="w7-toolbtn">
            <ArrowLeft size={14} aria-hidden="true" />
            Back to overview
          </button>
          <Icon size={16} className="shrink-0 text-[#3d5a80]" aria-hidden="true" />
          <h2 className="w7-heading truncate">
            {filterStatus || 'All'} — {config?.label}
          </h2>
          <span className="w7-badge tabular-nums">{filtered.length}</span>
        </div>

        {/* Search */}
        <div className="relative w-full @sm:max-w-xs">
          <Search
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this list…"
            aria-label="Search vault"
            className="w-full pl-7"
          />
        </div>
      </div>

      {/* List */}
      <div className="w7-sunken mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden @sm:mx-4 @sm:mb-4">
        {/* Column headings */}
        <div
          className={`hidden shrink-0 border-b border-border bg-w7-pane px-3 py-1.5 text-[12px] text-muted-foreground @sm:grid @sm:items-center ${rowGrid}`}
        >
          <span>Title</span>
          <span>{config?.creatorLabel || 'Creator'}</span>
          {!isJob && <span>Genre</span>}
          <span>Status</span>
          {!isJob && <span>Rating</span>}
          <span>{isJob ? config?.subInfoLabel || 'Info' : ''}</span>
        </div>

        {/* Rows */}
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {filtered.length === 0 &&
            (search.trim() ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <p className="text-[12px] text-muted-foreground">
                  No items match &ldquo;{search.trim()}&rdquo;.
                </p>
                <button type="button" onClick={() => setSearch('')} className="w7-btn">
                  Clear search
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                <p className="text-[12px] text-muted-foreground">
                  {filterStatus
                    ? `No ${config?.label?.toLowerCase()} marked “${filterStatus}” yet.`
                    : `No ${config?.label?.toLowerCase()} here yet.`}
                </p>
              </div>
            ))}
          {filtered.map((item) => (
            <Motion.div
              key={item.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => onSelect?.(item)}
              className={`w7-item group cursor-pointer px-2 py-1.5 @sm:grid @sm:items-center ${rowGrid}`}
            >
              {/* Title — a real button so the row opens from the keyboard too
                  (Enter/Space click bubbles to the row's onClick). */}
              <button
                type="button"
                aria-haspopup="dialog"
                className="mb-0.5 block w-full min-w-0 truncate text-left font-semibold text-foreground @sm:mb-0 @sm:pr-3"
              >
                {item.title}
              </button>

              {/* Creator */}
              <div className="mb-0.5 truncate text-muted-foreground @sm:mb-0 @sm:pr-3">
                <span className="mr-1 text-[11px] @sm:hidden">{config?.creatorLabel}:</span>
                {item.creator !== '—' ? item.creator : ''}
              </div>

              {/* Genre */}
              {!isJob && (
                <div className="mb-0.5 @sm:mb-0">
                  <span className="mr-1 text-[11px] text-muted-foreground @sm:hidden">Genre:</span>
                  {item.genre && <span className="w7-badge">{item.genre}</span>}
                </div>
              )}

              {/* Status */}
              <div className="mb-0.5 flex items-center gap-1 @sm:mb-0">
                <span className="mr-1 text-[11px] text-muted-foreground @sm:hidden">Status:</span>
                {(() => {
                  const { prev, next } = getStatusNav(mediaType, item.status)
                  return (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleStatusChange(e, item, prev)}
                        disabled={!prev}
                        className="w7-toolbtn px-1 disabled:invisible"
                        aria-label={prev ? `Back to ${prev}` : undefined}
                      >
                        <ChevronLeft size={12} aria-hidden="true" />
                      </button>
                      <span className="w7-badge">{item.status}</span>
                      <button
                        type="button"
                        onClick={(e) => handleStatusChange(e, item, next)}
                        disabled={!next}
                        className="w7-toolbtn px-1 disabled:invisible"
                        aria-label={next ? `Advance to ${next}` : undefined}
                      >
                        <ChevronRight size={12} aria-hidden="true" />
                      </button>
                    </>
                  )
                })()}
              </div>

              {/* Rating */}
              {!isJob && (
                <div className="mb-0.5 text-[12px] text-[#8a5a00] @sm:mb-0">
                  <span className="mr-1 text-[11px] text-muted-foreground @sm:hidden">Rating:</span>
                  {item.rating != null && item.rating > 0 ? `★ ${item.rating}` : ''}
                </div>
              )}

              {/* Sub-info (job only, occupies the Salary/Location column in the grid) */}
              {isJob && (
                <div className="mb-0.5 text-muted-foreground @sm:mb-0">
                  <span className="mr-1 text-[11px] @sm:hidden">{config?.subInfoLabel}:</span>
                  {item.sub_info || ''}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit?.(item)
                  }}
                  className="w7-toolbtn px-1"
                  title="Edit"
                  aria-label="Edit"
                >
                  <Pencil size={12} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, item)}
                  className="w7-toolbtn w7-toolbtn--danger px-1"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
            </Motion.div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        id={deleteTarget}
        title="Delete entry"
        message="This action cannot be undone. Are you sure you want to delete this entry?"
        onConfirm={confirmDeleteAction}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default memo(MediaVault)
