import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Download,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useFileSystemStore } from '../stores/fileSystemStore'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import {
  readBlob,
  estimateStorage,
  isOpfsSupported,
  isTextMime,
  formatBytes,
} from '../../lib/opfsDrive'

// Explorer icon colours: folders are manila-yellow, files are slate blue.
const FOLDER_ICON_CLASS = 'shrink-0 text-[#e0a526]'
const FOLDER_ICON_FILL = '#ffd96b'
const FILE_ICON_CLASS = 'shrink-0 text-[#3d5a80]'

function typeLabel(name, isFolder) {
  if (isFolder) return 'File folder'
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(dot + 1).toUpperCase()} file` : 'File'
}

function NewEntryDialog({ type, onSubmit, onCancel }) {
  const [name, setName] = useState('')
  const label = type === 'file' ? 'File name' : 'Folder name'

  return (
    <div className="flex items-center gap-2 border border-[#99d1ff] bg-w7-select px-2 py-1">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSubmit(name.trim())
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={label}
        aria-label={label}
        autoFocus
        className="min-w-0 flex-1"
      />
      <button
        type="button"
        onClick={() => name.trim() && onSubmit(name.trim())}
        aria-label={type === 'file' ? 'Create file' : 'Create folder'}
        title="Create"
        className="w7-toolbtn"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel"
        title="Cancel"
        className="w7-toolbtn"
      >
        <X size={14} />
      </button>
    </div>
  )
}

function FileViewer({ file, onClose }) {
  // Two kinds of file:
  //   - inline text files created in-app (have `content`, no `blobId`)
  //   - imported files backed by an OPFS blob (have `blobId`)
  const isBlob = Boolean(file.blobId)
  const [state, setState] = useState(() =>
    isBlob ? { status: 'loading' } : { status: 'text', text: file.content || '' },
  )
  // Track object URLs so we can revoke them and avoid leaks.
  const urlRef = useRef(null)

  // FileViewer is remounted per file (keyed on path by the parent), so the
  // useState initializer above already seeds 'loading' for blob files — no
  // synchronous setState reset needed here.
  useEffect(() => {
    if (!isBlob) return
    let cancelled = false
    readBlob(file.blobId).then((blob) => {
      if (cancelled) return
      if (!blob) {
        setState({ status: 'missing' })
        return
      }
      if (isTextMime(file.mime) && blob.size < 512 * 1024) {
        blob.text().then((text) => {
          if (!cancelled) setState({ status: 'text', text })
        })
      } else {
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        setState({ status: 'binary', url })
      }
    })
    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [isBlob, file.blobId, file.mime])

  const download = useCallback(() => {
    readBlob(file.blobId).then((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      URL.revokeObjectURL(url)
    })
  }, [file.blobId, file.name])

  const isImage = (file.mime || '').startsWith('image/')

  return (
    <div className="flex h-full flex-col bg-white text-[12px] text-foreground">
      <div className="w7-commandbar justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <File size={16} className={FILE_ICON_CLASS} />
          <span className="truncate font-semibold">{file.name}</span>
          {file.size != null && (
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {formatBytes(file.size)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {isBlob && (
            <button
              type="button"
              onClick={download}
              className="w7-toolbtn"
              aria-label="Download file"
              title="Download"
            >
              <Download size={14} />
              <span>Download</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close file viewer"
            title="Close"
            className="w7-toolbtn"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          <span className="sr-only" role="status">
            Loading…
          </span>
        </div>
      )}

      {state.status === 'missing' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <File size={32} className={FILE_ICON_CLASS} />
          <p className="w7-error">This file can't be opened.</p>
          <p className="text-muted-foreground">
            Its stored data is missing, or the browser's storage was cleared.
          </p>
        </div>
      )}

      {state.status === 'text' && (
        <pre className="w7-sunken m-2 flex-1 overflow-auto p-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-foreground">
          {state.text || '(empty file)'}
        </pre>
      )}

      {state.status === 'binary' &&
        (isImage ? (
          <div className="flex flex-1 items-center justify-center overflow-auto bg-muted p-4">
            <img src={state.url} alt={file.name} className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <File size={32} className={FILE_ICON_CLASS} />
            <p className="text-muted-foreground">No preview is available for this file type.</p>
            <button type="button" onClick={download} className="w7-btn">
              <Download size={14} /> Download {file.name}
            </button>
          </div>
        ))}
    </div>
  )
}

function StorageMeter() {
  const [info, setInfo] = useState(null)
  // The dependency is the whole file map so the meter refreshes when files
  // are imported/removed. estimateStorage() is cheap and best-effort.
  const files = useFileSystemStore((s) => s.files)

  useEffect(() => {
    let cancelled = false
    estimateStorage().then((est) => {
      if (!cancelled) setInfo(est)
    })
    return () => {
      cancelled = true
    }
  }, [files])

  if (!info || !info.quota) return null
  const pct = Math.min(100, Math.round((info.usage / info.quota) * 100))
  return (
    <div
      className="flex items-center gap-2"
      title={`${formatBytes(info.usage)} of ${formatBytes(info.quota)} used`}
    >
      <HardDrive size={14} className="text-muted-foreground" />
      <div role="progressbar" aria-label="Storage used" aria-valuenow={pct} className="w-24">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">{formatBytes(info.usage)}</span>
    </div>
  )
}

export default function FileManagerApp() {
  const files = useFileSystemStore((s) => s.files)
  const currentPath = useFileSystemStore((s) => s.currentPath)
  const navigateTo = useFileSystemStore((s) => s.navigateTo)
  const createFile = useFileSystemStore((s) => s.createFile)
  const createFolder = useFileSystemStore((s) => s.createFolder)
  const deleteEntry = useFileSystemStore((s) => s.deleteEntry)
  const renameEntry = useFileSystemStore((s) => s.renameEntry)
  const importFile = useFileSystemStore((s) => s.importFile)
  const hydrateFileSystem = useFileSystemStore((s) => s.hydrateFileSystem)

  const [creating, setCreating] = useState(null) // 'file' | 'folder' | null
  const [viewingFile, setViewingFile] = useState(null)
  const [selectedName, setSelectedName] = useState(null)
  const [renamingEntry, setRenamingEntry] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null) // { name, isFolder } | null
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const fileInputRef = useRef(null)
  const opfsAvailable = isOpfsSupported()

  useEffect(() => {
    hydrateFileSystem()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentFolder = files[currentPath]
  const children = currentFolder?.children || []

  const parentPath =
    currentPath === '/' ? null : currentPath.split('/').slice(0, -1).join('/') || '/'

  // Breadcrumb segments: '/documents/sub' -> ['documents', 'sub'].
  const crumbs = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean)

  // Any navigation clears the row selection, since the list changes under it.
  const goTo = useCallback(
    (path) => {
      setSelectedName(null)
      navigateTo(path)
    },
    [navigateTo],
  )

  const handleCreate = useCallback(
    (name) => {
      if (creating === 'file') {
        createFile(currentPath, name, '')
      } else {
        createFolder(currentPath, name)
      }
      setCreating(null)
    },
    [creating, currentPath, createFile, createFolder],
  )

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteEntry(currentPath, deleteTarget.name)
      setDeleteTarget(null)
    }
  }, [currentPath, deleteEntry, deleteTarget])

  const handleRenameStart = useCallback((name) => {
    setRenamingEntry(name)
    setRenameValue(name)
  }, [])

  const handleRenameSubmit = useCallback(() => {
    if (renameValue.trim() && renameValue !== renamingEntry) {
      renameEntry(currentPath, renamingEntry, renameValue.trim())
    }
    setRenamingEntry(null)
  }, [currentPath, renamingEntry, renameValue, renameEntry])

  const buildEntryPath = (name) => (currentPath === '/' ? `/${name}` : `${currentPath}/${name}`)

  // Open a folder (navigate) or a file (viewer), as Explorer's double-click does.
  const openEntry = (name) => {
    const entryPath = buildEntryPath(name)
    const entry = files[entryPath]
    if (!entry) return
    if (entry.type === 'folder') goTo(entryPath)
    else {
      setSelectedName(name)
      setViewingFile(entryPath)
    }
  }

  const handleImport = useCallback(
    async (e) => {
      const picked = Array.from(e.target.files || [])
      // Reset the input value so picking the same file again re-fires onChange.
      e.target.value = ''
      if (picked.length === 0) return
      setImporting(true)
      setImportError(null)
      let failed = 0
      for (const file of picked) {
        const path = await importFile(currentPath, file)
        if (!path) failed++
      }
      setImporting(false)
      if (failed > 0) {
        setImportError(
          opfsAvailable
            ? `Failed to import ${failed} file${failed !== 1 ? 's' : ''}.`
            : 'File import needs OPFS, which this browser does not support.',
        )
      }
    },
    [currentPath, importFile, opfsAvailable],
  )

  useEffect(() => {
    if (viewingFile && !files[viewingFile]) {
      setViewingFile(null)
    }
  }, [viewingFile, files])

  if (viewingFile && files[viewingFile]) {
    return (
      <FileViewer
        key={viewingFile}
        file={files[viewingFile]}
        onClose={() => setViewingFile(null)}
      />
    )
  }

  const selectedEntry = selectedName ? files[buildEntryPath(selectedName)] : null

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white text-[12px] text-foreground">
      {/* Address strip: back / home and a breadcrumb path */}
      <div className="flex shrink-0 items-center gap-1 border-b border-[#a0afc3] bg-w7-pane px-1.5 py-1">
        {parentPath !== null && (
          <button
            type="button"
            onClick={() => goTo(parentPath)}
            className="w7-toolbtn"
            aria-label="Go up"
            title="Up"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => goTo('/')}
          className="w7-toolbtn"
          aria-label="Go home"
          title="Nexus Drive"
        >
          <Home size={16} />
        </button>
        <nav
          aria-label="Current folder"
          className="w7-sunken flex min-h-[23px] min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 py-px"
        >
          <button
            type="button"
            onClick={() => goTo('/')}
            aria-current={currentPath === '/' ? 'page' : undefined}
            className="shrink-0 rounded-[2px] px-1 text-foreground hover:bg-w7-hover"
          >
            Nexus Drive
          </button>
          {crumbs.map((segment, i) => {
            const path = `/${crumbs.slice(0, i + 1).join('/')}`
            const isLast = i === crumbs.length - 1
            return (
              <span key={path} className="flex shrink-0 items-center gap-0.5">
                <ChevronRight size={12} className="text-muted-foreground" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => goTo(path)}
                  aria-current={isLast ? 'page' : undefined}
                  className="rounded-[2px] px-1 text-foreground hover:bg-w7-hover"
                >
                  {segment}
                </button>
              </span>
            )
          })}
        </nav>
      </div>

      {/* Command bar */}
      <div className="w7-commandbar shrink-0">
        <button
          type="button"
          onClick={() => setCreating('folder')}
          className="w7-toolbtn"
          aria-label="New folder"
          title="New folder"
        >
          <FolderPlus size={16} className="text-[#e0a526]" fill={FOLDER_ICON_FILL} />
          <span>New folder</span>
        </button>
        <button
          type="button"
          onClick={() => setCreating('file')}
          className="w7-toolbtn"
          aria-label="New file"
          title="New file"
        >
          <FilePlus size={16} className={FILE_ICON_CLASS} />
          <span>New file</span>
        </button>
        {opfsAvailable && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="w7-toolbtn"
            aria-label="Import files from disk"
            title="Import from disk"
          >
            {importing ? (
              <Loader2 size={16} className="animate-spin text-primary" />
            ) : (
              <Upload size={16} className="text-primary" />
            )}
            <span>Import</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleImport}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {/* Main list */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {creating && (
          <div className="shrink-0 p-2 pb-0">
            <NewEntryDialog
              type={creating}
              onSubmit={handleCreate}
              onCancel={() => setCreating(null)}
            />
          </div>
        )}

        {importError && (
          <div className="w7-infobar m-2 mb-0 justify-between" role="alert">
            <span className="w7-error">{importError}</span>
            <button
              type="button"
              onClick={() => setImportError(null)}
              className="w7-toolbtn"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {children.length === 0 && !creating ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="text-muted-foreground">This folder is empty.</p>
          </div>
        ) : (
          children.length > 0 && (
            <div className="w7-sunken m-2 mb-0 min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead className="sticky top-0">
                  <tr>
                    <th scope="col" className="text-left font-normal">
                      Name
                    </th>
                    <th scope="col" className="hidden text-left font-normal @md:table-cell">
                      Date modified
                    </th>
                    <th scope="col" className="hidden text-left font-normal @md:table-cell">
                      Type
                    </th>
                    <th scope="col" className="hidden text-right font-normal @md:table-cell">
                      Size
                    </th>
                    <th scope="col" className="w-[60px]">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((name) => {
                    const entryPath = buildEntryPath(name)
                    const entry = files[entryPath]
                    if (!entry) return null

                    const isFolder = entry.type === 'folder'
                    const Icon = isFolder ? Folder : File
                    const isSelected = selectedName === name

                    return (
                      <tr
                        key={name}
                        className={`group ${isSelected ? 'highlighted' : ''}`}
                        aria-selected={isSelected}
                      >
                        <td className="min-w-0">
                          {renamingEntry === name ? (
                            <div className="flex items-center gap-2">
                              <Icon
                                size={16}
                                className={isFolder ? FOLDER_ICON_CLASS : FILE_ICON_CLASS}
                                fill={isFolder ? FOLDER_ICON_FILL : 'none'}
                              />
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameSubmit()
                                  if (e.key === 'Escape') setRenamingEntry(null)
                                }}
                                onBlur={handleRenameSubmit}
                                aria-label={`Rename ${name}`}
                                autoFocus
                                className="min-w-0 flex-1"
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              // Explorer model: click selects, double-click or
                              // Enter opens. Touch has no double-click, so a tap
                              // still opens there.
                              onClick={(e) => {
                                setSelectedName(name)
                                if (e.nativeEvent?.pointerType === 'touch') openEntry(name)
                              }}
                              onDoubleClick={() => openEntry(name)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  openEntry(name)
                                }
                              }}
                              aria-label={`${name}, ${isFolder ? 'folder' : 'file'}`}
                              className="flex w-full min-w-0 items-center gap-2 text-left"
                            >
                              <Icon
                                size={16}
                                className={isFolder ? FOLDER_ICON_CLASS : FILE_ICON_CLASS}
                                fill={isFolder ? FOLDER_ICON_FILL : 'none'}
                              />
                              <span className="truncate">{name}</span>
                            </button>
                          )}
                        </td>
                        <td className="hidden whitespace-nowrap text-muted-foreground @md:table-cell">
                          {!isFolder && entry.updatedAt
                            ? new Date(entry.updatedAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="hidden whitespace-nowrap text-muted-foreground @md:table-cell">
                          {typeLabel(name, isFolder)}
                        </td>
                        <td className="hidden text-right font-mono text-[11px] whitespace-nowrap text-muted-foreground @md:table-cell">
                          {!isFolder && entry.size != null ? formatBytes(entry.size) : '—'}
                        </td>
                        <td>
                          {/* Hover reveals actions on fine pointers; touch devices have no
                              hover, so keep them visible there (pointer-coarse) — otherwise
                              rename/delete would be unreachable on mobile. */}
                          <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
                            <button
                              type="button"
                              onClick={() => handleRenameStart(name)}
                              className="w7-toolbtn min-h-[24px] px-1"
                              aria-label={`Rename ${name}`}
                              title="Rename"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ name, isFolder })}
                              className="w7-toolbtn w7-toolbtn--danger min-h-[24px] px-1"
                              aria-label={`Delete ${name}`}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Details pane */}
      <div className="w7-detailspane flex shrink-0 items-center justify-between gap-3 px-3 py-1 text-[12px]">
        <span className="shrink-0">
          {children.length} item{children.length !== 1 ? 's' : ''}
        </span>
        {selectedEntry && (
          <span className="min-w-0 truncate text-muted-foreground">
            {selectedName} · {typeLabel(selectedName, selectedEntry.type === 'folder')}
            {selectedEntry.type !== 'folder' && selectedEntry.size != null
              ? ` · ${formatBytes(selectedEntry.size)}`
              : ''}
          </span>
        )}
        <StorageMeter />
      </div>

      {/* Delete confirmation — folders remove their contents too, so guard it */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.isFolder ? 'Delete Folder' : 'Delete File'}
        message={
          deleteTarget
            ? deleteTarget.isFolder
              ? `Delete "${deleteTarget.name}" and everything inside it? This cannot be undone.`
              : `Delete "${deleteTarget.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
