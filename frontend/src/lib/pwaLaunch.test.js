import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { consumeShareTarget, consumeFileHandlers } from './pwaLaunch'

const NOTES_KEY = 'nexus-os:notes'

function setUrl(search) {
  window.history.replaceState({}, '', search)
}

beforeEach(() => {
  localStorage.clear()
  setUrl('/')
})

afterEach(() => {
  delete window.launchQueue
  vi.restoreAllMocks()
})

// ── consumeShareTarget ────────────────────────────────────────────────────────

describe('consumeShareTarget', () => {
  it('returns null when there is no share-target param', () => {
    setUrl('/?app=notes')
    expect(consumeShareTarget()).toBeNull()
  })

  it('returns "notes" and appends shared text to the Notes buffer', () => {
    setUrl('/?share-target=1&title=Hello&text=World&url=https://example.com')
    const result = consumeShareTarget()
    expect(result).toBe('notes')
    const notes = localStorage.getItem(NOTES_KEY)
    expect(notes).toContain('Hello')
    expect(notes).toContain('World')
    expect(notes).toContain('https://example.com')
  })

  it('appends to existing notes rather than overwriting', () => {
    localStorage.setItem(NOTES_KEY, 'existing content')
    setUrl('/?share-target=1&text=new+stuff')
    consumeShareTarget()
    const notes = localStorage.getItem(NOTES_KEY)
    expect(notes).toContain('existing content')
    expect(notes).toContain('new stuff')
  })

  it('strips the share params from the URL after consuming', () => {
    setUrl('/?share-target=1&text=hi&app=keep')
    consumeShareTarget()
    const params = new URLSearchParams(window.location.search)
    expect(params.has('share-target')).toBe(false)
    expect(params.has('text')).toBe(false)
    // unrelated params are preserved
    expect(params.get('app')).toBe('keep')
  })

  it('still returns "notes" even when all shared fields are empty', () => {
    setUrl('/?share-target=1')
    expect(consumeShareTarget()).toBe('notes')
    // nothing written when there's no content
    expect(localStorage.getItem(NOTES_KEY)).toBeNull()
  })
})

// ── consumeFileHandlers ───────────────────────────────────────────────────────

describe('consumeFileHandlers', () => {
  it('no-ops when launchQueue is unavailable', () => {
    const openApp = vi.fn()
    const importFile = vi.fn()
    expect(() => consumeFileHandlers({ openApp, importFile })).not.toThrow()
    expect(openApp).not.toHaveBeenCalled()
  })

  it('registers a launchQueue consumer when the API is present', () => {
    const setConsumer = vi.fn()
    window.launchQueue = { setConsumer }
    consumeFileHandlers({ openApp: vi.fn(), importFile: vi.fn() })
    expect(setConsumer).toHaveBeenCalledWith(expect.any(Function))
  })

  it('imports delivered files into /downloads and opens the File Manager', async () => {
    let consumer
    window.launchQueue = {
      setConsumer: (fn) => {
        consumer = fn
      },
    }
    const openApp = vi.fn()
    const importFile = vi.fn().mockResolvedValue('/downloads/report.txt')

    consumeFileHandlers({ openApp, importFile })

    const fakeFile = { name: 'report.txt' }
    const handle = { getFile: vi.fn().mockResolvedValue(fakeFile) }
    await consumer({ files: [handle] })

    expect(importFile).toHaveBeenCalledWith('/downloads', fakeFile)
    expect(openApp).toHaveBeenCalledWith('files')
  })

  it('does not open the File Manager when no files are delivered', async () => {
    let consumer
    window.launchQueue = {
      setConsumer: (fn) => {
        consumer = fn
      },
    }
    const openApp = vi.fn()
    consumeFileHandlers({ openApp, importFile: vi.fn() })

    await consumer({ files: [] })
    expect(openApp).not.toHaveBeenCalled()
  })

  it('skips files that fail to read but still processes the rest', async () => {
    let consumer
    window.launchQueue = {
      setConsumer: (fn) => {
        consumer = fn
      },
    }
    const openApp = vi.fn()
    const importFile = vi.fn().mockResolvedValue('/downloads/ok.txt')

    consumeFileHandlers({ openApp, importFile })

    const badHandle = { getFile: vi.fn().mockRejectedValue(new Error('locked')) }
    const goodHandle = { getFile: vi.fn().mockResolvedValue({ name: 'ok.txt' }) }
    await consumer({ files: [badHandle, goodHandle] })

    expect(importFile).toHaveBeenCalledTimes(1)
    expect(openApp).toHaveBeenCalledWith('files')
  })
})
