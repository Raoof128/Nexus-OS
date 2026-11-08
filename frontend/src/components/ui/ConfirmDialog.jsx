import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { AlertTriangle, Info } from 'lucide-react'
import { lockScroll } from '../../lib/scrollLock'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export default function ConfirmDialog({
  open,
  id = 'confirm',
  title = 'Confirm',
  message = 'Are you sure?',
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  // Which button is the default (Enter, initial focus). Windows 7 makes the
  // safe choice the default when the action loses work (discard, close all).
  defaultAction = 'confirm',
}) {
  const trapRef = useFocusTrap(open)

  useEffect(() => {
    if (!open) return
    const unlock = lockScroll()
    const handleEsc = (e) => {
      if (e.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', handleEsc)
    return () => {
      unlock()
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open, onCancel])

  // Windows 7 message box: glass caption, white body with a warning/info icon
  // beside the message, grey command area with the action buttons on the right.
  // (role="alertdialog" on the .window is safe — 7.css only hides
  // `.window[role='dialog']`.)
  const Icon = variant === 'destructive' ? AlertTriangle : Info
  return createPortal(
    <AnimatePresence>
      {open && (
        <Motion.div
          key="confirm-backdrop"
          className="fixed inset-0 z-[1051] flex items-center justify-center bg-black/20 p-4"
          onClick={onCancel}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Motion.div
            key="confirm-panel"
            ref={trapRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${id}-dialog-title`}
            aria-describedby={`${id}-dialog-message`}
            onClick={(e) => e.stopPropagation()}
            className="window glass active is-bright w-full max-w-[400px]"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
          >
            <div className="title-bar">
              <div id={`${id}-dialog-title`} className="title-bar-text">
                {title}
              </div>
              <div className="title-bar-controls">
                <button type="button" className="is-close" aria-label="Close" onClick={onCancel} />
              </div>
            </div>
            <div className="window-body has-space">
              <div className="flex items-start gap-3 py-2">
                <Icon
                  size={32}
                  aria-hidden="true"
                  className={`shrink-0 ${variant === 'destructive' ? 'text-[#d69a00]' : 'text-primary'}`}
                  fill={variant === 'destructive' ? '#ffd75e' : '#dcecfc'}
                />
                <p id={`${id}-dialog-message`} className="pt-1 text-[12px] text-foreground">
                  {message}
                </p>
              </div>
            </div>
            <footer className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className={`w7-btn${defaultAction === 'confirm' ? ' default' : ''}`}
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className={`w7-btn${defaultAction === 'cancel' ? ' default' : ''}`}
              >
                {cancelLabel}
              </button>
            </footer>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>,
    document.getElementById('modal-root') || document.body,
  )
}
