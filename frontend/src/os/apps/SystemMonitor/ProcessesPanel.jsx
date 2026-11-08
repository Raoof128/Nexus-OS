import { APP_REGISTRY } from '../../stores/appRegistry'
import { DataRow } from './shared'

// Processes tab: one row per running app window. The Name column shows the
// app's registry title, never its internal id. The visible count moved here
// from the old status bar, so no figure was lost in the layout change.
export default function ProcessesPanel({ windows, userName }) {
  const visible = windows.filter((w) => w.state !== 'minimized').length
  return (
    <>
      <table aria-label="Processes" className="w-full">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Window title</th>
            <th scope="col">User name</th>
          </tr>
        </thead>
        <tbody>
          {windows.length > 0 ? (
            windows.map((w) => (
              <tr key={w.windowId}>
                <td>{APP_REGISTRY[w.appId]?.title ?? w.title}</td>
                <td>{w.title}</td>
                <td>{userName}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3}>No app windows are open.</td>
            </tr>
          )}
        </tbody>
      </table>
      <fieldset className="mt-3">
        <legend>Windows</legend>
        <DataRow label="Visible" value={`${visible} of ${windows.length}`} />
      </fieldset>
    </>
  )
}
