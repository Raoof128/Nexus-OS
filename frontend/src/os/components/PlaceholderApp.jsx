import { Construction } from 'lucide-react'

export default function PlaceholderApp({ appId }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
      <Construction size={48} className="text-primary/30" />
      <p className="heading-display text-sm tracking-[0.2em] text-primary/50">Coming Soon</p>
      <p className="font-mono text-xs text-muted-foreground/50">
        {appId}::init() — awaiting deployment
      </p>
    </div>
  )
}
