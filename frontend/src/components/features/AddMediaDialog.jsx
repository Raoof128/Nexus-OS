import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import MediaForm from './MediaForm'

export default function AddMediaDialog({ mediaType, onAdd }) {
  const config = MEDIA_CONFIG[mediaType]
  const [open, setOpen] = useState(false)
  const trapRef = useFocusTrap(open)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const handleOpen = () => {
    setError(null)
    setFormKey((k) => k + 1)
    setOpen(true)
  }

  const handleClose = () => {
    setError(null)
    setOpen(false)
  }

  const handleSubmit = async (mediaData) => {
    setError(null)
    setSubmitting(true)
    try {
      await onAdd(mediaData)
      handleClose()
    } catch (submitError) {
      setError(submitError.message || 'Failed to add entry')
    } finally {
      setSubmitting(false)
    }
  }

  const placeholderMap = {
    book: { title: 'Neuromancer', creator: 'William Gibson' },
    movie: { title: 'Blade Runner', creator: 'Ridley Scott' },
    anime: { title: 'Cowboy Bebop', creator: 'Sunrise' },
    job: { title: 'Senior Engineer', creator: 'Stripe' },
  }
  const placeholders = placeholderMap[mediaType] || placeholderMap.book

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="neon-pulse absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-primary px-4 py-3 heading-ui text-[11px] font-bold text-primary-foreground shadow-[0_0_20px_hsl(var(--neon-yellow)/0.4)] transition-all hover:shadow-[0_0_30px_hsl(var(--neon-yellow)/0.6)] hover:scale-105 active:scale-95 sm:px-5 sm:py-3 sm:text-xs"
      >
        <Plus size={14} />
        Add {config.singular}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <Motion.div
              ref={trapRef}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
              onClick={handleClose}
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-media-title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Motion.div
                onClick={(e) => e.stopPropagation()}
                className="neon-border relative w-full max-w-lg max-h-[90dvh] overflow-y-auto custom-scrollbar rounded-2xl glass-panel p-6 shadow-2xl"
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              >
                <button
                  type="button"
                  onClick={handleClose}
                  className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-md"
                  aria-label="Close dialog"
                >
                  <X size={18} />
                </button>

                <h2 id="add-media-title" className="heading-display mb-6 text-lg font-bold text-primary sm:text-xl">
                  <span aria-hidden="true">// </span>Register New {config.singular}
                </h2>

                <MediaForm
                  key={formKey}
                  config={config}
                  defaultValues={{ status: config.defaultStatus }}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                  error={error}
                  submitLabel="Commit to Archive"
                  idPrefix="add"
                  placeholders={placeholders}
                />
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>,
        document.getElementById('modal-root') || document.body
      )}
    </>
  )
}
