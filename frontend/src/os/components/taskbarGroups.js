import { APP_REGISTRY } from '../stores/appRegistry'

// Windows of one program share one taskbar button (Win7 "Always combine").
// Shared by the Taskbar and the Win+1..8 shortcuts so both number the same
// buttons. Object.values keeps launch order, which is the taskbar order.
export function groupWindowsByApp(windows) {
  const byApp = new Map()
  for (const win of Object.values(windows)) {
    const key = win.appId ?? win.windowId
    let group = byApp.get(key)
    if (!group) {
      group = {
        key,
        appId: win.appId,
        title: APP_REGISTRY[win.appId]?.title || win.title || key,
        windows: [],
      }
      byApp.set(key, group)
    }
    group.windows.push(win)
  }
  return Array.from(byApp.values())
}
