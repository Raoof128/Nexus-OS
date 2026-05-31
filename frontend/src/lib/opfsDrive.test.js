import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isOpfsSupported,
  isTextMime,
  formatBytes,
  writeBlob,
  readBlob,
  deleteBlob,
  estimateStorage,
  requestPersistentStorage,
} from './opfsDrive'

// ── Pure synchronous functions ──────────────────────────────────────────────

describe('isOpfsSupported', () => {
  it('returns falsy in jsdom (no navigator.storage.getDirectory)', () => {
    // jsdom does not implement OPFS. The && chain returns the first falsy
    // operand (undefined for navigator.storage), not a boolean false.
    expect(isOpfsSupported()).toBeFalsy()
  })
})

describe('isTextMime', () => {
  it.each([
    ['text/plain', true],
    ['text/html', true],
    ['text/css', true],
    ['application/json', true],
    ['application/javascript', true],
    ['text/csv', true],
    ['application/x-yaml', true],
    ['application/xml', true],
    ['text/markdown', true],
    ['application/octet-stream', false],
    ['image/png', false],
    ['image/jpeg', false],
    ['video/mp4', false],
    ['audio/mpeg', false],
    ['', false],
  ])('isTextMime(%s) === %s', (mime, expected) => {
    expect(isTextMime(mime)).toBe(expected)
  })

  it('uses the default empty string when called with no argument', () => {
    expect(isTextMime()).toBe(false)
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [null, '0 B'],
    [undefined, '0 B'],
    [-1, '0 B'],
    [1, '1 B'],
    [512, '512 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1048576, '1.0 MB'],
    [1572864, '1.5 MB'],
    [1073741824, '1.0 GB'],
    [1099511627776, '1.0 TB'],
  ])('formatBytes(%s) === %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

// ── Async OPFS operations — "unavailable" paths (jsdom has no OPFS) ─────────
// These tests verify that every async function degrades gracefully to a safe
// sentinel (false / null) when OPFS is unavailable.

describe('writeBlob — OPFS unavailable', () => {
  it('returns false without throwing', async () => {
    expect(await writeBlob('x', new Blob(['hello']))).toBe(false)
  })
})

describe('readBlob — OPFS unavailable', () => {
  it('returns null without throwing', async () => {
    expect(await readBlob('x')).toBeNull()
  })
})

describe('deleteBlob — OPFS unavailable', () => {
  it('returns false without throwing', async () => {
    expect(await deleteBlob('x')).toBe(false)
  })
})

// ── estimateStorage ──────────────────────────────────────────────────────────

describe('estimateStorage', () => {
  let originalStorage

  beforeEach(() => {
    originalStorage = navigator.storage
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      writable: true,
      configurable: true,
    })
  })

  it('returns null when navigator.storage.estimate is absent', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {},
      writable: true,
      configurable: true,
    })
    expect(await estimateStorage()).toBeNull()
  })

  it('returns usage and quota when estimate is available', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: vi.fn().mockResolvedValue({ usage: 1024, quota: 2048 }) },
      writable: true,
      configurable: true,
    })
    const result = await estimateStorage()
    expect(result).toEqual({ usage: 1024, quota: 2048 })
  })

  it('returns null when navigator.storage is absent', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: null,
      writable: true,
      configurable: true,
    })
    expect(await estimateStorage()).toBeNull()
  })

  it('returns null when estimate rejects', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
    })
    expect(await estimateStorage()).toBeNull()
  })
})

// ── requestPersistentStorage ─────────────────────────────────────────────────

describe('requestPersistentStorage', () => {
  let originalStorage

  beforeEach(() => {
    originalStorage = navigator.storage
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'storage', {
      value: originalStorage,
      writable: true,
      configurable: true,
    })
  })

  it('returns false when navigator.storage.persist is absent', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {},
      writable: true,
      configurable: true,
    })
    expect(await requestPersistentStorage()).toBe(false)
  })

  it('returns true immediately when storage is already persisted', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        persisted: vi.fn().mockResolvedValue(true),
        persist: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
    const result = await requestPersistentStorage()
    expect(result).toBe(true)
  })

  it('calls persist() when not already persisted and returns its result', async () => {
    const mockPersist = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'storage', {
      value: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: mockPersist,
      },
      writable: true,
      configurable: true,
    })
    const result = await requestPersistentStorage()
    expect(mockPersist).toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('returns false when persist() rejects', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: vi.fn().mockRejectedValue(new Error('denied')),
      },
      writable: true,
      configurable: true,
    })
    expect(await requestPersistentStorage()).toBe(false)
  })
})
