import { DataRow } from './shared'

// Networking tab: a single browser connection, using only what the browser
// actually reports (online state and the Network Information estimates).
export default function NetworkingPanel({ online, connection }) {
  const downlink = connection?.downlink ? `${connection.downlink} Mbps (estimated)` : '—'
  const rtt = connection?.rtt != null ? `${connection.rtt} ms (estimated)` : '—'
  return (
    <>
      <table aria-label="Network connections" className="w-full">
        <thead>
          <tr>
            <th scope="col">Adapter name</th>
            <th scope="col">Link speed</th>
            <th scope="col">Connection type</th>
            <th scope="col">State</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Browser network</td>
            <td>{downlink}</td>
            <td>{connection?.effectiveType || '—'}</td>
            <td>{online ? 'Connected' : 'Disconnected'}</td>
          </tr>
        </tbody>
      </table>
      <fieldset className="mt-3">
        <legend>Details</legend>
        <DataRow label="Round-trip time" value={rtt} />
      </fieldset>
    </>
  )
}
