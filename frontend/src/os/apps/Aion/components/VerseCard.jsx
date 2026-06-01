export default function VerseCard({ verse }) {
  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3">
      <p className="mb-1 font-mono text-[9px] tracking-widest text-amber-500/80 uppercase">
        {verse.book_name} {verse.chapter}:{verse.verse}
      </p>
      <p className="font-mono text-xs italic leading-relaxed text-white/70">{verse.content}</p>
    </div>
  )
}
