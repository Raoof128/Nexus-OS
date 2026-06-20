import { vi } from 'vitest'

// Mock environment variables for tests
vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder-project.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'placeholder-anon-key')
vi.stubEnv('VITE_API_URL', 'https://api.nexus-os.local')
vi.stubEnv('VITE_AION_SUPABASE_URL', 'https://test-aion.supabase.co')
vi.stubEnv('VITE_AION_SUPABASE_ANON_KEY', 'test-aion-anon-key')

if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      clear: () => storage.clear(),
      getItem: (key) => storage.get(String(key)) ?? null,
      removeItem: (key) => storage.delete(String(key)),
      setItem: (key, value) => storage.set(String(key), String(value)),
    },
    configurable: true,
  })
}

// Mock ResizeObserver which is missing in jsdom
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

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
