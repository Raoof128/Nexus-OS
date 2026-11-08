import { useEffect, useRef } from 'react'
import { File, Folder } from 'lucide-react'
import NameInput from './NameInput'
import { formatBytes } from '../../../lib/opfsDrive'
import { baseNameLength, formatModified } from './fileManagerUtils'

const FOLDER_ICON_CLASS = 'shrink-0 text-[#e0a526]'
const FOLDER_ICON_FILL = '#ffd96b'
const FILE_ICON_CLASS = 'shrink-0 text-[#3d5a80]'
const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP_PX = 10

// Column header: a button inside the th, so it is keyboard reachable. The 7.css
// `indicator` triangle shows the active column; `up` marks ascending order.
function SortHeader({ label, sortKey, sort, onSort, className = '' }) {
  const active = sort.key === sortKey
  const ascending = active && sort.dir === 'asc'
  const ariaSort = active ? (ascending ? 'ascending' : 'descending') : 'none'
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`font-normal ${className} ${
        active ? `highlighted indicator${ascending ? ' up' : ''} before:right-2` : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="block h-full w-full min-w-0 truncate pr-3 text-left pointer-coarse:min-h-11"
      >
        {label}
      </button>
    </th>
  )
}

export default function EntryList({
  containerRef,
  rows,
  selection,
  cursor,
  sort,
  onSort,
  onRowClick,
  onRowOpen,
  onRowMenu,
  setRowRef,
  renaming,
  renameValue,
  renameInvalid,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onRenameBlur,
}) {
  const pressTimer = useRef(null)
  const pressOrigin = useRef(null)
  const suppressClick = useRef(false)
  // Type of the last pointer press. Click events do not report it reliably across
  // browsers (Safari sends a plain MouseEvent), so the press records it instead.
  const pointerTypeRef = useRef(null)

  useEffect(() => () => clearTimeout(pressTimer.current), [])

  const cancelPress = () => {
    clearTimeout(pressTimer.current)
    pressTimer.current = null
    pressOrigin.current = null
  }

  // Touch has no right-click, so a long press opens the same menu as right-click.
  // A long press on the name being renamed is left to the text field.
  const startPress = (name, e) => {
    if (e.pointerType !== 'touch' || name === renaming) return
    suppressClick.current = false
    pressOrigin.current = { x: e.clientX, y: e.clientY }
    clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true
      pressTimer.current = null
      onRowMenu(name, pressOrigin.current?.x ?? 0, pressOrigin.current?.y ?? 0)
    }, LONG_PRESS_MS)
  }

  const movePress = (e) => {
    const origin = pressOrigin.current
    if (!origin) return
    if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > LONG_PRESS_SLOP_PX) cancelPress()
  }

  return (
    <div ref={containerRef} className="w7-sunken m-2 mb-0 min-h-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead className="sticky top-0">
          <tr>
            <SortHeader
              label="Name"
              sortKey="name"
              sort={sort}
              onSort={onSort}
              className="text-left"
            />
            <SortHeader
              label="Date modified"
              sortKey="modified"
              sort={sort}
              onSort={onSort}
              className="hidden text-left @md:table-cell"
            />
            <SortHeader
              label="Type"
              sortKey="type"
              sort={sort}
              onSort={onSort}
              className="hidden text-left @md:table-cell"
            />
            <SortHeader
              label="Size"
              sortKey="size"
              sort={sort}
              onSort={onSort}
              className="hidden text-right @md:table-cell"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { name, isFolder } = row
            const isSelected = selection.includes(name)
            const isRenaming = renaming === name
            const Icon = isFolder ? Folder : File
            const isTabStop = name === cursor
            return (
              <tr
                key={name}
                className={isSelected ? 'highlighted' : undefined}
                aria-selected={isSelected}
                onContextMenu={(e) => {
                  // Keep the native menu (cut, copy, paste) inside the rename field.
                  if (isRenaming) return
                  e.preventDefault()
                  e.stopPropagation()
                  cancelPress()
                  onRowMenu(name, e.clientX, e.clientY)
                }}
                onPointerDown={(e) => {
                  pointerTypeRef.current = e.pointerType
                  startPress(name, e)
                }}
                onPointerMove={movePress}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
              >
                <td className="min-w-0">
                  {isRenaming ? (
                    <div className="flex items-center gap-2">
                      <Icon
                        size={16}
                        aria-hidden="true"
                        className={isFolder ? FOLDER_ICON_CLASS : FILE_ICON_CLASS}
                        fill={isFolder ? FOLDER_ICON_FILL : 'none'}
                      />
                      <NameInput
                        label={`Rename ${name}`}
                        value={renameValue}
                        selectLength={baseNameLength(name, isFolder)}
                        invalid={renameInvalid}
                        onChange={onRenameChange}
                        onEnter={onRenameCommit}
                        onEscape={onRenameCancel}
                        onBlur={onRenameBlur}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      ref={(el) => setRowRef(name, el)}
                      tabIndex={isTabStop ? 0 : -1}
                      onClick={(e) => {
                        if (suppressClick.current) {
                          suppressClick.current = false
                          pointerTypeRef.current = null
                          return
                        }
                        onRowClick(name, e)
                        // Touch has no double-click, so a tap opens there.
                        if (pointerTypeRef.current === 'touch') {
                          pointerTypeRef.current = null
                          onRowOpen(name)
                        }
                      }}
                      onDoubleClick={() => onRowOpen(name)}
                      aria-label={`${name}, ${isFolder ? 'folder' : 'file'}`}
                      className="flex w-full min-w-0 items-center gap-2 py-0.5 text-left pointer-coarse:min-h-11"
                    >
                      <Icon
                        size={16}
                        aria-hidden="true"
                        className={isFolder ? FOLDER_ICON_CLASS : FILE_ICON_CLASS}
                        fill={isFolder ? FOLDER_ICON_FILL : 'none'}
                      />
                      <span className="truncate">{name}</span>
                    </button>
                  )}
                </td>
                <td className="hidden whitespace-nowrap text-muted-foreground @md:table-cell">
                  {formatModified(row.modified)}
                </td>
                <td className="hidden whitespace-nowrap text-muted-foreground @md:table-cell">
                  {row.type}
                </td>
                <td className="hidden text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground @md:table-cell">
                  {row.size != null ? formatBytes(row.size) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
