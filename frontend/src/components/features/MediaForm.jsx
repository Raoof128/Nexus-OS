import { useState } from 'react'
import { Loader2 } from 'lucide-react'

const inputClass =
  'w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white transition-all placeholder:text-white/40 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'

const labelClass = 'mb-1 block text-xs font-semibold uppercase text-muted-foreground'

export default function MediaForm({ config, defaultValues = {}, onSubmit, submitting, error, submitLabel, submittingLabel = 'Saving...', idPrefix = 'media', placeholders = {} }) {
  const [title, setTitle] = useState(defaultValues.title || '')
  const [creator, setCreator] = useState(defaultValues.creator || '')
  const [genre, setGenre] = useState(defaultValues.genre || '')
  const [status, setStatus] = useState(defaultValues.status || config.defaultStatus)
  const [rating, setRating] = useState(defaultValues.rating ? String(defaultValues.rating) : '')
  const [takeaway, setTakeaway] = useState(defaultValues.takeaway || '')
  const [subInfo, setSubInfo] = useState(defaultValues.sub_info || '')

  const handleSubmit = async (event) => {
    event.preventDefault()
    const mediaData = {
      title: title.trim(),
      creator: creator.trim(),
      genre: genre.trim() || null,
      status,
      rating: rating ? Number(rating) : null,
      takeaway: takeaway.trim() || null,
      sub_info: subInfo.trim() || null,
    }
    await onSubmit(mediaData)
  }

  return (
    <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
      {error && (
        <div
          id={`${idPrefix}-form-error`}
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-bold uppercase tracking-wider text-destructive"
        >
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor={`${idPrefix}-title`} className={labelClass}>Title</label>
          <input
            id={`${idPrefix}-title`}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder={placeholders.title}
            required
            maxLength={200}
            {...(error ? { 'aria-describedby': `${idPrefix}-form-error`, 'aria-invalid': true } : {})}
          />
        </div>

        <div>
          <label htmlFor={`${idPrefix}-creator`} className={labelClass}>{config.creatorLabel}</label>
          <input
            id={`${idPrefix}-creator`}
            type="text"
            value={creator}
            onChange={(e) => setCreator(e.target.value)}
            className={inputClass}
            placeholder={placeholders.creator}
            required
            maxLength={100}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${idPrefix}-genre`} className={labelClass}>Genre</label>
            <input
              id={`${idPrefix}-genre`}
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className={inputClass}
              placeholder="Cyberpunk"
              maxLength={80}
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-status`} className={labelClass}>Status</label>
            <select
              id={`${idPrefix}-status`}
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
            <label htmlFor={`${idPrefix}-rating`} className={labelClass}>Rating (1-5)</label>
            <input
              id={`${idPrefix}-rating`}
              type="number"
              min="1"
              max="5"
              step="1"
              value={rating}
              onChange={(e) => {
                const v = e.target.value
                if (v === '' || (/^[1-5]$/.test(v))) {
                  setRating(v)
                }
              }}
              className={inputClass}
              placeholder="Optional"
            />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-subinfo`} className={labelClass}>{config.subInfoLabel}</label>
            <input
              id={`${idPrefix}-subinfo`}
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
          <label htmlFor={`${idPrefix}-takeaway`} className={labelClass}>Takeaway</label>
          <textarea
            id={`${idPrefix}-takeaway`}
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
              {submittingLabel}
            </span>
          ) : submitLabel}
        </button>
      </div>
    </form>
  )
}
