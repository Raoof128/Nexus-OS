import { X } from 'lucide-react'

// Win7 info bar for errors that apply to the whole folder view.
export default function Notice({ children, onDismiss }) {
  return (
    <div role="alert" className="w7-infobar m-2 mb-0 justify-between">
      <span className="w7-error">{children}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="w7-toolbtn pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        aria-label="Dismiss message"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
