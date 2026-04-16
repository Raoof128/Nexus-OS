import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import MediaForm from './MediaForm'

export default function EditMediaDialog({ item, onUpdate, onClose }) {
  const mediaType = item?.type || 'book'
  const config = MEDIA_CONFIG[mediaType]
  const trapRef = useFocusTrap(!!item)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!item) return
    setError(null)
  }, [item])

  useEffect(() => {
    if (!item) return
    document.body.style.overflow = 'hidden'
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleEsc)
    }
  }, [item, onClose])

  if (!item) return null

  const handleSubmit = async (updatedData) => {
    setError(null)
    setSubmitting(true)
    try {
      await onUpdate({ mediaId: item.id, data: updatedData })
      onClose()
    } catch (submitError) {
      setError(submitError.message || 'Failed to update entry')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      ref={trapRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-media-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="neon-border relative w-full max-w-lg max-h-[90dvh] overflow-y-auto custom-scrollbar rounded-2xl glass-panel p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-md"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        <h2 id="edit-media-title" className="heading-display mb-6 text-lg font-bold text-primary sm:text-xl">
          <span aria-hidden="true">// </span>Edit {config.singular}
        </h2>

        <MediaForm
          key={item.id}
          config={config}
          defaultValues={{
            title: item.title || '',
            creator: item.creator === '—' ? '' : (item.creator || ''),
            genre: item.genre || '',
            status: item.status || config.defaultStatus,
            rating: item.rating || '',
            takeaway: item.takeaway || '',
            sub_info: item.sub_info || '',
          }}
          onSubmit={handleSubmit}
          submitting={submitting}
          error={error}
          submitLabel="Save Changes"
          idPrefix="edit"
        />
      </div>
    </div>,
    document.getElementById('modal-root') || document.body
  )
}
