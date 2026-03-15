import CyberCard from './CyberCard'

const STATUSES = ['To Read', 'Reading', 'Finished']

export default function KanbanBoard({ books = [] }) {
  // Group books by status
  const groupedBooks = STATUSES.map(status => ({
    status,
    items: books.filter(b => b.status === status),
  }))

  return (
    <div className="grid h-full grid-cols-1 gap-6 md:grid-cols-3">
      {groupedBooks.map(({ status, items }) => (
        <div key={status} className="flex flex-col gap-4 rounded-xl border border-white/5 bg-black/20 p-4 relative backdrop-blur-md">
           {/* Column Neon glow top border */}
           <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent shadow-[0_0_10px_var(--color-primary)]"></div>

          <div className="flex items-center justify-between px-2 pt-2">
            <h2 className="font-mono text-lg font-semibold tracking-widest text-white uppercase">
              // {status}
            </h2>
            <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-white/10 text-xs font-bold font-mono">
              {items.length}
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
             {items.map(book => (
               <CyberCard key={book.id || book.title} book={book} />
             ))}
             {items.length === 0 && (
               <div className="border border-dashed border-white/10 rounded-xl p-8 text-center my-auto flex flex-col justify-center h-48 opacity-50">
                   <p className="font-mono text-sm tracking-wide">NO_RECORDS_FOUND</p>
               </div>
             )}
          </div>
        </div>
      ))}
    </div>
  )
}
