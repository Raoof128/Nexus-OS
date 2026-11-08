import { DataRow, ServiceStatus } from './shared'

// Services tab: each row reports a state derived from a real signal.
export default function ServicesPanel({
  apiState,
  apiLatency,
  lastCheck,
  apiChecking,
  onCheckNow,
  realtimeState,
  sessionState,
}) {
  return (
    <>
      <table aria-label="Services" className="w-full">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Description</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Nexus API</td>
            <td>Health check of the API endpoint</td>
            <td>
              <ServiceStatus state={apiState} />
            </td>
          </tr>
          <tr>
            <td>Realtime sync</td>
            <td>Live updates over a WebSocket, idle until a list subscribes</td>
            <td>
              <ServiceStatus state={realtimeState} />
            </td>
          </tr>
          <tr>
            <td>Sign-in session</td>
            <td>Your account session in this browser</td>
            <td>
              <ServiceStatus state={sessionState} />
            </td>
          </tr>
        </tbody>
      </table>

      <fieldset className="mt-3">
        <legend>API check</legend>
        <DataRow label="Latency" value={apiLatency != null ? `${apiLatency} ms` : '—'} />
        <DataRow label="Endpoint" value="/healthz" />
        <DataRow label="Last check" value={lastCheck || '—'} />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="w7-btn pointer-coarse:min-h-11"
            disabled={apiChecking}
            onClick={onCheckNow}
          >
            Check now
          </button>
        </div>
      </fieldset>

      <fieldset className="mt-3">
        <legend>Realtime</legend>
        <DataRow label="Protocol" value="WebSocket" />
        <DataRow label="Provider" value="Supabase" />
      </fieldset>
    </>
  )
}
