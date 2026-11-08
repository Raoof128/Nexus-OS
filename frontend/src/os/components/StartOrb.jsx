import { memo } from 'react'

/**
 * The Start orb. Glossy blue sphere (CSS, .nx-start-orb__ball) with an
 * original Nexus "N" monogram — deliberately not the Windows flag, which is a
 * Microsoft trademark.
 */
function StartOrb({ open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Start"
      aria-haspopup="dialog"
      aria-expanded={Boolean(open)}
      title="Start"
      className="nx-start-orb"
    >
      <span className="nx-start-orb__ball flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="nx-orb-glyph" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#cdeeff" />
            </linearGradient>
          </defs>
          <path
            d="M3 15V3h2.6l6.4 7.9V3H15v12h-2.6L6 7.1V15z"
            fill="url(#nx-orb-glyph)"
            stroke="#0b3f78"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  )
}

export default memo(StartOrb)
