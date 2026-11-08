import { vi } from 'vitest'

// Mock environment variables for tests
vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder-project.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'placeholder-anon-key')
vi.stubEnv('VITE_API_URL', 'https://api.nexus-os.local')
vi.stubEnv('VITE_AION_SUPABASE_URL', 'https://test-aion.supabase.co')
vi.stubEnv('VITE_AION_SUPABASE_ANON_KEY', 'test-aion-anon-key')

// Node 24 exposes an experimental localStorage getter that warns unless it was
// started with --localstorage-file. Replace it without reading the getter so
// tests stay deterministic and warning-free in both Node and jsdom.
const storage = new Map()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    clear: () => storage.clear(),
    getItem: (key) => storage.get(String(key)) ?? null,
    removeItem: (key) => storage.delete(String(key)),
    setItem: (key, value) => storage.set(String(key), String(value)),
    // Full Storage interface: code that enumerates keys needs these too.
    key: (index) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size
    },
  },
  configurable: true,
})

Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
})

// ResizeObserver is missing in jsdom. A real class (not vi.fn with an arrow
// implementation): Vitest 4 refuses `new` on arrow-implemented mocks, and a
// class keeps its methods when a test calls vi.restoreAllMocks().
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
