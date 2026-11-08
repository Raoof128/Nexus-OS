export default function PromptPill({ icon: Icon, label, onPress }) {
  return (
    <button
      type="button"
      onClick={() => onPress(label)}
      aria-label={`Ask: ${label}`}
      className="w7-card w7-item flex items-center gap-2 px-2.5 py-1 text-left text-[12px] text-foreground"
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-[#3d5a80]" aria-hidden="true" />}
      <span className="line-clamp-1">{label}</span>
    </button>
  )
}
