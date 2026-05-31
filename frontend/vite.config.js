import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    pool: 'forks',
    css: false,
    // EmailInbox.test.jsx requires >4GB heap due to lucide-react (45MB) + jsdom.
    // Run it separately: NODE_OPTIONS='--max-old-space-size=8192' npm test -- --run EmailInbox
    setupFiles: ['./vitest.setup.js'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/components/features/EmailInbox.test.jsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      // Focus coverage on the pure logic layers (lib + stores). Components are
      // exercised via render tests but their branch coverage is noisy, so we
      // don't gate on them.
      include: ['src/lib/**/*.js', 'src/os/stores/**/*.js', 'src/hooks/**/*.js'],
      exclude: ['**/*.test.{js,jsx}', 'src/lib/queryClient.js', 'src/lib/realtimeClient.js'],
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          observability: ['@sentry/react'],
          query: ['@tanstack/react-query'],
          ui: ['framer-motion', 'lucide-react'],
          state: ['zustand'],
        },
      },
    },
  },
})
