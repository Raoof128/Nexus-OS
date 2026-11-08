import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useWindowStore } from '../stores/windowStore'

const API_URL = import.meta.env.VITE_API_URL

const WELCOME = [
  { type: 'system', text: '╔══════════════════════════════════════╗' },
  { type: 'system', text: '║  Nexus Terminal v2.1.0               ║' },
  { type: 'system', text: '║  Type "help" for available commands  ║' },
  { type: 'system', text: '╚══════════════════════════════════════╝' },
  { type: 'info', text: '' },
]

// Command Prompt style prompt, shown before the input and every echoed command.
const PROMPT = 'C:\\Users\\nexus>'

function buildCommands({ session, windows, zStack }) {
  const user = session?.user

  return {
    help: {
      description: 'Show available commands',
      run: () => ({
        type: 'info',
        text: `Available commands:\n${Object.entries(buildCommands({ session, windows, zStack }))
          .map(([name, cmd]) => `  ${name.padEnd(14)} ${cmd.description}`)
          .join('\n')}`,
      }),
    },
    whoami: {
      description: 'Show current user info',
      run: () => ({
        type: 'info',
        text: `email:    ${user?.email || '—'}\nid:       ${user?.id || '—'}\nprovider: ${user?.app_metadata?.provider || 'email'}`,
      }),
    },
    clear: {
      description: 'Clear terminal output',
      run: () => ({ type: 'clear' }),
    },
    date: {
      description: 'Show current date and time',
      run: () => ({ type: 'info', text: new Date().toString() }),
    },
    uptime: {
      description: 'Show page uptime',
      run: () => {
        const ms = performance.now()
        const secs = Math.floor(ms / 1000)
        const mins = Math.floor(secs / 60)
        const hrs = Math.floor(mins / 60)
        return { type: 'info', text: `up ${hrs}h ${mins % 60}m ${secs % 60}s` }
      },
    },
    windows: {
      description: 'List open windows',
      run: () => {
        const lines = zStack
          .map((id) => {
            const w = windows[id]
            return w ? `  ${w.windowId.padEnd(20)} ${w.title.padEnd(16)} [${w.state}]` : null
          })
          .filter(Boolean)
        return { type: 'info', text: lines.length > 0 ? lines.join('\n') : 'No windows open' }
      },
    },
    echo: {
      description: 'Echo text back',
      run: (args) => ({ type: 'info', text: args || '' }),
    },
    healthz: {
      description: 'Check API health',
      run: async () => {
        try {
          const start = performance.now()
          const res = await fetch(`${API_URL}/healthz`, { signal: AbortSignal.timeout(5000) })
          const latency = Math.round(performance.now() - start)
          if (res.ok) {
            return { type: 'success', text: `API is online (${latency}ms)` }
          }
          return { type: 'error', text: `API returned ${res.status} (${latency}ms)` }
        } catch (err) {
          return { type: 'error', text: `API unreachable: ${err.message}` }
        }
      },
    },
    neofetch: {
      description: 'Show system info',
      run: () => ({
        type: 'info',
        text: [
          `  ╔═══╗`,
          `  ║ N ║   nexus-os@v2.1.0`,
          `  ╚═══╝   ──────────────`,
          `          OS: Nexus Browser OS`,
          `          Shell: nexus-terminal`,
          `          Resolution: ${window.innerWidth}x${window.innerHeight}`,
          `          Browser: ${navigator.userAgent.split(' ').pop()}`,
          `          Windows: ${Object.keys(windows).length}`,
          `          User: ${user?.email ? user.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c) : '—'}`,
        ].join('\n'),
      }),
    },
  }
}

export default function TerminalApp({ windowId: _windowId }) {
  const { session } = useAuth()
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)

  const [lines, setLines] = useState(WELCOME)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const commandsRef = useRef(null)
  useLayoutEffect(() => {
    commandsRef.current = buildCommands({ session, windows, zStack })
  }, [session, windows, zStack])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  // Focus input on click anywhere
  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const executeCommand = useCallback(async (raw) => {
    const trimmed = raw.trim()
    if (!trimmed) return

    // Add command to output
    setLines((prev) => [...prev, { type: 'command', text: trimmed }])
    setHistory((prev) => [...prev, trimmed])
    setHistoryIdx(-1)
    setInput('')

    const [cmdName, ...argParts] = trimmed.split(/\s+/)
    const args = argParts.join(' ')
    const cmd = commandsRef.current[cmdName.toLowerCase()]

    if (!cmd) {
      setLines((prev) => [...prev, { type: 'error', text: `command not found: ${cmdName}` }])
      return
    }

    const maybePromise = cmd.run(args)
    const result = maybePromise instanceof Promise ? await maybePromise : maybePromise

    if (result.type === 'clear') {
      setLines([])
      return
    }

    setLines((prev) => [...prev, result])
  }, [])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        executeCommand(input)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (history.length === 0) return
        const newIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1)
        setHistoryIdx(newIdx)
        setInput(history[newIdx])
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (historyIdx === -1) return
        const newIdx = historyIdx + 1
        if (newIdx >= history.length) {
          setHistoryIdx(-1)
          setInput('')
        } else {
          setHistoryIdx(newIdx)
          setInput(history[newIdx])
        }
      }
    },
    [input, history, historyIdx, executeCommand],
  )

  const lineColors = {
    command: 'text-white',
    info: 'text-[#c0c0c0]',
    success: 'text-[#13a10e]',
    error: 'text-[#ff6b6b]',
    system: 'text-[#8ab4f8]',
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-black font-mono text-[14px] text-[#c0c0c0] selection:bg-white selection:text-black"
      onClick={handleContainerClick}
    >
      {/* Output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            {line.type === 'command' && (
              <span className="text-[#c0c0c0] select-none">{PROMPT}</span>
            )}
            <pre
              className={`whitespace-pre-wrap break-all font-mono ${lineColors[line.type] || 'text-[#c0c0c0]'}`}
            >
              {line.text}
            </pre>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex shrink-0 items-center bg-black px-2 py-1">
        <span className="text-[#c0c0c0] select-none">{PROMPT}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a command, or help"
          aria-label="Terminal command input"
          autoFocus
          className="h-auto flex-1 rounded-none border-0 bg-transparent p-0 font-mono text-[14px] text-[#c0c0c0] placeholder:text-[#6b6b6b] caret-[#c0c0c0] focus:outline-none"
          spellCheck={false}
        />
      </div>
    </div>
  )
}
