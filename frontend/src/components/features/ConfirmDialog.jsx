import { useEffect } from 'react'
import { useFocusTrap } from '../../hooks/useFocusTrap'

export default function ConfirmDialog({
  open,
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
    const handleEsc = (e) => {
      if (e.key === 'Escape') onCancel?.()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onClick={onCancel}
    >
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
        className="neon-border glass-panel w-full max-w-sm rounded-2xl p-6 shadow-2xl"
      >
        <h2
          id="confirm-dialog-title"
          className="heading-display mb-2 text-base font-bold text-white"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-message"
          className="mb-6 text-sm text-muted-foreground"
        >
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
      </div>
    </div>
  )
}
