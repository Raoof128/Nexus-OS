import SettingsGroup from './SettingsGroup'
import { SHORTCUTS } from './constants'

export default function SystemPanel() {
  return (
    <div className="flex flex-col gap-4">
      <SettingsGroup legend="Nexus OS">
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 pt-2 text-[12px]">
          <dt className="text-muted-foreground">Version</dt>
          <dd>2.1.0</dd>
          <dt className="text-muted-foreground">Edition</dt>
          <dd>Production</dd>
          <dt className="text-muted-foreground">About</dt>
          <dd>A browser desktop for your media vault, email, and AI chat.</dd>
        </dl>
      </SettingsGroup>

      <SettingsGroup legend="Keyboard shortcuts">
        <table className="mt-2 w-full text-[12px]">
          <thead>
            <tr>
              <th scope="col" className="text-left font-normal">
                Shortcut
              </th>
              <th scope="col" className="text-left font-normal">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td>
                  <kbd className="rounded-[3px] border border-border bg-w7-surface px-1.5 py-px text-[12px]">
                    {s.keys}
                  </kbd>
                </td>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SettingsGroup>
    </div>
  )
}
