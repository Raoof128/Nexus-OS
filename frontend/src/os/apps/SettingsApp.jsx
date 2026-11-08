import { useState } from 'react'
import { Bell, HardDrive, Info, Palette, User } from 'lucide-react'
import AccountsPanel from './Settings/AccountsPanel'
import NotificationsPanel from './Settings/NotificationsPanel'
import PersonalizationPanel from './Settings/PersonalizationPanel'
import StoragePanel from './Settings/StoragePanel'
import SystemPanel from './Settings/SystemPanel'

// Control Panel categories. `heading` is the Win7 main instruction shown above the content.
const CATEGORIES = [
  {
    id: 'personalization',
    label: 'Personalization',
    heading: 'Change the visuals on your computer',
    icon: Palette,
  },
  {
    id: 'storage',
    label: 'Nexus Drive',
    heading: 'Manage the storage on this computer',
    icon: HardDrive,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    heading: 'Choose how notifications appear',
    icon: Bell,
  },
  {
    id: 'accounts',
    label: 'User accounts',
    heading: 'Manage your account',
    icon: User,
  },
  { id: 'system', label: 'System', heading: 'View basic information about Nexus OS', icon: Info },
]

export default function SettingsApp() {
  const [activeId, setActiveId] = useState('personalization')
  const active = CATEGORIES.find((c) => c.id === activeId) ?? CATEGORIES[0]

  return (
    <div className="flex h-full w-full overflow-hidden bg-white text-[12px] text-foreground">
      {/* Category pane */}
      <nav
        aria-label="Control Panel categories"
        className="w7-navpane flex w-[140px] shrink-0 flex-col gap-px p-1 @md:w-[180px]"
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const isActive = activeId === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveId(cat.id)}
              aria-current={isActive ? 'page' : undefined}
              className="w7-item flex items-center gap-2 px-2 py-1 text-left"
            >
              <Icon size={16} aria-hidden="true" className="shrink-0 text-[#3d5a80]" />
              <span className="truncate">{cat.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="w7-heading mb-4">{active.heading}</h2>
        {activeId === 'personalization' && <PersonalizationPanel />}
        {activeId === 'storage' && <StoragePanel />}
        {activeId === 'notifications' && <NotificationsPanel />}
        {activeId === 'accounts' && <AccountsPanel />}
        {activeId === 'system' && <SystemPanel />}
      </div>
    </div>
  )
}
