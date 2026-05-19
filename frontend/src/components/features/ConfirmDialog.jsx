import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { SPRING } from '../../lib/motion'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export default function ConfirmDialog({
  open,
  id = 'confirm',
  title = 'Confirm',
  message = 'Are you sure?',
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  variant = 'destructive',
}) {
  const trapRef = useFocusTrap(open)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const handleEsc = (e) => {
      if (e.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open, onCancel])

  return createPortal(
    <AnimatePresence>
      {open && (
        <Motion.div
          key="confirm-backdrop"
          className="fixed inset-0 z-[1051] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
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
            className="neon-border glass-panel w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={SPRING.snappy}
          >
            <h2
              id={`${id}-dialog-title`}
              className="heading-display mb-2 text-base font-bold text-white"
            >
              {title}
            </h2>
            <p id={`${id}-dialog-message`} className="mb-6 text-sm text-muted-foreground">
              {message}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg bg-white/5 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-all hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded-lg px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                  variant === 'destructive'
                    ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/20 hover:bg-destructive/20 focus-visible:ring-destructive'
                    : 'bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/20 focus-visible:ring-primary'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>,
    document.getElementById('modal-root') || document.body,
  )
}
