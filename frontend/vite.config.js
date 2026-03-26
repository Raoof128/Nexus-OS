import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          observability: ['@sentry/react'],
          query: ['@tanstack/react-query'],
          ui: ['framer-motion', 'lucide-react'],
        },
      },
    },
  },
})
