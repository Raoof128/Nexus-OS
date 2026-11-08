import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { MEDIA_CONFIG } from '../../../lib/mediaConfig'
import { SPRING } from '../../../lib/motion'
import { lockScroll } from '../../../lib/scrollLock'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
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
    const unlock = lockScroll()
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => {
      unlock()
      document.removeEventListener('keydown', handleEsc)
    }
  }, [item, onClose])

  const handleSubmit = async (updatedData) => {
    setError(null)
    setSubmitting(true)
    try {
      await onUpdate({ mediaId: item.id, data: updatedData })
      onClose()
    } catch (submitError) {
      setError(
        submitError.message ||
          'The changes could not be saved. Check your connection, then try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <AnimatePresence>
      {item && (
        <Motion.div
          key="edit-media-backdrop"
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/20 p-4"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* role="dialog" sits on a wrapper: 7.css hides .window[role=dialog] */}
          <Motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-media-title"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full max-w-[460px] flex-col"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={SPRING.snappy}
          >
            <div className="window glass active is-bright flex min-h-0 flex-1 flex-col">
              <div className="title-bar">
                <div id="edit-media-title" className="title-bar-text">
                  Edit {config.singular}
                </div>
                <div className="title-bar-controls">
                  <button type="button" className="is-close" aria-label="Close" onClick={onClose} />
                </div>
              </div>

              <div className="window-body has-space min-h-0 flex-1 overflow-y-auto">
                <MediaForm
                  key={item.id}
                  config={config}
                  defaultValues={{
                    title: item.title || '',
                    creator: item.creator === '—' ? '' : item.creator || '',
                    genre: item.genre || '',
                    status: item.status || config.defaultStatus,
                    rating: item.rating || '',
                    takeaway: item.takeaway || '',
                    sub_info: item.sub_info || '',
                  }}
                  onSubmit={handleSubmit}
                  submitting={submitting}
                  error={error}
                  submitLabel="Save changes"
                  onCancel={onClose}
                  idPrefix="edit"
                />
              </div>
            </div>
          </Motion.div>
        </Motion.div>
      )}
    </AnimatePresence>,
    document.getElementById('modal-root') || document.body,
  )
}
