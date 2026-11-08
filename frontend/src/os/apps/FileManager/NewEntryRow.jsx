import { useState } from 'react'
import { Check, File, Folder, X } from 'lucide-react'
import NameInput from './NameInput'
import { baseNameLength } from './fileManagerUtils'

// Inline row for a new item. It opens pre-named ("New folder", "New Text Document.txt")
// with the base name selected, so Enter accepts the default and typing replaces it.
export default function NewEntryRow({ type, initialName, onCreate, onCancel }) {
  const [name, setName] = useState(initialName)
  const [error, setError] = useState(null)
  const isFile = type === 'file'
  const label = isFile ? 'File name' : 'Folder name'
  const Icon = isFile ? File : Folder

  const submit = () => {
    const message = onCreate(name)
    if (message) setError(message)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 border border-w7-select-border bg-w7-select px-2 py-1">
        <Icon
          size={16}
          aria-hidden="true"
          className={isFile ? 'shrink-0 text-[#3d5a80]' : 'shrink-0 text-[#e0a526]'}
          fill={isFile ? 'none' : '#ffd96b'}
        />
        <NameInput
          label={label}
          value={name}
          selectLength={baseNameLength(initialName, !isFile)}
          invalid={error !== null}
          onChange={(value) => {
            setName(value)
            if (error) setError(null)
          }}
          onEnter={submit}
          onEscape={onCancel}
        />
        <button
          type="button"
          onClick={submit}
          aria-label={isFile ? 'Create file' : 'Create folder'}
          title="Create"
          className="w7-toolbtn pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          <Check size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          title="Cancel"
          className="w7-toolbtn pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p role="alert" className="w7-error px-1">
          {error}
        </p>
      )}
    </div>
  )
}
