import { motion as Motion } from 'framer-motion'
import { BookOpen, ChevronRight, Trash2 } from 'lucide-react'

const STATUS_FLOW = ['To Read', 'Reading', 'Finished']

function nextStatus(current) {
  const index = STATUS_FLOW.indexOf(current)
  if (index === -1 || index >= STATUS_FLOW.length - 1) return null
  return STATUS_FLOW[index + 1]
}

export default function CyberCard({ book, onUpdateBook, onDeleteBook }) {
  const next = nextStatus(book.status)

  const handleAdvance = async (event) => {
    event.stopPropagation()
    if (!next || !onUpdateBook) return
    await onUpdateBook({ bookId: book.id, data: { status: next } })
  }

  const handleDelete = async (event) => {
    event.stopPropagation()
    if (!onDeleteBook) return
    await onDeleteBook(book.id)
  }

  return (
    <Motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40 p-6 backdrop-blur-xl transition-all"
    >
      {/* Neon glowing artifact behind */}
      <div className="absolute -inset-1 z-0 bg-gradient-to-r from-primary/20 via-transparent to-primary/5 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-4">
          <BookOpen className="h-6 w-6 text-primary drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-medium text-primary">
            {book.status}
          </span>
        </div>

        <h3 className="mb-1 text-xl font-bold tracking-tight text-white group-hover:text-primary transition-colors">
          {book.title}
        </h3>
        <p className="font-mono text-sm text-muted-foreground mb-4">
          // {book.author}
        </p>

        <div className="mt-auto pt-4 border-t border-white/5 flex flex-wrap items-center gap-2">
          {book.genre && (
            <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-gray-300 ring-1 ring-inset ring-white/10">
              {book.genre}
            </span>
          )}
          {book.rating && (
            <span className="inline-flex items-center rounded-md bg-white/5 px-2 py-1 text-xs font-medium text-yellow-500 ring-1 ring-inset ring-white/10">
              ★ {book.rating}/5
            </span>
          )}

          <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {next && (
              <button
                type="button"
                onClick={handleAdvance}
                className="rounded-md bg-white/5 p-1.5 text-xs text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary"
                title={`Move to ${next}`}
                aria-label={`Move to ${next}`}
              >
                <ChevronRight size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md bg-white/5 p-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
              title="Delete book"
              aria-label="Delete book"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </Motion.div>
  )
}
