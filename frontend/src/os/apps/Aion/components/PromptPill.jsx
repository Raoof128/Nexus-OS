export default function PromptPill({ icon: Icon, label, onPress }) {
  return (
    <button
      onClick={() => onPress(label)}
      aria-label={`Ask: ${label}`}
      className="flex items-center gap-2 rounded-full border border-amber-500/40 px-3 py-1.5 text-left font-mono text-xs text-amber-100/90 transition-colors hover:border-amber-400/70 hover:text-amber-100 active:scale-95"
      style={{ background: 'rgba(10,10,14,0.72)' }}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0 text-amber-400" />}
      <span className="line-clamp-1">{label}</span>
    </button>
  )
}
