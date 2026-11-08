import { ChevronDown, FilePlus, FolderPlus, Upload } from 'lucide-react'

const FOLDER_ICON_FILL = '#ffd96b'

// Explorer command bar: Organize menu first, then the app's own actions.
export default function CommandBar({
  organizeOpen,
  onOrganize,
  onNewFolder,
  onNewFile,
  showImport,
  importing,
  onImport,
  fileInputRef,
  onFileChange,
}) {
  return (
    <div className="w7-commandbar shrink-0">
      <button
        type="button"
        onClick={(e) => onOrganize(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={organizeOpen}
        className="w7-toolbtn pointer-coarse:min-h-11"
      >
        <span>Organize</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-[#a0afc3]" />
      <button
        type="button"
        onClick={onNewFolder}
        className="w7-toolbtn pointer-coarse:min-h-11"
        aria-label="New folder"
        title="New folder"
      >
        <FolderPlus
          size={16}
          className="text-[#e0a526]"
          fill={FOLDER_ICON_FILL}
          aria-hidden="true"
        />
        <span>New folder</span>
      </button>
      <button
        type="button"
        onClick={onNewFile}
        className="w7-toolbtn pointer-coarse:min-h-11"
        aria-label="New file"
        title="New file"
      >
        <FilePlus size={16} className="text-[#3d5a80]" aria-hidden="true" />
        <span>New file</span>
      </button>
      {showImport && (
        <button
          type="button"
          onClick={onImport}
          disabled={importing}
          className="w7-toolbtn pointer-coarse:min-h-11"
          aria-label="Import files from disk"
          title="Import from disk"
        >
          <Upload size={16} className="text-primary" aria-hidden="true" />
          <span>{importing ? 'Importing…' : 'Import'}</span>
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={onFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  )
}
