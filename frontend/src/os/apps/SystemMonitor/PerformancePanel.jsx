import { formatDeviceMemory, formatPercent } from './format'
import { DataRow, Gauge, HistoryGraph } from './shared'

// Performance tab in the Windows 7 layout: CPU, physical memory, then the
// browser-only heap figures. Each group says plainly what it can measure.
export default function PerformancePanel({ cpu, heap, deviceMemoryGb }) {
  return (
    <div className="space-y-3">
      <fieldset>
        <legend>Page CPU (est.)</legend>
        {cpu.supported ? (
          <>
            <p className="text-[22px] leading-none text-foreground">{formatPercent(cpu.current)}</p>
            <p className="mt-1 text-muted-foreground">
              Estimated from this page&apos;s main thread, not the whole computer.
            </p>
            <Gauge label="Page CPU (est.)" value={cpu.current} />
            <HistoryGraph label="Page CPU (est.) history" values={cpu.history} />
          </>
        ) : (
          <p className="text-muted-foreground">Page CPU is not available in this browser.</p>
        )}
      </fieldset>

      <fieldset>
        <legend>Physical memory</legend>
        <DataRow label="Installed (approx.)" value={formatDeviceMemory(deviceMemoryGb)} />
        <DataRow label="In use" value="Not reported by browsers" />
      </fieldset>

      <fieldset>
        <legend>Browser memory (Chrome only)</legend>
        {heap ? (
          <>
            <p className="mb-1 text-foreground">{heap.percent}% of the JavaScript heap limit</p>
            <Gauge label="JavaScript heap usage" value={heap.percent} />
            <HistoryGraph label="JavaScript heap history" values={heap.history} />
            <DataRow label="JavaScript heap used" value={heap.used} />
            <DataRow label="JavaScript heap limit" value={heap.limit} />
          </>
        ) : (
          <p className="text-muted-foreground">Browser memory is not available in this browser.</p>
        )}
      </fieldset>
    </div>
  )
}
