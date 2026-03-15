import { useEffect, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'

const inputClass =
  'w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white transition-all placeholder:text-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50'

const labelClass = 'mb-1 block text-xs font-semibold uppercase text-muted-foreground'

export default function AddMediaDialog({ mediaType, onAdd }) {
  const config = MEDIA_CONFIG[mediaType]
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [title, setTitle] = useState('')
  const [creator, setCreator] = useState('')
  const [genre, setGenre] = useState('')
  const [status, setStatus] = useState(config.defaultStatus)
  const [rating, setRating] = useState('')
  const [takeaway, setTakeaway] = useState('')
  const [subInfo, setSubInfo] = useState('')

  const reset = () => {
    setTitle('')
    setCreator('')
    setGenre('')
    setStatus(config.defaultStatus)
    setRating('')
    setTakeaway('')
    setSubInfo('')
    setError(null)
  }

  useEffect(() => {
    if (!open) return
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const mediaData = {
      title: title.trim(),
      creator: creator.trim(),
      genre: genre.trim() || null,
      status,
      rating: rating ? Number(rating) : null,
      takeaway: takeaway.trim() || null,
      sub_info: subInfo.trim() || null,
    }

    try {
      await onAdd(mediaData)
      reset()
      setOpen(false)
    } catch (submitError) {
      setError(submitError.message || 'Failed to add entry')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { reset(); setStatus(config.defaultStatus); setOpen(true) }}
        className="neon-pulse fixed bottom-6 left-4 z-50 flex items-center gap-2 rounded-xl glass-panel px-3 py-2.5 heading-ui text-[11px] font-semibold text-primary transition-all hover:bg-primary/15 sm:left-6 sm:px-4 sm:text-xs"
      >
        <Plus size={14} />
        Add {config.singular}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      onClick={() => { reset(); setOpen(false) }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-media-title"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="neon-border relative w-full max-w-lg max-h-[90dvh] overflow-y-auto custom-scrollbar rounded-2xl glass-panel p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={() => { reset(); setOpen(false) }}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-white"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        <h2 id="add-media-title" className="heading-display mb-6 text-lg font-bold text-primary sm:text-xl">
          <span aria-hidden="true">// </span>Register New {config.singular}
        </h2>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-bold uppercase tracking-wider text-destructive"
          >
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="add-title" className={labelClass}>Title</label>
            <input
              id="add-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder={mediaType === 'book' ? 'Neuromancer' : mediaType === 'anime' ? 'Cowboy Bebop' : 'Blade Runner'}
              required
              maxLength={200}
            />
          </div>

          <div>
            <label htmlFor="add-creator" className={labelClass}>{config.creatorLabel}</label>
            <input
              id="add-creator"
              type="text"
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              className={inputClass}
              placeholder={mediaType === 'book' ? 'William Gibson' : mediaType === 'anime' ? 'Sunrise' : 'Ridley Scott'}
              required
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="add-genre" className={labelClass}>Genre</label>
              <input
                id="add-genre"
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className={inputClass}
                placeholder="Cyberpunk"
                maxLength={80}
              />
            </div>
            <div>
              <label htmlFor="add-status" className={labelClass}>Status</label>
              <select
                id="add-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
              >
                {config.statuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="add-rating" className={labelClass}>Rating (1-5)</label>
              <input
                id="add-rating"
                type="number"
                min="1"
                max="5"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
            <div>
              <label htmlFor="add-subinfo" className={labelClass}>{config.subInfoLabel}</label>
              <input
                id="add-subinfo"
                type="text"
                value={subInfo}
                onChange={(e) => setSubInfo(e.target.value)}
                className={inputClass}
                placeholder="Optional"
                maxLength={100}
              />
            </div>
          </div>

          <div>
            <label htmlFor="add-takeaway" className={labelClass}>Takeaway</label>
            <textarea
              id="add-takeaway"
              value={takeaway}
              onChange={(e) => setTakeaway(e.target.value)}
              className={`${inputClass} resize-none`}
              placeholder="Personal notes..."
              rows={3}
              maxLength={2000}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="heading-ui mt-2 w-full rounded-lg bg-primary py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground neon-pulse transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:animate-none"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Uploading...
              </span>
            ) : 'Commit to Archive'}
          </button>
        </div>
      </form>
    </div>
  )
}
