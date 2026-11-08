import { memo, useId } from 'react'
import { APP_REGISTRY } from '../stores/appRegistry'

/**
 * Glossy Windows 7-era application icon, drawn in SVG so it is crisp at every
 * size (16px title bars → 48px desktop). Original artwork: a jewel tile in the
 * app's registry `tint` with the app's Lucide glyph in white, plus a manila
 * folder for File Manager. No Microsoft icon assets are used.
 */
function AppIcon({ appId, size = 32, className = '' }) {
  const uid = useId().replace(/:/g, '')
  const manifest = APP_REGISTRY[appId]
  if (!manifest) return null
  const [top, bottom] = manifest.tint || ['#9fb6cf', '#4d6784']
  const Glyph = manifest.icon

  if (appId === 'files') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className={className}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={`fb-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f3c65a" />
            <stop offset="1" stopColor="#d79a1c" />
          </linearGradient>
          <linearGradient id={`ff-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffeaa6" />
            <stop offset="0.5" stopColor="#ffd96b" />
            <stop offset="1" stopColor="#f0b632" />
          </linearGradient>
        </defs>
        <path
          d="M4 11.5c0-1.4 1.1-2.5 2.5-2.5h11l4 4h20c1.4 0 2.5 1.1 2.5 2.5V38c0 1.4-1.1 2.5-2.5 2.5h-35A2.5 2.5 0 0 1 4 38z"
          fill={`url(#fb-${uid})`}
          stroke="#a8740f"
          strokeWidth="1"
        />
        <rect x="8" y="15" width="32" height="14" rx="1" fill="#fff" stroke="#c9c9c9" />
        <path
          d="M3 20.5c0-1.4 1.1-2.5 2.5-2.5h37c1.4 0 2.6 1.2 2.4 2.6l-2.2 17.6a2.5 2.5 0 0 1-2.5 2.3h-32.4a2.5 2.5 0 0 1-2.5-2.3z"
          fill={`url(#ff-${uid})`}
          stroke="#b8860b"
          strokeWidth="1"
        />
        <path d="M5 21h38" stroke="#fff8" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }

  // Glyph occupies ~56% of the tile, like Win7's large-icon padding.
  const glyph = Math.round(size * 0.56)
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        className="absolute inset-0"
        focusable="false"
      >
        <defs>
          <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={top} />
            <stop offset="1" stopColor={bottom} />
          </linearGradient>
          <linearGradient id={`gl-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3"
          width="42"
          height="42"
          rx="9"
          fill={`url(#bg-${uid})`}
          stroke="#0000004d"
          strokeWidth="1"
        />
        <rect
          x="4"
          y="4"
          width="40"
          height="40"
          rx="8"
          fill="none"
          stroke="#ffffff66"
          strokeWidth="1"
        />
        <path
          d="M4.5 12a7.5 7.5 0 0 1 7.5-7.5h24A7.5 7.5 0 0 1 43.5 12v8.5Q24 27 4.5 20.5z"
          fill={`url(#gl-${uid})`}
        />
      </svg>
      {Glyph && (
        <Glyph
          size={glyph}
          strokeWidth={size <= 20 ? 2.4 : 2}
          className="relative text-white"
          style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))' }}
        />
      )}
    </span>
  )
}

export default memo(AppIcon)
