import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { MEDIA_CONFIG } from '../../../lib/mediaConfig'
import { SPRING } from '../../../lib/motion'
import { lockScroll } from '../../../lib/scrollLock'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import MediaForm from './MediaForm'

export default function AddMediaDialog({ mediaType, onAdd }) {
  const config = MEDIA_CONFIG[mediaType]
  const [open, setOpen] = useState(false)
  const [initialStatus, setInitialStatus] = useState(null)
  const trapRef = useFocusTrap(open)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (!open) return
    const unlock = lockScroll()
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEsc)
    return () => {
      unlock()
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  useEffect(() => {
    const handleExternal = (event) => {
      const requestedStatus = event?.detail?.status || null
      setInitialStatus(requestedStatus)
      setError(null)
      setFormKey((k) => k + 1)
      setOpen(true)
    }
    window.addEventListener('nexus:open-add-media', handleExternal)
    return () => window.removeEventListener('nexus:open-add-media', handleExternal)
  }, [])

  const handleOpen = () => {
    setInitialStatus(null)
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
      <button type="button" onClick={handleOpen} className="w7-toolbtn">
        <Plus size={14} aria-hidden="true" />
        Add {config.singular}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <Motion.div
              key="add-media-backdrop"
              className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/20 p-4"
              onClick={handleClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* role="dialog" sits on a wrapper: 7.css hides .window[role=dialog] */}
              <Motion.div
                ref={trapRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-media-title"
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[90dvh] w-full max-w-[460px] flex-col"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={SPRING.snappy}
              >
                <div className="window glass active is-bright flex min-h-0 flex-1 flex-col">
                  <div className="title-bar">
                    <div id="add-media-title" className="title-bar-text">
                      Add {config.singular}
                    </div>
                    <div className="title-bar-controls">
                      <button
                        type="button"
                        className="is-close"
                        aria-label="Close"
                        onClick={handleClose}
                      />
                    </div>
                  </div>

                  <div className="window-body has-space min-h-0 flex-1 overflow-y-auto">
                    <MediaForm
                      key={formKey}
                      config={config}
                      defaultValues={{ status: initialStatus || config.defaultStatus }}
                      onSubmit={handleSubmit}
                      submitting={submitting}
                      error={error}
                      submitLabel={`Add ${config.singular}`}
                      idPrefix="add"
                      placeholders={placeholders}
                    />
                  </div>
                </div>
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>,
        document.getElementById('modal-root') || document.body,
      )}
    </>
  )
}
