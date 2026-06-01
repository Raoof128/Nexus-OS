export default function PromptPill({ icon: Icon, label, onPress }) {
  return (
    <button
      onClick={() => onPress(label)}
      aria-label={`Ask: ${label}`}
      className="flex items-center gap-2 rounded-full px-3 py-1.5 text-left font-mono text-xs text-[#F0F0F5] transition-colors hover:border-[rgba(217,119,6,0.35)] active:scale-95"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0 text-[#F59E0B]" />}
      <span className="line-clamp-1">{label}</span>
    </button>
  )
}
