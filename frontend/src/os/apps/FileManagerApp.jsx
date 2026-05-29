import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  Home,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { useFileSystemStore } from '../stores/fileSystemStore'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

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
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/[0.04] bg-black/20 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <File size={12} className="text-primary" />
          <span className="heading-ui text-[10px] font-semibold text-white/80">{file.name}</span>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-white">
          <X size={12} />
        </button>
      </div>
      <pre className="flex-1 overflow-auto custom-scrollbar p-4 font-mono text-xs leading-relaxed text-white/70 whitespace-pre-wrap">
        {file.content || '(empty file)'}
      </pre>
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
  const hydrateFileSystem = useFileSystemStore((s) => s.hydrateFileSystem)

  const [creating, setCreating] = useState(null) // 'file' | 'folder' | null
  const [viewingFile, setViewingFile] = useState(null)
  const [renamingEntry, setRenamingEntry] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null) // { name, isFolder } | null

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

  useEffect(() => {
    if (viewingFile && !files[viewingFile]) {
      setViewingFile(null)
    }
  }, [viewingFile, files])

  if (viewingFile && files[viewingFile]) {
    return <FileViewer file={files[viewingFile]} onClose={() => setViewingFile(null)} />
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
      <div className="shrink-0 border-t border-white/[0.04] bg-black/20 px-3 py-1">
        <span className="font-mono text-[9px] text-muted-foreground/50">
          {children.length} item{children.length !== 1 ? 's' : ''}
        </span>
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
