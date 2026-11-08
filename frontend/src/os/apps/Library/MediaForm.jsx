import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

const inputClass = 'w-full pointer-coarse:min-h-11'

const labelClass = 'mb-1 block text-[12px] text-foreground'

export default function MediaForm({
  config,
  defaultValues = {},
  onSubmit,
  submitting,
  error,
  submitLabel,
  submittingLabel = 'Saving…',
  onCancel,
  idPrefix = 'media',
  placeholders = {},
}) {
  const isJob = config.singular === 'Job'
  const [title, setTitle] = useState(defaultValues.title || '')
  const [creator, setCreator] = useState(defaultValues.creator || '')
  const [genre, setGenre] = useState(defaultValues.genre || '')
  const [status, setStatus] = useState(defaultValues.status || config.defaultStatus)
  const [rating, setRating] = useState(defaultValues.rating ? String(defaultValues.rating) : '')
  const [takeaway, setTakeaway] = useState(defaultValues.takeaway || '')
  const [subInfo, setSubInfo] = useState(defaultValues.sub_info || '')
  // Whitespace passes the native `required` check, so title and creator are
  // checked after trimming. The message sits under the field that failed.
  const [fieldError, setFieldError] = useState(null)
  const titleRef = useRef(null)
  const creatorRef = useRef(null)

  const describedBy = (field) =>
    [
      error ? `${idPrefix}-form-error` : null,
      fieldError?.field === field ? `${idPrefix}-${field}-error` : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  const handleSubmit = async (event) => {
    event.preventDefault()
    const titleMissing = !title.trim()
    const creatorMissing = !creator.trim()
    if (titleMissing || creatorMissing) {
      const field = titleMissing ? 'title' : 'creator'
      setFieldError({
        field,
        message: titleMissing
          ? 'Enter a title.'
          : `Enter the ${config.creatorLabel.toLowerCase()}.`,
      })
      ;(titleMissing ? titleRef : creatorRef).current?.focus()
      return
    }
    setFieldError(null)
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
        <p id={`${idPrefix}-form-error`} role="alert" className="w7-error mb-3">
          {error}
        </p>
      )}

      <fieldset className="space-y-3">
        <legend>Details</legend>

        <div>
          <label htmlFor={`${idPrefix}-title`} className={labelClass}>
            Title
          </label>
          <input
            id={`${idPrefix}-title`}
            type="text"
            ref={titleRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setFieldError(null)
            }}
            className={inputClass}
            placeholder={placeholders.title}
            required
            maxLength={200}
            aria-invalid={Boolean(error) || fieldError?.field === 'title' || undefined}
            aria-describedby={describedBy('title')}
          />
          {fieldError?.field === 'title' && (
            <p id={`${idPrefix}-title-error`} role="alert" className="w7-error mt-1 text-[12px]">
              {fieldError.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${idPrefix}-creator`} className={labelClass}>
            {config.creatorLabel}
          </label>
          <input
            id={`${idPrefix}-creator`}
            type="text"
            ref={creatorRef}
            value={creator}
            onChange={(e) => {
              setCreator(e.target.value)
              setFieldError(null)
            }}
            className={inputClass}
            placeholder={placeholders.creator}
            required
            maxLength={100}
            aria-invalid={fieldError?.field === 'creator' || undefined}
            aria-describedby={describedBy('creator')}
          />
          {fieldError?.field === 'creator' && (
            <p id={`${idPrefix}-creator-error`} role="alert" className="w7-error mt-1 text-[12px]">
              {fieldError.message}
            </p>
          )}
        </div>

        {isJob ? (
          <div>
            <label htmlFor={`${idPrefix}-status`} className={labelClass}>
              Status
            </label>
            <select
              id={`${idPrefix}-status`}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass}
            >
              {config.statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <div>
              <label htmlFor={`${idPrefix}-genre`} className={labelClass}>
                Genre
              </label>
              <input
                id={`${idPrefix}-genre`}
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className={inputClass}
                placeholder="For example, Drama"
                maxLength={80}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-status`} className={labelClass}>
                Status
              </label>
              <select
                id={`${idPrefix}-status`}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
              >
                {config.statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className={isJob ? '' : 'grid grid-cols-1 gap-3 min-[400px]:grid-cols-2'}>
          {!isJob && (
            <div>
              <label htmlFor={`${idPrefix}-rating`} className={labelClass}>
                Rating (1-5)
              </label>
              <input
                id={`${idPrefix}-rating`}
                type="number"
                min="1"
                max="5"
                step="1"
                value={rating}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '' || /^[1-5]$/.test(v)) {
                    setRating(v)
                  }
                }}
                className={inputClass}
                placeholder="Optional"
              />
            </div>
          )}
          <div>
            <label htmlFor={`${idPrefix}-subinfo`} className={labelClass}>
              {config.subInfoLabel}
            </label>
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
      </fieldset>

      <fieldset className="mt-3">
        <legend>Notes</legend>
        <label htmlFor={`${idPrefix}-takeaway`} className="sr-only">
          Takeaway
        </label>
        <textarea
          id={`${idPrefix}-takeaway`}
          value={takeaway}
          onChange={(e) => setTakeaway(e.target.value)}
          className={`${inputClass} resize-none`}
          placeholder="Your notes…"
          rows={3}
          maxLength={2000}
        />
      </fieldset>

      {/* Command area: default action first, then Cancel (Windows 7 order). */}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="w7-btn default pointer-coarse:min-h-11"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              {submittingLabel}
            </span>
          ) : (
            submitLabel
          )}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="w7-btn pointer-coarse:min-h-11"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
