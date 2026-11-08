import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFileSystemStore } from '../stores/fileSystemStore'
import { useWindowStore } from '../stores/windowStore'
import { isOpfsSupported, formatBytes } from '../../lib/opfsDrive'
import AddressStrip from './FileManager/AddressStrip'
import CommandBar from './FileManager/CommandBar'
import DeleteDialog from './FileManager/DeleteDialog'
import DetailsPane from './FileManager/DetailsPane'
import EntryList from './FileManager/EntryList'
import FileViewer from './FileManager/FileViewer'
import FlyoutMenu from './FileManager/FlyoutMenu'
import NavPane from './FileManager/NavPane'
import NewEntryRow from './FileManager/NewEntryRow'
import Notice from './FileManager/Notice'
import {
  EMPTY_SELECTION,
  MAX_HISTORY,
  ROOT_LABEL,
  buildEntryPath,
  buildRows,
  filterRows,
  folderTitle,
  nextAvailableName,
  parentPathOf,
  pathChain,
  pathSegments,
  rangeNames,
  sortRows,
  stepHistory,
  validateEntryName,
} from './FileManager/fileManagerUtils'

function isTextField(el) {
  return (
    el instanceof HTMLElement && (el.isContentEditable || el.matches('input, textarea, select'))
  )
}

function EmptyMessage({ children }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <p className="text-muted-foreground">{children}</p>
    </div>
  )
}

