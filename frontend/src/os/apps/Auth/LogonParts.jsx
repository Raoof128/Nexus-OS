import { motion as Motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Info, Loader2, User } from 'lucide-react'

const TEXT_SHADOW = '0 1px 3px #000a'

// Framed user picture, the logon screen's centrepiece (original glyph, no photo).
export function UserTile() {
  return (
    <div className="nx-user-tile h-[128px] w-[128px] p-[5px]" aria-hidden="true">
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ background: 'linear-gradient(#8fd0ff, #2a7ccc 60%, #0b3f78)' }}
      >
        <User size={72} strokeWidth={1.5} className="text-white" />
      </div>
    </div>
  )
}

// Round glossy arrow that submits the sign-in form (Enter in either field also submits).
export function ArrowSubmitButton({ submitting = false, label = 'Sign in' }) {
  return (
    <button
      type="submit"
      aria-label={label}
      disabled={submitting}
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-[#0b3f78] text-white transition-[filter] hover:brightness-110 disabled:opacity-60"
      style={{
        background: 'radial-gradient(circle at 50% 30%, #8fd0ff, #2a7ccc 60%, #0b3f78)',
        boxShadow: `inset 0 1px 1px #ffffffb3, 0 1px 2px #0006`,
        textShadow: TEXT_SHADOW,
      }}
    >
      {submitting ? (
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      ) : (
        <ArrowRight size={15} aria-hidden="true" />
      )}
    </button>
  )
}

// White message balloon. Renders nothing when there is no message.
export function FormBalloon({ id, tone = 'error', children }) {
  if (!children) return null
  const isError = tone === 'error'
  const Icon = isError ? AlertTriangle : Info
  return (
    <Motion.div
      id={id}
      role={isError ? 'alert' : 'status'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={`mb-3 flex items-start gap-2 rounded-[3px] border bg-white px-2.5 py-2 text-[12px] text-[#1e1e1e] shadow-[0_2px_6px_#0005] ${
        isError ? 'border-[#c9a227]' : 'border-[#8bbf8e]'
      }`}
    >
      <Icon
        size={16}
        aria-hidden="true"
        className="mt-px shrink-0"
        fill={isError ? '#ffd75e' : '#dcecfc'}
        stroke={isError ? '#8a6100' : '#2e7d32'}
      />
      <span>{children}</span>
    </Motion.div>
  )
}
