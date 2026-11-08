import { memo, useMemo, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { MEDIA_CONFIG, TYPE_ICONS, getStatusNav } from '../../../lib/mediaConfig'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'

function MediaVault({
  items,
  mediaType,
  filterStatus,
  selectedId = null,
  onBack,
  onUpdate,
  onDelete,
  onSelect,
  onEdit,
}) {
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [focusedId, setFocusedId] = useState(null)
  const rowsRef = useRef(null)

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

  // Roving tabindex: one row is in the Tab sequence (the last one focused,
  // else the selected one, else the first). Arrow keys move between rows.
  const tabStopId = filtered.some((i) => i.id === focusedId)
    ? focusedId
    : filtered.some((i) => i.id === selectedId)
      ? selectedId
      : (filtered[0]?.id ?? null)

  const focusRowAt = (index) => {
    const rows = rowsRef.current?.querySelectorAll('[data-vault-row]')
    rows?.[index]?.focus()
  }

  const handleRowKeyDown = (event, index, item) => {
    // Keys pressed on the row's own buttons belong to those buttons.
    if (event.target !== event.currentTarget) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusRowAt(Math.min(index + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        focusRowAt(Math.max(index - 1, 0))
        break
      case 'Home':
        event.preventDefault()
        focusRowAt(0)
        break
      case 'End':
        event.preventDefault()
        focusRowAt(filtered.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onSelect?.(item)
        break
      default:
        break
    }
  }

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

  const label = config?.label || 'Items'
  const hasRows = filtered.length > 0

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
            {filterStatus || 'All'} — {label}
          </h2>
          <span className="w7-badge tabular-nums">{filtered.length}</span>
        </div>

        {/* Search: 7.css search box (type=search draws the magnifier) */}
        <div className="w-full @sm:max-w-xs">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this list"
            aria-label="Search vault"
            className="w-full"
          />
        </div>
      </div>

      {/* List: a table-style list view (header row + selectable data rows) */}
      <div className="w7-sunken mx-3 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden @sm:mx-4 @sm:mb-4">
        <div
          role="table"
          aria-label={`${label}, ${filterStatus || 'all statuses'}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Column headings */}
          <div role="rowgroup" className="shrink-0">
            <div
              role="row"
              className={`hidden border-b border-border bg-w7-pane px-3 py-1.5 text-[12px] text-muted-foreground @sm:grid @sm:items-center ${rowGrid}`}
            >
              <span role="columnheader">Title</span>
              <span role="columnheader">{config?.creatorLabel || 'Creator'}</span>
              {!isJob && <span role="columnheader">Genre</span>}
              <span role="columnheader">Status</span>
              {!isJob && <span role="columnheader">Rating</span>}
              {isJob && <span role="columnheader">{config?.subInfoLabel || 'Info'}</span>}
              <span role="columnheader" className="sr-only">
                Actions
              </span>
            </div>
          </div>

          {/* Rows */}
          <div ref={rowsRef} role="rowgroup" className="min-h-0 flex-1 overflow-y-auto p-1">
            {!hasRows && (
              // The empty message sits in a row/cell so the table keeps valid ARIA children.
              <div role="row" className="flex">
                <div
                  role="cell"
                  className="flex w-full flex-col items-center justify-center gap-3 px-6 py-10 text-center"
                >
                  {search.trim() ? (
                    <>
                      <p className="text-[12px] text-muted-foreground">
                        No items match &ldquo;{search.trim()}&rdquo;.
                      </p>
                      <button type="button" onClick={() => setSearch('')} className="w7-btn">
                        Clear search
                      </button>
                    </>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      {filterStatus
                        ? `No ${label.toLowerCase()} marked “${filterStatus}” yet.`
                        : `No ${label.toLowerCase()} here yet. Use Add ${config?.singular}… to add one.`}
                    </p>
                  )}
                </div>
              </div>
            )}
            {filtered.map((item, index) => {
              const isSelected = item.id === selectedId
              const { prev, next } = getStatusNav(mediaType, item.status)
              return (
                <Motion.div
                  key={item.id}
                  role="row"
                  tabIndex={item.id === tabStopId ? 0 : -1}
                  aria-selected={isSelected}
                  data-vault-row
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => onSelect?.(item)}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget) setFocusedId(item.id)
                  }}
                  onKeyDown={(e) => handleRowKeyDown(e, index, item)}
                  className={`w7-item group cursor-pointer px-2 py-1.5 @sm:grid @sm:items-center ${rowGrid}`}
                >
                  {/* Title: a real button inside the row, so it opens from the keyboard too. */}
                  <div role="cell" className="mb-0.5 min-w-0 @sm:mb-0 @sm:pr-3">
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      tabIndex={-1}
                      className="block w-full min-w-0 truncate text-left font-semibold text-foreground"
                    >
                      {item.title}
                    </button>
                  </div>

                  {/* Creator */}
                  <div
                    role="cell"
                    className="mb-0.5 truncate text-muted-foreground @sm:mb-0 @sm:pr-3"
                  >
                    <span className="mr-1 text-[11px] @sm:hidden">{config?.creatorLabel}:</span>
                    {item.creator !== '—' ? item.creator : ''}
                  </div>

                  {/* Genre */}
                  {!isJob && (
                    <div role="cell" className="mb-0.5 @sm:mb-0">
                      <span className="mr-1 text-[11px] text-muted-foreground @sm:hidden">
                        Genre:
                      </span>
                      {item.genre && <span className="w7-badge">{item.genre}</span>}
                    </div>
                  )}

                  {/* Status: disabled arrows stay visible and greyed (7.css :disabled) */}
                  <div role="cell" className="mb-0.5 flex items-center gap-1 @sm:mb-0">
                    <span className="mr-1 text-[11px] text-muted-foreground @sm:hidden">
                      Status:
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleStatusChange(e, item, prev)}
                      disabled={!prev}
                      className="w7-toolbtn px-1"
                      title={prev ? `Back to ${prev}` : 'No earlier status'}
                      aria-label={prev ? `Back to ${prev}` : 'No earlier status'}
                    >
                      <ChevronLeft size={12} aria-hidden="true" />
                    </button>
                    <span className="w7-badge">{item.status}</span>
                    <button
                      type="button"
                      onClick={(e) => handleStatusChange(e, item, next)}
                      disabled={!next}
                      className="w7-toolbtn px-1"
                      title={next ? `Advance to ${next}` : 'No later status'}
                      aria-label={next ? `Advance to ${next}` : 'No later status'}
                    >
                      <ChevronRight size={12} aria-hidden="true" />
                    </button>
                  </div>

                  {/* Rating */}
                  {!isJob && (
                    <div role="cell" className="mb-0.5 text-[12px] text-[#8a5a00] @sm:mb-0">
                      <span className="mr-1 text-[11px] text-muted-foreground @sm:hidden">
                        Rating:
                      </span>
                      {item.rating != null && item.rating > 0 ? `★ ${item.rating}` : ''}
                    </div>
                  )}

                  {/* Sub-info (job only, occupies the Salary/Location column in the grid) */}
                  {isJob && (
                    <div role="cell" className="mb-0.5 text-muted-foreground @sm:mb-0">
                      <span className="mr-1 text-[11px] @sm:hidden">{config?.subInfoLabel}:</span>
                      {item.sub_info || ''}
                    </div>
                  )}

                  {/* Actions */}
                  <div role="cell" className="flex gap-0.5">
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
              )
            })}
          </div>
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
