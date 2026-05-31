import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
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

function NewEntryDialog({ type, onSubmit, onCancel }) {
  const [name, setName] = useState('')
  const label = type === 'file' ? 'File name' : 'Folder name'

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSubmit(name.trim())
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={label}
        autoFocus
        className="flex-1 bg-transparent font-mono text-[11px] text-white/80 placeholder-muted-foreground/30 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => name.trim() && onSubmit(name.trim())}
        className="text-primary hover:text-white"
      >
        <FilePlus size={12} />
      </button>
      <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-white">
        <X size={12} />
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.04] bg-black/20 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <File size={12} className="shrink-0 text-primary" />
          <span className="heading-ui truncate text-[10px] font-semibold text-white/80">
            {file.name}
          </span>
          {file.size != null && (
            <span className="shrink-0 font-mono text-[9px] text-muted-foreground/40">
              {formatBytes(file.size)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isBlob && (
            <button
              type="button"
              onClick={download}
              className="rounded p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary"
              aria-label="Download file"
              title="Download"
            >
              <Download size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-white"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {state.status === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      )}

      {state.status === 'missing' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <File size={24} className="text-muted-foreground/30" />
          <p className="font-mono text-[10px] text-red-400/70">BLOB_NOT_FOUND</p>
          <p className="font-mono text-[9px] text-muted-foreground/40">
            The stored data for this file is missing or storage was cleared.
          </p>
        </div>
      )}

      {state.status === 'text' && (
        <pre className="flex-1 overflow-auto custom-scrollbar p-4 font-mono text-xs leading-relaxed text-white/70 whitespace-pre-wrap">
          {state.text || '(empty file)'}
        </pre>
      )}

      {state.status === 'binary' &&
        (isImage ? (
          <div className="flex flex-1 items-center justify-center overflow-auto bg-black/40 p-4">
            <img src={state.url} alt={file.name} className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
            <File size={28} className="text-primary/50" />
            <p className="font-mono text-[10px] text-muted-foreground/60">
              No inline preview for this file type.
            </p>
            <button
              type="button"
              onClick={download}
              className="flex items-center gap-1.5 rounded-md bg-primary/15 px-3 py-1.5 font-mono text-[10px] text-primary ring-1 ring-primary/20 transition-colors hover:bg-primary/25 focus-visible:outline-none"
            >
              <Download size={12} /> Download {file.name}
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
      <HardDrive size={9} className="text-muted-foreground/50" />
      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-primary/60" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[9px] text-muted-foreground/50">
        {formatBytes(info.usage)}
      </span>
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

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.04] bg-black/20 px-3 py-1.5">
        <div className="flex items-center gap-1">
          {parentPath !== null && (
            <button
              type="button"
              onClick={() => navigateTo(parentPath)}
              className="rounded-md p-1 text-muted-foreground hover:bg-white/[0.03] hover:text-white"
              aria-label="Go up"
            >
              <ArrowLeft size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigateTo('/')}
            className="rounded-md p-1 text-muted-foreground hover:bg-white/[0.03] hover:text-white"
            aria-label="Go home"
          >
            <Home size={12} />
          </button>
          <span className="ml-2 font-mono text-[10px] text-primary/60">{currentPath}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCreating('folder')}
            className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary"
            aria-label="New folder"
            title="New folder"
          >
            <FolderPlus size={12} />
          </button>
          <button
            type="button"
            onClick={() => setCreating('file')}
            className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary"
            aria-label="New file"
            title="New file"
          >
            <FilePlus size={12} />
          </button>
          {opfsAvailable && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="rounded-md p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary disabled:opacity-40"
              aria-label="Import files from disk"
              title="Import from disk"
            >
              {importing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {creating && (
          <div className="mb-2">
            <NewEntryDialog
              type={creating}
              onSubmit={handleCreate}
              onCancel={() => setCreating(null)}
            />
          </div>
        )}

        {importError && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5">
            <span className="font-mono text-[10px] text-red-400/80">{importError}</span>
            <button
              type="button"
              onClick={() => setImportError(null)}
              className="text-red-400/60 hover:text-red-300"
              aria-label="Dismiss error"
            >
              <X size={11} />
            </button>
          </div>
        )}

        {children.length === 0 && !creating && (
          <div className="flex h-32 items-center justify-center">
            <p className="font-mono text-[10px] text-muted-foreground/50">EMPTY_DIRECTORY</p>
          </div>
        )}

        {children.map((name) => {
          const entryPath = buildEntryPath(name)
          const entry = files[entryPath]
          if (!entry) return null

          const isFolder = entry.type === 'folder'
          const Icon = isFolder ? Folder : File

          return (
            <div
              key={name}
              className="group flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.03]"
            >
              {renamingEntry === name ? (
                <div className="flex flex-1 items-center gap-2">
                  <Icon
                    size={14}
                    className={isFolder ? 'text-primary/60' : 'text-muted-foreground'}
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
                    autoFocus
                    className="flex-1 bg-transparent font-mono text-[11px] text-white/80 focus:outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (isFolder) navigateTo(entryPath)
                    else setViewingFile(entryPath)
                  }}
                  className="flex flex-1 items-center gap-2 text-left"
                >
                  <Icon
                    size={14}
                    className={isFolder ? 'text-primary/60' : 'text-muted-foreground'}
                  />
                  <span className="font-mono text-[11px] text-white/80">{name}</span>
                  {!isFolder && entry.updatedAt && (
                    <span className="ml-auto font-mono text-[9px] text-muted-foreground/40">
                      {new Date(entry.updatedAt).toLocaleDateString()}
                    </span>
                  )}
                </button>
              )}

              {/* Hover reveals actions on fine pointers; touch devices have no
                  hover, so keep them visible there (pointer-coarse) — otherwise
                  rename/delete would be unreachable on mobile. */}
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
                <button
                  type="button"
                  onClick={() => handleRenameStart(name)}
                  className="rounded p-1 text-muted-foreground hover:bg-primary/15 hover:text-primary"
                  aria-label={`Rename ${name}`}
                  title="Rename"
                >
                  <Pencil size={10} />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ name, isFolder })}
                  className="rounded p-1 text-muted-foreground hover:bg-red-500/15 hover:text-red-400"
                  aria-label={`Delete ${name}`}
                  title="Delete"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Status bar */}
      <div className="flex shrink-0 items-center justify-between border-t border-white/[0.04] bg-black/20 px-3 py-1">
        <span className="font-mono text-[9px] text-muted-foreground/50">
          {children.length} item{children.length !== 1 ? 's' : ''}
        </span>
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
