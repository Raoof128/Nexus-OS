import { lazy } from 'react'
import {
  Activity,
  BookOpen,
  FolderOpen,
  Mail,
  MessageSquare,
  Settings,
  StickyNote,
  TerminalSquare,
} from 'lucide-react'

// Lazy-load real app components
const MediaApp = lazy(() => import('../../components/features/MediaApp'))
const EmailInbox = lazy(() => import('../../components/features/EmailInbox'))
const ChatLayout = lazy(() => import('../../components/features/ChatLayout'))

const SettingsApp = lazy(() => import('../apps/SettingsApp'))
const SystemMonitorApp = lazy(() => import('../apps/SystemMonitorApp'))
const NotesApp = lazy(() => import('../apps/NotesApp'))
const TerminalApp = lazy(() => import('../apps/TerminalApp'))
const FileManagerApp = lazy(() => import('../apps/FileManagerApp'))

export const APP_REGISTRY = {
  media: {
    id: 'media',
    title: 'Media Vault',
    icon: BookOpen,
    singleton: true,
    defaultSize: { width: 1000, height: 700 },
    minSize: { width: 600, height: 400 },
    component: MediaApp,
  },
  email: {
    id: 'email',
    title: 'Email',
    icon: Mail,
    singleton: true,
    defaultSize: { width: 1000, height: 700 },
    minSize: { width: 500, height: 400 },
    component: EmailInbox,
  },
  chat: {
    id: 'chat',
    title: 'AI Chat',
    icon: MessageSquare,
    singleton: true,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 400, height: 400 },
    component: ChatLayout,
  },
  terminal: {
    id: 'terminal',
    title: 'Terminal',
    icon: TerminalSquare,
    singleton: false,
    defaultSize: { width: 700, height: 450 },
    minSize: { width: 400, height: 250 },
    component: TerminalApp,
  },
  files: {
    id: 'files',
    title: 'File Manager',
    icon: FolderOpen,
    singleton: true,
    defaultSize: { width: 800, height: 550 },
    minSize: { width: 500, height: 350 },
    component: FileManagerApp,
  },
  settings: {
    id: 'settings',
    title: 'Settings',
    icon: Settings,
    singleton: true,
    defaultSize: { width: 600, height: 500 },
    minSize: { width: 450, height: 400 },
    component: SettingsApp,
  },
  sysmon: {
    id: 'sysmon',
    title: 'System Monitor',
    icon: Activity,
    singleton: true,
    defaultSize: { width: 650, height: 450 },
    minSize: { width: 400, height: 300 },
    component: SystemMonitorApp,
  },
  notes: {
    id: 'notes',
    title: 'Notes',
    icon: StickyNote,
    singleton: false,
    defaultSize: { width: 600, height: 500 },
    minSize: { width: 350, height: 300 },
    component: NotesApp,
  },
}

/** Ordered list of app IDs for the launcher grid */
export const APP_ORDER = [
  'media',
  'email',
  'chat',
  'terminal',
  'files',
  'settings',
  'sysmon',
  'notes',
]
