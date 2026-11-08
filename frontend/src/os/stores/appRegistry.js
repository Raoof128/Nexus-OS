import { lazy } from 'react'
import {
  Activity,
  BookOpen,
  FolderOpen,
  ListChecks,
  Mail,
  MessageSquare,
  ScrollText,
  Settings,
  StickyNote,
  TerminalSquare,
} from 'lucide-react'

// Lazy-load real app components
const LibraryApp = lazy(() => import('../apps/Library/LibraryApp'))
const EmailApp = lazy(() => import('../apps/Email/EmailApp'))
const ChatApp = lazy(() => import('../apps/Chat/ChatApp'))

const SettingsApp = lazy(() => import('../apps/SettingsApp'))
const SystemMonitorApp = lazy(() => import('../apps/SystemMonitorApp'))
const NotesApp = lazy(() => import('../apps/NotesApp'))
const TerminalApp = lazy(() => import('../apps/TerminalApp'))
const FileManagerApp = lazy(() => import('../apps/FileManagerApp'))
const AionApp = lazy(() => import('../apps/Aion/AionApp'))
const TasksApp = lazy(() => import('../apps/Tasks/TasksApp'))

/**
 * `tint` is the [top, bottom] gradient of the app's glossy icon (AppIcon.jsx);
 * `description` is the Start-menu tooltip / search text.
 */
export const APP_REGISTRY = {
  media: {
    id: 'media',
    tint: ['#f6b24a', '#c4650d'],
    description: 'Your books, films, anime and job applications',
    title: 'Media Vault',
    icon: BookOpen,
    singleton: true,
    defaultSize: { width: 1000, height: 700 },
    minSize: { width: 600, height: 400 },
    component: LibraryApp,
  },
  email: {
    id: 'email',
    tint: ['#5cb3f2', '#1a5fb4'],
    description: 'Read and send mail',
    title: 'Email',
    icon: Mail,
    singleton: true,
    defaultSize: { width: 1000, height: 700 },
    minSize: { width: 500, height: 400 },
    component: EmailApp,
  },
  chat: {
    id: 'chat',
    tint: ['#6fd38a', '#1f8a45'],
    description: 'Ask the AI assistant',
    title: 'AI Chat',
    icon: MessageSquare,
    singleton: true,
    defaultSize: { width: 800, height: 600 },
    minSize: { width: 400, height: 400 },
    component: ChatApp,
  },
  terminal: {
    id: 'terminal',
    tint: ['#5b6470', '#1b1f24'],
    description: 'Command line',
    title: 'Terminal',
    icon: TerminalSquare,
    singleton: false,
    defaultSize: { width: 700, height: 450 },
    minSize: { width: 400, height: 250 },
    component: TerminalApp,
  },
  files: {
    id: 'files',
    tint: ['#ffe28a', '#e0a526'],
    description: 'Browse your files',
    // Default title; the app can retitle its window to the folder with setWindowTitle.
    title: 'File Manager',
    icon: FolderOpen,
    singleton: true,
    defaultSize: { width: 800, height: 550 },
    minSize: { width: 500, height: 350 },
    component: FileManagerApp,
  },
  settings: {
    id: 'settings',
    tint: ['#9fb6cf', '#4d6784'],
    description: 'Personalise Nexus OS',
    // Win7 names this window "Control Panel", matching the Start menu entry.
    title: 'Control Panel',
    icon: Settings,
    singleton: true,
    defaultSize: { width: 600, height: 500 },
    minSize: { width: 450, height: 400 },
    component: SettingsApp,
  },
  sysmon: {
    id: 'sysmon',
    tint: ['#7fd8c8', '#1c7f73'],
    description: 'Performance and status',
    title: 'System Monitor',
    icon: Activity,
    singleton: true,
    defaultSize: { width: 650, height: 450 },
    minSize: { width: 400, height: 300 },
    component: SystemMonitorApp,
  },
  notes: {
    id: 'notes',
    tint: ['#fff08a', '#e0b81c'],
    description: 'Quick notes',
    title: 'Notes',
    icon: StickyNote,
    singleton: false,
    defaultSize: { width: 600, height: 500 },
    minSize: { width: 350, height: 300 },
    component: NotesApp,
  },
  tasks: {
    id: 'tasks',
    tint: ['#7ec3ff', '#2a6fd1'],
    description: 'To-do lists and reminders',
    title: 'Tasks',
    icon: ListChecks,
    singleton: true,
    defaultSize: { width: 760, height: 640 },
    minSize: { width: 420, height: 400 },
    component: TasksApp,
  },
  aion: {
    id: 'aion',
    tint: ['#c79cf2', '#6a3aa8'],
    description: 'Bible reader and companion',
    title: 'Aion',
    icon: ScrollText,
    singleton: true,
    defaultSize: { width: 900, height: 650 },
    minSize: { width: 700, height: 500 },
    component: AionApp,
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
  'tasks',
  'aion',
]
