import { useNotificationStore } from '../../stores/notificationStore'
import SettingsGroup from './SettingsGroup'

export default function NotificationsPanel() {
  const doNotDisturb = useNotificationStore((s) => s.doNotDisturb)
  const toggleDoNotDisturb = useNotificationStore((s) => s.toggleDoNotDisturb)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const notifications = useNotificationStore((s) => s.notifications)
  const unread = notifications.filter((n) => !n.read).length

  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup legend="Do not disturb">
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="notifications-dnd"
            checked={doNotDisturb}
            onChange={toggleDoNotDisturb}
          />
          <label htmlFor="notifications-dnd">
            Hide toast pop-ups (notifications are still kept in the notification center)
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup legend="History">
        <div className="flex flex-col gap-2 pt-2">
          <p>
            {notifications.length} total · {unread} unread
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={markAllRead} className="w7-btn">
              Mark all as read
            </button>
            <button type="button" onClick={clearAll} className="w7-btn">
              Clear all
            </button>
          </div>
        </div>
      </SettingsGroup>
    </div>
  )
}