export default function FileManagerApp({ windowId }) {
  const files = useFileSystemStore((s) => s.files)
  const currentPath = useFileSystemStore((s) => s.currentPath)
  const navigateTo = useFileSystemStore((s) => s.navigateTo)
  const createFile = useFileSystemStore((s) => s.createFile)
  const createFolder = useFileSystemStore((s) => s.createFolder)
  const deleteEntry = useFileSystemStore((s) => s.deleteEntry)
  const renameEntry = useFileSystemStore((s) => s.renameEntry)
  const importFile = useFileSystemStore((s) => s.importFile)
  const hydrateFileSystem = useFileSystemStore((s) => s.hydrateFileSystem)

  // Back/forward history. Entries are folder paths; `index` is the current one.
  const [nav, setNav] = useState(() => ({ entries: [currentPath], index: 0 }))
  const [expanded, setExpanded] = useState(() => new Set(pathChain(currentPath)))
  const [sel, setSel] = useState(EMPTY_SELECTION)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [creating, setCreating] = useState(null) // 'file' | 'folder' | null
  const [renaming, setRenaming] = useState(null) // entry name being renamed
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null) // { names, rows } | null
  const [menu, setMenu] = useState(null) // FlyoutMenu props | null
  const [viewingFile, setViewingFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(null) // { done, total, name }
  const [importError, setImportError] = useState(null)
  const [formError, setFormError] = useState(null)

  const fileInputRef = useRef(null)
  const listRef = useRef(null)
  const rowRefs = useRef({})
  const renameDoneRef = useRef(false)
  // Name to move focus to after the next render (new, renamed or next-to-delete row).
  const focusAfterRef = useRef(null)
  const opfsAvailable = isOpfsSupported()

  useEffect(() => {
    hydrateFileSystem()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A folder change from anywhere (breadcrumb, tree, back/forward, hydrate) becomes
  // the newest history entry and resets the transient view state. Done during render
  // so there is no extra paint with stale selection.
  let activeNav = nav
  if (nav.entries[nav.index] !== currentPath) {
    const entries = [...nav.entries.slice(0, nav.index + 1), currentPath].slice(-MAX_HISTORY)
    activeNav = { entries, index: entries.length - 1 }
    setNav(activeNav)
    setSel(EMPTY_SELECTION)
    setQuery('')
    setViewingFile(null)
    setRenaming(null)
    setMenu(null)
    setExpanded((prev) => new Set([...prev, ...pathChain(currentPath)]))
  }

  const rawRows = useMemo(() => buildRows(files, currentPath), [files, currentPath])
  const visibleRows = useMemo(
    () => sortRows(filterRows(rawRows, query), sort),
    [rawRows, query, sort],
  )
  const visibleNames = useMemo(() => visibleRows.map((r) => r.name), [visibleRows])
  const cursorName =
    sel.cursor && visibleNames.includes(sel.cursor) ? sel.cursor : (visibleNames[0] ?? null)
  const selectedRows = rawRows.filter((r) => sel.names.includes(r.name))
  const viewer = viewingFile && files[viewingFile] ? files[viewingFile] : null

  const crumbs = pathSegments(currentPath)
  const parentPath = parentPathOf(currentPath)
  const title = folderTitle(currentPath)
  const canBack = stepHistory(activeNav, files, -1) !== null
  const canForward = stepHistory(activeNav, files, 1) !== null

  // Window title follows the folder name ("File Manager" at the root).
  useEffect(() => {
    if (!windowId) return
    useWindowStore.getState().setWindowTitle?.(windowId, title)
  }, [windowId, title])

  // Move focus to the row named in focusAfterRef, once it has rendered.
  useEffect(() => {
    const name = focusAfterRef.current
    if (!name) return
    focusAfterRef.current = null
    rowRefs.current[name]?.focus()
  })

  const setRowRef = useCallback((name, el) => {
    if (el) rowRefs.current[name] = el
    else delete rowRefs.current[name]
  }, [])

  // ── Navigation ──────────────────────────────────────────────────────────────

  const navigate = (path) => navigateTo(path)

  const goBack = () => {
    const i = stepHistory(activeNav, files, -1)
    if (i === null) return
    setNav({ ...activeNav, index: i })
    navigateTo(activeNav.entries[i])
  }

  const goForward = () => {
    const i = stepHistory(activeNav, files, 1)
    if (i === null) return
    setNav({ ...activeNav, index: i })
    navigateTo(activeNav.entries[i])
  }

  const goUp = () => {
    if (parentPath) navigateTo(parentPath)
  }

  const goHome = () => navigateTo('/')

  const toggleExpanded = (path) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  // ── Selection ───────────────────────────────────────────────────────────────

  const selectOnly = (name) => setSel({ names: [name], cursor: name, anchor: name })

  const selectAll = () => {
    if (visibleNames.length === 0) return
    setSel({
      names: visibleNames,
      cursor: cursorName ?? visibleNames[0],
      anchor: visibleNames[0],
    })
  }

  const handleRowClick = (name, e) => {
    if (e.ctrlKey || e.metaKey) {
      setSel((s) => ({
        names: s.names.includes(name) ? s.names.filter((n) => n !== name) : [...s.names, name],
        cursor: name,
        anchor: name,
      }))
    } else if (e.shiftKey && sel.anchor) {
      setSel({
        names: rangeNames(visibleNames, sel.anchor, name),
        cursor: name,
        anchor: sel.anchor,
      })
    } else {
      selectOnly(name)
    }
  }

  // Keyboard cursor movement. Plain arrows replace the selection, Shift extends it
  // from the anchor, and Ctrl moves focus without changing the selection.
  const moveCursor = (target, { extend = false, keepSelection = false } = {}) => {
    if (!target) return
    setSel((s) => {
      if (keepSelection) return { ...s, cursor: target }
      if (extend && s.anchor) {
        return {
          names: rangeNames(visibleNames, s.anchor, target),
          cursor: target,
          anchor: s.anchor,
        }
      }
      return { names: [target], cursor: target, anchor: target }
    })
    rowRefs.current[target]?.focus()
  }

  // Typing in the search box hides rows. Selected rows that get hidden are dropped, so
  // Delete and the menus only ever act on what the user can see.
  const handleQueryChange = (value) => {
    const shown = new Set(filterRows(rawRows, value).map((r) => r.name))
    setQuery(value)
    setSel((s) => ({
      names: s.names.filter((n) => shown.has(n)),
      cursor: shown.has(s.cursor) ? s.cursor : null,
      anchor: shown.has(s.anchor) ? s.anchor : null,
    }))
  }

  // A new or renamed item that the search box hides would look like nothing happened,
  // so the search clears in that case.
  const revealName = (name) => {
    if (query.trim() && filterRows([{ name }], query).length === 0) handleQueryChange('')
  }

  // The menu closes before its action runs, which would drop focus to the page.
  // Select all hands focus back to the list so arrow keys keep working.
  const selectAllFromMenu = () => {
    focusAfterRef.current = cursorName ?? visibleNames[0] ?? null
    selectAll()
  }

  const handleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )

  // ── Opening ─────────────────────────────────────────────────────────────────

  // Folders navigate. Files open in a preview pane beside the list, so the
  // folder contents stay on screen.
  const openEntry = (name) => {
    const path = buildEntryPath(currentPath, name)
    const entry = files[path]
    if (!entry) return
    if (entry.type === 'folder') {
      navigateTo(path)
    } else {
      selectOnly(name)
      setViewingFile(path)
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  const newEntryName =
    creating === 'file'
      ? nextAvailableName(
          'New Text Document',
          '.txt',
          rawRows.map((r) => r.name),
        )
      : creating === 'folder'
        ? nextAvailableName(
            'New folder',
            '',
            rawRows.map((r) => r.name),
          )
        : ''

  const startCreate = (type) => {
    setFormError(null)
    setCreating(type)
  }

  const cancelCreate = () => {
    setCreating(null)
    setFormError(null)
    focusAfterRef.current = cursorName
  }

  // Returns an error message to show in the row, or null when created.
  const handleCreate = (raw) => {
    const { name, error } = validateEntryName(
      raw,
      rawRows.map((r) => r.name),
    )
    if (error) return error
    if (creating === 'file') createFile(currentPath, name, '')
    else createFolder(currentPath, name)
    setCreating(null)
    setFormError(null)
    revealName(name)
    selectOnly(name)
    focusAfterRef.current = name
    return null
  }

  // ── Rename ──────────────────────────────────────────────────────────────────

  const startRename = (name) => {
    renameDoneRef.current = false
    setFormError(null)
    setRenaming(name)
    setRenameValue(name)
  }

  // Enter keeps the field open on an invalid name so it can be fixed. Blur (the
  // user clicked away) cancels an invalid rename, because the field is going away.
  const finishRename = (value, fromBlur) => {
    if (renaming === null || renameDoneRef.current) return
    const { name, error } = validateEntryName(
      value,
      rawRows.map((r) => r.name),
      renaming,
    )
    if (error) {
      setFormError(error)
      if (fromBlur) {
        renameDoneRef.current = true
        setRenaming(null)
        focusAfterRef.current = renaming
      }
      return
    }
    renameDoneRef.current = true
    const oldName = renaming
    setRenaming(null)
    setFormError(null)
    if (name !== oldName) {
      renameEntry(currentPath, oldName, name)
      revealName(name)
      selectOnly(name)
    }
    focusAfterRef.current = name
  }

  const cancelRename = () => {
    renameDoneRef.current = true
    focusAfterRef.current = renaming
    setRenaming(null)
    setFormError(null)
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  const requestDelete = (names) => {
    if (names.length === 0) return
    setDeleteTarget({ names, rows: rawRows.filter((r) => names.includes(r.name)) })
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    const { names } = deleteTarget
    const remaining = visibleNames.filter((n) => !names.includes(n))
    for (const name of names) deleteEntry(currentPath, name)
    setDeleteTarget(null)
    setSel(EMPTY_SELECTION)
    focusAfterRef.current = remaining[0] ?? null
  }

  const cancelDelete = () => {
    setDeleteTarget(null)
    focusAfterRef.current = cursorName
  }

  const deleteDialog = (() => {
    if (!deleteTarget) return { title: '', message: '' }
    const { rows } = deleteTarget
    const note = " This can't be undone."
    if (rows.length === 1) {
      const [row] = rows
      if (row.isFolder) {
        return {
          title: 'Delete Folder',
          message: `Are you sure you want to delete the folder “${row.name}” and all of its contents?${note}`,
        }
      }
      return {
        title: 'Delete File',
        message: `Are you sure you want to delete “${row.name}”?${note}`,
      }
    }
    const anyFolder = rows.some((r) => r.isFolder)
    return {
      title: 'Delete Multiple Items',
      message: `Are you sure you want to delete these ${deleteTarget.names.length} items?${
        anyFolder ? ' Folders are deleted with everything inside them.' : ''
      }${note}`,
    }
  })()

  // ── Import ──────────────────────────────────────────────────────────────────

  // Import is one picker at a time: the menus and the command bar share this guard.
  const openImportPicker = () => {
    if (!importing) fileInputRef.current?.click()
  }

  const handleImport = async (e) => {
    const picked = Array.from(e.target.files || [])
    // Reset the input value so picking the same file again re-fires onChange.
    e.target.value = ''
    if (picked.length === 0) return
    setImporting(true)
    setImportError(null)
    let failed = 0
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i]
      setImportProgress({ done: i, total: picked.length, name: file.name })
      const path = await importFile(currentPath, file)
      if (!path) failed++
    }
    setImportProgress(null)
    setImporting(false)
    if (failed > 0) {
      setImportError(
        opfsAvailable
          ? `${failed} file${failed !== 1 ? 's' : ''} could not be imported. Check that ${failed !== 1 ? 'they are' : 'it is'} under the size limit and not in use, then try again.`
          : 'File import needs OPFS, which this browser does not support.',
      )
    }
  }

  // ── Menus ───────────────────────────────────────────────────────────────────

  const closeMenu = useCallback(() => setMenu(null), [])

  const runMenuItem = (item) => {
    setMenu(null)
    item.onSelect?.()
  }

  const organizeItems = () => {
    const count = sel.names.length
    const first = sel.names[0]
    return [
      {
        id: 'rename',
        label: 'Rename',
        shortcut: 'F2',
        disabled: count !== 1,
        onSelect: () => startRename(first),
      },
      {
        id: 'delete',
        label: 'Delete',
        shortcut: 'Delete',
        danger: true,
        disabled: count === 0,
        onSelect: () => requestDelete(sel.names),
      },
      { separator: true },
      { id: 'select-all', label: 'Select all', shortcut: 'Ctrl+A', onSelect: selectAllFromMenu },
      { separator: true },
      { id: 'new-folder', label: 'New folder', onSelect: () => startCreate('folder') },
      { id: 'new-file', label: 'New file', onSelect: () => startCreate('file') },
      ...(opfsAvailable
        ? [
            {
              id: 'import',
              label: 'Import files…',
              disabled: importing,
              onSelect: openImportPicker,
            },
          ]
        : []),
    ]
  }

  const entryItems = (names) => [
    {
      id: 'open',
      label: 'Open',
      shortcut: 'Enter',
      disabled: names.length !== 1,
      onSelect: () => openEntry(names[0]),
    },
    { separator: true },
    {
      id: 'rename',
      label: 'Rename',
      shortcut: 'F2',
      disabled: names.length !== 1,
      onSelect: () => startRename(names[0]),
    },
    {
      id: 'delete',
      label: 'Delete',
      shortcut: 'Delete',
      danger: true,
      onSelect: () => requestDelete(names),
    },
  ]

  const backgroundItems = () => [
    { id: 'new-folder', label: 'New folder', onSelect: () => startCreate('folder') },
    { id: 'new-file', label: 'New file', onSelect: () => startCreate('file') },
    ...(opfsAvailable
      ? [
          {
            id: 'import',
            label: 'Import files…',
            disabled: importing,
            onSelect: openImportPicker,
          },
        ]
      : []),
    { separator: true },
    { id: 'select-all', label: 'Select all', shortcut: 'Ctrl+A', onSelect: selectAllFromMenu },
  ]

  const openOrganize = (button) => {
    if (menu?.label === 'Organize') {
      setMenu(null)
      return
    }
    const rect = button.getBoundingClientRect()
    setMenu({
      label: 'Organize',
      x: rect.left,
      y: rect.bottom + 2,
      anchorEl: button,
      items: organizeItems(),
    })
  }

  const openEntryMenu = (name, x, y) => {
    const names = sel.names.includes(name) ? sel.names : [name]
    if (!sel.names.includes(name)) selectOnly(name)
    setMenu({ label: 'Item menu', x, y, anchorEl: null, items: entryItems(names) })
  }

  const openBackgroundMenu = (x, y) =>
    setMenu({ label: 'Folder menu', x, y, anchorEl: null, items: backgroundItems() })

  // ── Keyboard ────────────────────────────────────────────────────────────────

  // Explorer model. Alt+Left/Right/Up and Backspace work from anywhere in the window.
  // Arrows, Home/End, Enter, Delete, F2 and Ctrl+A apply when focus is in the list.
  // Backspace goes back, as in Windows 7; Alt+Up goes up a level.
  const handleKeyDown = (e) => {
    const target = e.target
    if (target.closest?.('[role="menu"],[role="alertdialog"],[role="dialog"]')) return
    if (isTextField(target)) return

    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goBack()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        goUp()
      }
      return
    }

    if (e.key === 'Backspace') {
      e.preventDefault()
      goBack()
      return
    }

    if (!listRef.current?.contains(target)) return
    const ctrl = e.ctrlKey || e.metaKey

    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const rect = target.getBoundingClientRect()
      if (cursorName) openEntryMenu(cursorName, rect.left + 8, rect.bottom)
      return
    }

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault()
        const idx = visibleNames.indexOf(cursorName)
        const last = visibleNames.length - 1
        const next =
          e.key === 'ArrowDown'
            ? Math.min(idx < 0 ? 0 : idx + 1, last)
            : Math.max(idx < 0 ? last : idx - 1, 0)
        moveCursor(visibleNames[next], { extend: e.shiftKey, keepSelection: ctrl })
        break
      }
      case 'Home':
      case 'End': {
        e.preventDefault()
        const edge = e.key === 'Home' ? visibleNames[0] : visibleNames[visibleNames.length - 1]
        moveCursor(edge, { extend: e.shiftKey, keepSelection: ctrl })
        break
      }
      case 'Enter':
        e.preventDefault()
        if (cursorName) openEntry(cursorName)
        break
      case 'Delete':
        e.preventDefault()
        requestDelete(sel.names)
        break
      case 'F2':
        e.preventDefault()
        if (sel.names.length === 1) startRename(sel.names[0])
        break
      default:
        if (ctrl && (e.key === 'a' || e.key === 'A')) {
          e.preventDefault()
          selectAll()
        }
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const selectedSize = selectedRows.reduce((sum, r) => sum + (r.size ?? 0), 0)
  const single = selectedRows.length === 1 ? selectedRows[0] : null
  const singleLabel = single
    ? [single.name, single.type, single.size != null ? formatBytes(single.size) : null]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-white text-[12px] text-foreground"
      onKeyDown={handleKeyDown}
    >
      <AddressStrip
        crumbs={crumbs}
        folderLabel={currentPath === '/' ? ROOT_LABEL : title}
        parentPath={parentPath}
        canBack={canBack}
        canForward={canForward}
        onBack={goBack}
        onForward={goForward}
        onUp={goUp}
        onHome={goHome}
        onNavigate={navigate}
        isRoot={currentPath === '/'}
        query={query}
        onQueryChange={handleQueryChange}
      />

      <CommandBar
        organizeOpen={menu?.label === 'Organize'}
        onOrganize={openOrganize}
        onNewFolder={() => startCreate('folder')}
        onNewFile={() => startCreate('file')}
        showImport={opfsAvailable}
        importing={importing}
        onImport={openImportPicker}
        fileInputRef={fileInputRef}
        onFileChange={handleImport}
      />

      <div className="relative flex min-h-0 flex-1">
        <NavPane
          files={files}
          currentPath={currentPath}
          expanded={expanded}
          onToggle={toggleExpanded}
          onNavigate={navigate}
        />

        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          onContextMenu={(e) => {
            // Text fields (new-item and rename) keep the native menu for cut and paste.
            if (isTextField(e.target)) return
            e.preventDefault()
            openBackgroundMenu(e.clientX, e.clientY)
          }}
        >
          {formError && <Notice onDismiss={() => setFormError(null)}>{formError}</Notice>}
          {importError && <Notice onDismiss={() => setImportError(null)}>{importError}</Notice>}

          {creating && (
            <div className="shrink-0 p-2 pb-0">
              <NewEntryRow
                key={creating}
                type={creating}
                initialName={newEntryName}
                onCreate={handleCreate}
                onCancel={cancelCreate}
              />
            </div>
          )}

          {rawRows.length === 0 ? (
            !creating && <EmptyMessage>This folder is empty.</EmptyMessage>
          ) : visibleRows.length === 0 ? (
            <EmptyMessage>No items match your search.</EmptyMessage>
          ) : (
            <EntryList
              containerRef={listRef}
              rows={visibleRows}
              selection={sel.names}
              cursor={cursorName}
              sort={sort}
              onSort={handleSort}
              onRowClick={handleRowClick}
              onRowOpen={openEntry}
              onRowMenu={openEntryMenu}
              setRowRef={setRowRef}
              renaming={renaming}
              renameValue={renameValue}
              renameInvalid={renaming !== null && formError !== null}
              onRenameChange={setRenameValue}
              onRenameCommit={() => finishRename(renameValue, false)}
              onRenameCancel={cancelRename}
              onRenameBlur={() => finishRename(renameValue, true)}
            />
          )}
        </div>

        {viewer && (
          <aside
            aria-label={`Preview of ${viewer.name}`}
            className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l border-[#a0afc3] bg-white @md:static @md:w-[46%] @md:min-w-[260px]"
          >
            <FileViewer key={viewingFile} file={viewer} onClose={() => setViewingFile(null)} />
          </aside>
        )}
      </div>

      <DetailsPane
        itemCount={visibleRows.length}
        selected={selectedRows}
        selectedSize={selectedSize}
        singleLabel={singleLabel}
        importProgress={importProgress}
      />

      <DeleteDialog
        open={deleteTarget !== null}
        title={deleteDialog.title}
        message={deleteDialog.message}
        onYes={confirmDelete}
        onNo={cancelDelete}
      />

      {menu && (
        <FlyoutMenu
          label={menu.label}
          x={menu.x}
          y={menu.y}
          items={menu.items}
          anchorEl={menu.anchorEl}
          onSelect={runMenuItem}
          onDismiss={closeMenu}
        />
      )}
    </div>
  )
}
