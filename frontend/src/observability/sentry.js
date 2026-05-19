import * as Sentry from '@sentry/react'

const sentryDsn = import.meta.env.VITE_SENTRY_DSN
const tracesSampleRate = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0')
const SENSITIVE_RECOVERY_KEYS = ['access_token', 'refresh_token']

let initialized = false

function sanitizeUrl(rawUrl) {
  if (!rawUrl) {
    return rawUrl
  }

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://localhost'
    const url = new URL(rawUrl, baseOrigin)
    let changed = false

    for (const key of SENSITIVE_RECOVERY_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key)
        changed = true
      }
    }

    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))
    for (const key of ['type', ...SENSITIVE_RECOVERY_KEYS]) {
      if (hashParams.has(key)) {
        hashParams.delete(key)
        changed = true
      }
    }

    if (changed) {
      const nextHash = hashParams.toString()
      url.hash = nextHash ? `#${nextHash}` : ''
    }

    return url.toString()
  } catch {
    return rawUrl
  }
}

export function initializeSentry() {
  if (initialized || !sentryDsn) {
    return
  }

  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate,
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb?.data?.url) {
        breadcrumb.data.url = sanitizeUrl(breadcrumb.data.url)
      }
      return breadcrumb
    },
    beforeSend(event) {
      if (event.request?.url) {
        event.request.url = sanitizeUrl(event.request.url)
      }
      if (event.request?.headers?.Referer) {
        event.request.headers.Referer = sanitizeUrl(event.request.headers.Referer)
      }
      return event
    },
  })
  initialized = true
}
