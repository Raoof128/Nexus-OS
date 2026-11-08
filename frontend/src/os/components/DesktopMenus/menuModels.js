import { Activity, Layers, Minus, Monitor, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { iconTitle } from './desktopPrefs'

/**
 * Windows 7 right-click menus for the desktop, a desktop icon and the taskbar.
 * Pure data: the caller injects the actions, so the menus can be tested
 * without the window store or localStorage.
 */

/** Show the desktop: first press minimises, a second press restores what it hid. */
export function toggleShowDesktop(state) {
  const { zStack = [], windows = {}, minimizeAll, restoreDesktop } = state
  const anyVisible = zStack.some((id) => windows[id] && windows[id].state !== 'minimized')
  if (!anyVisible && restoreDesktop?.()) return
  minimizeAll?.()
}

export function buildDesktopMenu({ prefs, actions }) {
  return {
    label: 'Desktop context menu',
    items: [
      {
        id: 'view',
        label: '&View',
        items: [
          {
            id: 'view.icons',
            label: 'Show desktop &icons',
            checked: prefs.showIcons,
            onSelect: () => actions.setIconsShown(!prefs.showIcons),
          },
          {
            id: 'view.restore',
            label: '&Restore hidden icons',
            disabled: prefs.hidden.length === 0,
            onSelect: () => actions.restoreIcons(),
          },
        ],
      },
      {
        id: 'sort',
        label: '&Sort by',
        items: [
          {
            id: 'sort.name',
            label: '&Name',
            radio: true,
            checked: prefs.sort === 'name',
            onSelect: () => actions.setSort('name'),
          },
          {
            id: 'sort.manual',
            label: '&Desktop order',
            radio: true,
            checked: prefs.sort !== 'name',
            onSelect: () => actions.setSort('manual'),
          },
        ],
      },
      { id: 'refresh', label: '&Refresh', icon: RefreshCw, onSelect: () => actions.refresh() },
      { type: 'separator' },
      // Nexus desktops hold no user files, so there is nothing to create here.
      { id: 'new', label: '&New', disabled: true },
      { type: 'separator' },
      {
        id: 'resolution',
        label: 'Screen re&solution',
        icon: Monitor,
        onSelect: () => actions.openApp('settings'),
      },
      { id: 'personalize', label: '&Personalize', onSelect: () => actions.openApp('settings') },
    ],
  }
}

export function buildIconMenu({ appId, title, prefs, actions }) {
  const name = iconTitle(appId, prefs, title)
  return {
    label: `${name} context menu`,
    items: [
      { id: 'open', label: '&Open', bold: true, onSelect: () => actions.openApp(appId) },
      { type: 'separator' },
      {
        id: 'delete',
        label: '&Delete',
        hint: 'Del',
        icon: Trash2,
        onSelect: () => actions.hideIcon(appId),
      },
      {
        id: 'rename',
        label: 'Rena&me',
        hint: 'F2',
        icon: Pencil,
        onSelect: () => actions.rename(appId),
      },
    ],
  }
}

export function buildTaskbarMenu({ actions }) {
  return {
    label: 'Taskbar context menu',
    items: [
      {
        id: 'cascade',
        label: '&Cascade windows',
        icon: Layers,
        onSelect: () => actions.cascadeWindows(),
      },
      {
        id: 'showdesktop',
        label: 'Show the de&sktop',
        icon: Minus,
        onSelect: () => actions.showDesktop(),
      },
      { type: 'separator' },
      {
        id: 'taskmgr',
        label: 'Start &Task Manager',
        icon: Activity,
        onSelect: () => actions.openApp('sysmon'),
      },
      { type: 'separator' },
      // Lock the taskbar is shown for parity but has no behaviour yet.
      { id: 'lock', label: '&Lock the taskbar', checked: false, disabled: true },
    ],
  }
}
