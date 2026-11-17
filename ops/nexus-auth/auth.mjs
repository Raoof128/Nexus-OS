import { createServer } from 'node:http'
import { compare } from 'bcryptjs'
import { betterAuth } from 'better-auth'
import { verifyPassword } from 'better-auth/crypto'
import { getMigrations } from 'better-auth/db/migration'
import { toNodeHandler } from 'better-auth/node'
import pg from 'pg'

const {
  NEXUS_AUTH_INTERNAL_ORIGIN, NEXUS_PUBLIC_ORIGIN, NEXUS_AUTH_DATABASE_URL,
  BETTER_AUTH_SECRET, NEXUS_ACCOUNT_MAIL_URL, NEXUS_ACCOUNT_MAIL_KEY,
} = process.env
const internal = new URL(NEXUS_AUTH_INTERNAL_ORIGIN)
const publicOrigin = new URL(NEXUS_PUBLIC_ORIGIN)
const mailer = new URL(NEXUS_ACCOUNT_MAIL_URL)
if (publicOrigin.protocol !== 'https:' || mailer.protocol !== 'https:' ||
    !internal.port || !NEXUS_AUTH_DATABASE_URL ||
    (BETTER_AUTH_SECRET?.length ?? 0) < 32 || (NEXUS_ACCOUNT_MAIL_KEY?.length ?? 0) < 32) {
  throw new Error('Invalid production auth configuration')
}

async function sendAccountMail(kind, email, token) {
  const response = await fetch(mailer, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NEXUS_ACCOUNT_MAIL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ kind, email, token }),
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  })
  if (response.status !== 204) throw new Error('Nexus account email unavailable')
}

const database = new pg.Pool({
  connectionString: NEXUS_AUTH_DATABASE_URL,
  options: '-c search_path=auth',
  max: 3,
  connectionTimeoutMillis: 3000,
})

const auth = betterAuth({
  appName: 'Nexus OS',
  baseURL: internal.origin,
  trustedOrigins: [internal.origin, publicOrigin.origin],
  database,
  secret: BETTER_AUTH_SECRET,
  advanced: { database: { generateId: 'uuid' }, useSecureCookies: true },
  user: { modelName: 'users' },
  session: { cookieCache: { enabled: false } },
  rateLimit: { enabled: false }, // Litestar owns throttling on the only public ingress.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
    revokeSessionsOnPasswordReset: true,
    password: {
      verify: ({ hash, password }) => /^\$2[aby]\$/.test(hash)
        ? compare(password, hash)
        : verifyPassword({ hash, password }),
    },
    async sendResetPassword({ user, token }) {
      await sendAccountMail('reset', user.email, token)
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: false,
    async sendVerificationEmail({ user, token }) {
      await sendAccountMail('verify', user.email, token)
    },
  },
  logger: { disabled: true },
})

if (process.argv[2] === '--migrate') {
  try {
    const { runMigrations } = await getMigrations(auth.options)
    await runMigrations()
  } finally {
    await database.end()
  }
} else {
  const server = createServer(toNodeHandler(auth))
  server.requestTimeout = 15000
  server.listen(Number(internal.port), '0.0.0.0')
  process.on('SIGTERM', () => server.close(() => void database.end()))
}
