import { defineConfig, devices } from '@playwright/test'

// E2E + visual checks for the Windows 7 desktop. The backend is never
// contacted: e2e/fixtures.js intercepts every API call with canned data, and
// the Supabase values below are inert placeholders (Realtime simply fails to
// connect). Run: `npm run test:e2e`.
const PORT = 4173

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
      grep: /@mobile/,
    },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      VITE_API_URL: 'http://127.0.0.1:8799',
      VITE_SUPABASE_URL: 'http://127.0.0.1:8798',
      VITE_SUPABASE_ANON_KEY: 'e2e-placeholder-anon-key', // gitleaks:allow (fake e2e placeholder)
      VITE_AION_SUPABASE_URL: 'http://127.0.0.1:8798',
      VITE_AION_SUPABASE_ANON_KEY: 'e2e-placeholder-anon-key', // gitleaks:allow (fake e2e placeholder)
    },
  },
})
