import { useState } from 'react'
import { Plus, X } from 'lucide-react'

const STATUSES = ['To Read', 'Reading', 'Finished']

const inputClass =
  'w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white transition-all placeholder:text-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50'

const labelClass = 'mb-1 block text-xs font-semibold uppercase text-muted-foreground'

export default function AddBookDialog({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [genre, setGenre] = useState('')
  const [status, setStatus] = useState('To Read')
  const [rating, setRating] = useState('')
  const [takeaway, setTakeaway] = useState('')

  const reset = () => {
    setTitle('')
    setAuthor('')
    setGenre('')
    setStatus('To Read')
    setRating('')
    setTakeaway('')
    setError(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const bookData = {
      title: title.trim(),
      author: author.trim(),
      genre: genre.trim() || null,
      status,
      rating: rating ? Number(rating) : null,
      takeaway: takeaway.trim() || null,
    }

    try {
      await onAdd(bookData)
      reset()
      setOpen(false)
    } catch (submitError) {
      setError(submitError.message || 'Failed to add book')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full border border-primary bg-primary/20 px-4 py-2 font-mono text-xs text-primary shadow-[0_0_15px_var(--color-primary)] backdrop-blur-xl transition-all hover:bg-primary/40"
      >
        <Plus size={16} />
        Add Book
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950/95 p-6 font-mono shadow-2xl backdrop-blur-xl"
      >
        <button
          type="button"
          onClick={() => { reset(); setOpen(false) }}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-white"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        <h2 className="mb-6 text-xl font-bold uppercase tracking-wider text-primary">
          // Register New Entry
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
              placeholder="Neuromancer"
              required
              maxLength={200}
            />
          </div>

          <div>
            <label htmlFor="add-author" className={labelClass}>Author</label>
            <input
              id="add-author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className={inputClass}
              placeholder="William Gibson"
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
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

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
            className="mt-2 w-full rounded-md bg-primary py-3 text-sm font-bold uppercase text-primary-foreground shadow-[0_0_15px_var(--color-primary)] transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_var(--color-primary)] focus:outline-none disabled:opacity-50"
          >
            {submitting ? 'Uploading...' : 'Commit to Archive'}
          </button>
        </div>
      </form>
    </div>
  )
}
