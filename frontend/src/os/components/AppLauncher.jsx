import { memo } from 'react'
import { motion as Motion } from 'framer-motion'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'

function AppLauncher() {
  const openApp = useWindowStore((s) => s.openApp)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  const handleLaunch = (appId) => {
    openApp(appId)
    toggleLauncher()
  }

  return (
    <>
      <div
        data-testid="launcher-backdrop"
        className="fixed inset-0 z-[599] bg-black/50 backdrop-blur-sm"
        onClick={toggleLauncher}
      />

      <Motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="neon-border glass-panel fixed bottom-14 left-1/2 z-[600] w-[90vw] max-w-md -translate-x-1/2 rounded-2xl p-4 shadow-[0_0_60px_rgba(0,255,255,0.05)] sm:bottom-16 sm:p-6"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <p className="mb-4 heading-display text-[10px] tracking-[0.3em] text-primary/50">
          // Applications
        </p>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
          {APP_ORDER.map((appId) => {
            const manifest = APP_REGISTRY[appId]
            if (!manifest) return null
            const Icon = manifest.icon
            return (
              <button
                key={appId}
                type="button"
                onClick={() => handleLaunch(appId)}
                className="group flex flex-col items-center gap-2 rounded-xl p-3 transition-all hover:bg-white/[0.04] hover:shadow-[0_0_15px_rgba(0,255,255,0.05)] sm:p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] transition-all group-hover:bg-primary/10 group-hover:ring-primary/20 group-hover:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.15)]">
                  <Icon size={20} className="text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <span className="heading-ui text-[9px] font-semibold text-muted-foreground transition-colors group-hover:text-white sm:text-[10px]">
                  {manifest.title}
                </span>
              </button>
            )
          })}
        </div>
      </Motion.div>
    </>
  )
}

export default memo(AppLauncher)
