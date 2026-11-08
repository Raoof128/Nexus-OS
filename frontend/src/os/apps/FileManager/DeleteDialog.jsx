import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { lockScroll } from '../../../lib/scrollLock'
import { useFocusTrap } from '../../../hooks/useFocusTrap'

// Windows 7 delete confirmation: a message box with Yes (default) and No.
// Escape means No. Kept local so the File Manager can use Yes/No wording;
// ConfirmDialog is shared and always says Delete / Cancel.
export default function DeleteDialog({ open, title, message, onYes, onNo }) {
  const trapRef = useFocusTrap(open)
  // The Escape listener reads the latest onNo without re-subscribing every render.
  const noRef = useRef(onNo)
  useEffect(() => {
    noRef.current = onNo
  }, [onNo])

  useEffect(() => {
    if (!open) return
    const unlock = lockScroll()
    const handleEsc = (e) => {
      if (e.key === 'Escape') noRef.current()
    }
    document.addEventListener('keydown', handleEsc)
    return () => {
      unlock()
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  if (!open) return null

  // The role sits on a wrapper, not on the .window element: 7.css hides
  // `.window[role=dialog]` until :target, so the frame itself carries no role.
  return createPortal(
    <div className="fixed inset-0 z-[1051] flex items-center justify-center bg-black/20 p-4">
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="file-delete-title"
        aria-describedby="file-delete-message"
        className="w-full max-w-[400px]"
      >
        <div className="window glass active is-bright">
          <div className="title-bar">
            <div id="file-delete-title" className="title-bar-text">
              {title}
            </div>
            <div className="title-bar-controls">
              <button type="button" className="is-close" aria-label="Close" onClick={onNo} />
            </div>
          </div>
          <div className="window-body has-space">
            <div className="flex items-start gap-3 py-2">
              <AlertTriangle
                size={32}
                aria-hidden="true"
                className="shrink-0 text-[#d69a00]"
                fill="#ffd75e"
              />
              <p id="file-delete-message" className="pt-1 text-[12px] text-foreground">
                {message}
              </p>
            </div>
          </div>
          <footer className="flex items-center justify-end gap-2 px-3 pt-1 pb-3">
            <button
              type="button"
              onClick={onYes}
              className="w7-btn default pointer-coarse:min-h-11"
            >
              Yes
            </button>
            <button type="button" onClick={onNo} className="w7-btn pointer-coarse:min-h-11">
              No
            </button>
          </footer>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root') || document.body,
  )
}
