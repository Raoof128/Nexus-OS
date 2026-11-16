import { memo, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { MEDIA_CONFIG, TYPE_ICONS, getStatusNav } from '../../../lib/mediaConfig'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'

// Rows drawn at once; a long list grows by 'Show more', like the Kanban columns.
const MAX_ROWS = 50

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
  const [rowLimit, setRowLimit] = useState(MAX_ROWS)
  const [limitScope, setLimitScope] = useState(`${filterStatus}|${search}`)
  const rowsRef = useRef(null)
  // A new filter or search starts again from the first page of rows.
  const scope = `${filterStatus}|${search}`
  if (scope !== limitScope) {
    setLimitScope(scope)
    setRowLimit(MAX_ROWS)
  }

  const config = MEDIA_CONFIG[mediaType]
  const Icon = TYPE_ICONS[mediaType]
  const isJob = mediaType === 'job'
  // Identical tracks and padding for the sticky heading and every row.
  const rowGrid = isJob
    ? '@min-[42rem]:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_10.5rem_minmax(0,1.5fr)_6rem]'
    : '@min-[42rem]:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.25fr)_10.5rem_3.25rem_6rem]'

  const filtered = useMemo(() => {
    let result = items
    if (filterStatus) {
      result = result.filter((item) => item.status === filterStatus)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (item) =>
          (item.title || '').toLowerCase().includes(q) ||
          (item.creator || '').toLowerCase().includes(q) ||
          (item.genre || '').toLowerCase().includes(q),
      )
    }
    return result
  }, [items, filterStatus, search])

  const visible = useMemo(() => filtered.slice(0, rowLimit), [filtered, rowLimit])
  const hiddenCount = filtered.length - visible.length

  // Roving tabindex: one row is in the Tab sequence (the last one focused,
  // else the selected one, else the first). Arrow keys move between rows.
  const tabStopId = visible.some((i) => i.id === focusedId)
    ? focusedId
    : visible.some((i) => i.id === selectedId)
      ? selectedId
      : (visible[0]?.id ?? null)

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
        focusRowAt(Math.min(index + 1, visible.length - 1))
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
        focusRowAt(visible.length - 1)
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
  const hasRows = visible.length > 0

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col p-2 @min-[42rem]:p-3">
      {/* Header */}
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onBack}
          className="w7-toolbtn min-h-6 pointer-coarse:min-h-11"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to overview
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <Icon size={16} className="shrink-0 text-[#3d5a80]" aria-hidden="true" />
          <h2 className="w7-heading wrap-anywhere">
            {filterStatus || 'All'} — {label}
          </h2>
          <span className="w7-badge shrink-0 tabular-nums">{filtered.length}</span>
        </div>

        {/* Search: 7.css search box (type=search draws the magnifier) */}
        <div className="ml-auto w-full @min-[42rem]:max-w-56">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this list"
            aria-label="Search vault"
            className="w-full pointer-coarse:min-h-11"
          />
        </div>
      </div>

      {/* List: a table-style list view (header row + selectable data rows) */}
      <div className="w7-sunken min-h-0 flex-1 overflow-y-auto">
        <div role="table" aria-label={`${label}, ${filterStatus || 'all statuses'}`}>
          {/* Column headings */}
          <div role="rowgroup" className="sticky top-0 z-10">
            <div
              role="row"
              className={`hidden border-b border-border bg-w7-pane px-2.5 py-1.5 text-[12px] text-muted-foreground @min-[42rem]:grid @min-[42rem]:items-center @min-[42rem]:gap-2 ${rowGrid}`}
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
          <div ref={rowsRef} role="rowgroup">
            {!hasRows && (
              // The empty message sits in a row/cell so the table keeps valid ARIA children.
              <div role="row" className="flex">
                <div
                  role="cell"
                  className="flex w-full flex-col items-center justify-center gap-3 px-6 py-10 text-center"
                >
                  {search.trim() ? (
                    <>
                      <p className="wrap-anywhere text-[12px] text-muted-foreground">
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
            {visible.map((item, index) => {
              const isSelected = item.id === selectedId
              const { prev, next } = getStatusNav(mediaType, item.status)
              return (
                <div
                  key={item.id}
                  role="row"
                  tabIndex={item.id === tabStopId ? 0 : -1}
                  aria-selected={isSelected}
                  data-vault-row
                  onClick={() => onSelect?.(item)}
                  onFocus={(e) => {
                    if (e.target === e.currentTarget) setFocusedId(item.id)
                  }}
                  onKeyDown={(e) => handleRowKeyDown(e, index, item)}
                  className={`w7-item cursor-pointer scroll-mt-9 space-y-1 border-b-border px-2 py-1.5 @min-[42rem]:grid @min-[42rem]:items-center @min-[42rem]:gap-2 @min-[42rem]:space-y-0 ${rowGrid}`}
                >
                  {/* Title: a real button inside the row, so it opens from the keyboard too. */}
                  <div role="cell" className="min-w-0">
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      tabIndex={-1}
                      title={item.title}
                      className="block w-full min-w-0 truncate text-left font-semibold text-foreground"
                    >
                      {item.title}
                    </button>
                  </div>

                  {/* Creator */}
                  <div
                    role="cell"
                    title={item.creator}
                    className="min-w-0 truncate text-muted-foreground"
                  >
                    <span className="mr-1 text-[11px] @min-[42rem]:hidden">
                      {config?.creatorLabel}:
                    </span>
                    {item.creator !== '—' ? item.creator : ''}
                  </div>

                  {/* Genre */}
                  {!isJob && (
                    <div role="cell" className="min-w-0">
                      {item.genre && (
                        <span className="w7-badge max-w-full" title={item.genre}>
                          <span className="truncate">{item.genre}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status: disabled arrows stay visible and greyed (7.css :disabled) */}
                  <div role="cell" className="flex min-w-0 flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleStatusChange(e, item, prev)}
                      disabled={!prev}
                      className="w7-toolbtn size-6 shrink-0 p-0 pointer-coarse:size-11"
                      title={prev ? `Back to ${prev}` : 'No earlier status'}
                      aria-label={prev ? `Back to ${prev}` : 'No earlier status'}
                    >
                      <ChevronLeft size={12} aria-hidden="true" />
                    </button>
                    <span className="w7-badge max-w-full wrap-anywhere whitespace-normal">
                      {item.status}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleStatusChange(e, item, next)}
                      disabled={!next}
                      className="w7-toolbtn size-6 shrink-0 p-0 pointer-coarse:size-11"
                      title={next ? `Advance to ${next}` : 'No later status'}
                      aria-label={next ? `Advance to ${next}` : 'No later status'}
                    >
                      <ChevronRight size={12} aria-hidden="true" />
                    </button>
                  </div>

                  {/* Rating */}
                  {!isJob && (
                    <div role="cell" className="text-[12px] text-[#8a5a00]">
                      {item.rating > 0 && (
                        <span aria-label={`Rating: ${item.rating} of 5`}>★ {item.rating}</span>
                      )}
                    </div>
                  )}

                  {/* Sub-info (job only, occupies the Salary/Location column in the grid) */}
                  {isJob && (
                    <div
                      role="cell"
                      className="min-w-0 truncate text-muted-foreground"
                      title={item.sub_info || undefined}
                    >
                      {item.sub_info && (
                        <span className="mr-1 text-[11px] @min-[42rem]:hidden">
                          {config?.subInfoLabel}:
                        </span>
                      )}
                      {item.sub_info || ''}
                    </div>
                  )}

                  {/* Actions */}
                  <div role="cell" className="flex flex-wrap gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit?.(item)
                      }}
                      className="w7-toolbtn size-6 shrink-0 p-0 pointer-coarse:size-11"
                      title="Edit"
                      aria-label="Edit"
                    >
                      <Pencil size={12} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, item)}
                      className="w7-toolbtn w7-toolbtn--danger size-6 shrink-0 p-0 pointer-coarse:size-11"
                      title="Delete"
                      aria-label="Delete"
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
            })}
            {hiddenCount > 0 && (
              // Same row/cell wrapper as the empty state, so the table keeps valid ARIA children.
              <div role="row" className="flex">
                <div role="cell" className="flex w-full justify-center px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setRowLimit((limit) => limit + MAX_ROWS)}
                    className="w7-btn pointer-coarse:min-h-11"
                  >
                    Show {Math.min(hiddenCount, MAX_ROWS)} more
                  </button>
                </div>
              </div>
            )}
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
