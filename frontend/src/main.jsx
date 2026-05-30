import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { queryClient } from './lib/queryClient.js'
import { bootstrapRecoveryTokens } from './lib/recoveryTokens.js'
import { initializeSentry } from './observability/sentry.js'
import { registerServiceWorker } from './lib/registerServiceWorker.js'
import './index.css'

try {
  bootstrapRecoveryTokens()
} catch {
  // silently ignore — token extraction failed
}
initializeSentry()
registerServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Sentry.ErrorBoundary fallback={<p role="alert">Unexpected application error.</p>}>
        <AuthProvider>
          <MotionConfig reducedMotion="user">
            <App />
          </MotionConfig>
        </AuthProvider>
      </Sentry.ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
)
