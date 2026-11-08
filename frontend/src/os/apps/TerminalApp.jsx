import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useWindowStore } from '../stores/windowStore'

const API_URL = import.meta.env.VITE_API_URL

const WELCOME = [
  { type: 'info', text: '╔══════════════════════════════════════╗' },
  { type: 'info', text: '║  Nexus Terminal v2.1.0               ║' },
  { type: 'info', text: '║  Type "help" for available commands  ║' },
  { type: 'info', text: '╚══════════════════════════════════════╝' },
  { type: 'info', text: '' },
]

// Command Prompt style prompt, shown before the input and every echoed command.
const PROMPT = 'C:\\Users\\nexus>'

// cmd.exe prints all output, command echoes and errors in the same light grey
// on black. `type` on a line is kept for the command logic (clear, API results)
// but no longer changes its colour.
const LINE_CLASS = 'text-[#c0c0c0]'

const HOSTNAME = 'NEXUS-PC'
const VERSION_LINE = 'Nexus OS [Version 2.1.0]'

function unrecognisedCommandMessage(name) {
  return `'${name}' is not recognized as an internal or external command,\noperable program or batch file.`
}

/**
 * The command table. Each entry has a `name`, optional `aliases` that also
 * resolve to it (`clear` still works as an alias of `cls`), and `run`.
 */
function commandList(ctx) {
  const { session, windows, zStack } = ctx
  const user = session?.user

  return [
    {
      name: 'cls',
      aliases: ['clear'],
      description: 'Clear the screen',
      run: () => ({ type: 'clear' }),
    },
    {
      name: 'help',
      description: 'Provide help information for commands',
      run: (args) => {
        const table = buildCommandMap(ctx)
        const wanted = args.trim().toLowerCase()
        if (!wanted) {
          const lines = uniqueCommands(table).map(
            (cmd) => `${cmd.name.padEnd(12)} ${cmd.description}`,
          )
          return {
            type: 'info',
            text: `For more information on a specific command, type HELP command-name\n${lines.join('\n')}`,
          }
        }
        const cmd = table[wanted]
        if (!cmd) {
          return {
            type: 'info',
            text: `This command is not supported by the help utility. Try "help" for the list.`,
          }
        }
        const aliases = (cmd.aliases ?? []).length
          ? `\nAlso known as: ${cmd.aliases.join(', ')}`
          : ''
        return { type: 'info', text: `${cmd.name.toUpperCase()}  ${cmd.description}${aliases}` }
      },
    },
    {
      name: 'ver',
      description: 'Display the operating system version',
      run: () => ({ type: 'info', text: VERSION_LINE }),
    },
    {
      name: 'hostname',
      description: 'Display the computer name',
      run: () => ({ type: 'info', text: HOSTNAME }),
    },
    {
      name: 'whoami',
      description: 'Show current user info',
      run: () => ({
        type: 'info',
        text: `email:    ${user?.email || '—'}\nid:       ${user?.id || '—'}\nprovider: ${user?.app_metadata?.provider || 'email'}`,
      }),
    },
    {
      name: 'date',
      description: 'Show current date and time',
      run: () => ({ type: 'info', text: new Date().toString() }),
    },
    {
      name: 'uptime',
      description: 'Show page uptime',
      run: () => {
        const ms = performance.now()
        const secs = Math.floor(ms / 1000)
        const mins = Math.floor(secs / 60)
        const hrs = Math.floor(mins / 60)
        return { type: 'info', text: `up ${hrs}h ${mins % 60}m ${secs % 60}s` }
      },
    },
    {
      name: 'windows',
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
    {
      name: 'echo',
      description: 'Display a line of text',
      run: (args) => ({ type: 'info', text: args || '' }),
    },
    {
      name: 'healthz',
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
    {
      name: 'neofetch',
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
  ]
}

/**
 * Maps every command name and alias to its command entry. The map has no
 * prototype, so typing `constructor` or `toString` is "not recognized" rather
 * than resolving to an Object method.
 */
function buildCommandMap(ctx) {
  const map = Object.create(null)
  for (const cmd of commandList(ctx)) {
    map[cmd.name] = cmd
    for (const alias of cmd.aliases ?? []) map[alias] = cmd
  }
  return map
}

/** Each command once, alphabetical, as `help` lists them. */
function uniqueCommands(map) {
  return [...new Set(Object.values(map))].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Tab completion for the command name at the start of the line. A single match
 * completes with a trailing space; several matches complete to their common
 * prefix. Anything after the first word is left alone.
 */
function completeCommandName(value, names) {
  const match = /^(\s*)(\S*)$/.exec(value)
  if (!match) return value
  const [, lead, typed] = match
  const prefix = typed.toLowerCase()
  const hits = names.filter((name) => name.startsWith(prefix)).sort()
  if (hits.length === 0) return value
  if (hits.length === 1) return `${lead}${hits[0]} `
  let common = hits[0]
  for (const hit of hits) {
    while (!hit.startsWith(common)) common = common.slice(0, -1)
  }
  return common.length > typed.length ? `${lead}${common}` : value
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
    commandsRef.current = buildCommandMap({ session, windows, zStack })
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
      setLines((prev) => [...prev, { type: 'error', text: unrecognisedCommandMessage(cmdName) }])
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
      } else if (e.key === 'Escape') {
        // cmd.exe: Esc cancels the line being typed.
        e.preventDefault()
        setInput('')
        setHistoryIdx(-1)
      } else if (e.key === 'Tab') {
        // Keep focus in the terminal and complete the command name instead.
        e.preventDefault()
        const names = Object.keys(commandsRef.current ?? {})
        setInput((current) => completeCommandName(current, names))
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

  return (
    <div
      className="flex h-full w-full flex-col bg-black font-mono text-[14px] text-[#c0c0c0] selection:bg-white selection:text-black focus-within:outline focus-within:-outline-offset-2 focus-within:outline-1 focus-within:outline-dotted focus-within:outline-[#c0c0c0]"
      onClick={handleContainerClick}
    >
      {/* Output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            {line.type === 'command' && (
              <span className={`select-none ${LINE_CLASS}`}>{PROMPT}</span>
            )}
            <pre className={`whitespace-pre-wrap break-all font-mono ${LINE_CLASS}`}>
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
