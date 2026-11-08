export default function VerseCard({ verse }) {
  return (
    <div className="w7-card p-2.5">
      <span className="w7-badge">
        {verse.book_name} {verse.chapter}:{verse.verse}
      </span>
      <p className="mt-1.5 text-[13px] italic leading-relaxed text-foreground">{verse.content}</p>
    </div>
  )
}
