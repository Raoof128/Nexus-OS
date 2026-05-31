export default function PromptPill({ icon: Icon, label, onPress }) {
  return (
    <button
      onClick={() => onPress(label)}
      aria-label={`Ask: ${label}`}
      className="flex items-center gap-2 rounded-full border border-amber-500/20 bg-white/[0.03] px-3 py-1.5 text-left font-mono text-xs text-amber-200/70 transition-colors hover:border-amber-500/40 hover:bg-amber-500/[0.06] hover:text-amber-200 active:scale-95"
    >
      {Icon && <Icon className="h-3 w-3 shrink-0 text-amber-500/70" />}
      <span className="line-clamp-1">{label}</span>
    </button>
  )
}
