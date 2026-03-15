import { motion as Motion } from 'framer-motion'
import { BookOpen } from 'lucide-react'

export default function CyberCard({ book }) {
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
        
        <div className="mt-auto pt-4 border-t border-white/5 flex flex-wrap gap-2">
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
        </div>
      </div>
    </Motion.div>
  )
}
