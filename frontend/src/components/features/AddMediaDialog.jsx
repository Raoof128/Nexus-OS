import { useEffect, useState } from 'react'
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
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
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

  const placeholders = {
    title: mediaType === 'book' ? 'Neuromancer' : mediaType === 'anime' ? 'Cowboy Bebop' : 'Blade Runner',
    creator: mediaType === 'book' ? 'William Gibson' : mediaType === 'anime' ? 'Sunrise' : 'Ridley Scott',
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="neon-pulse fixed bottom-6 left-4 z-50 flex items-center gap-2 rounded-xl glass-panel px-3 py-2.5 heading-ui text-[11px] font-semibold text-primary transition-all hover:bg-primary/15 sm:left-6 sm:px-4 sm:text-xs"
      >
        <Plus size={14} />
        Add {config.singular}
      </button>
    )
  }

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-media-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="neon-border relative w-full max-w-lg max-h-[90dvh] overflow-y-auto custom-scrollbar rounded-2xl glass-panel p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-white"
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
      </div>
    </div>
  )
}
