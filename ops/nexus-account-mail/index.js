const origin = 'https://home-notes-app.uk'
const sender = 'account@auth-mail.home-notes-app.uk'
const encoder = new TextEncoder()

async function authorized(request, key) {
  const auth = request.headers.get('Authorization') ?? ''
  if (!key || auth.length > 128) return false
  const digest = (value) => crypto.subtle.digest('SHA-256', encoder.encode(value))
  const [provided, expected] = await Promise.all([digest(auth), digest(`Bearer ${key}`)])
  return crypto.subtle.timingSafeEqual(provided, expected)
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/send') {
      return new Response(null, { status: 404 })
    }
    if (!await authorized(request, env.NEXUS_ACCOUNT_MAIL_KEY)) {
      return new Response(null, { status: 401 })
    }
    const body = await request.json().catch(() => null)
    if (!body || !['reset', 'verify'].includes(body.kind) ||
        typeof body.email !== 'string' || body.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+$/.test(body.email) ||
        typeof body.token !== 'string' || !/^[\w.-]{1,2048}$/.test(body.token)) {
      return new Response(null, { status: 400 })
    }
    const reset = body.kind === 'reset'
    const url = new URL('/', origin)
    url.searchParams.set('type', reset ? 'recovery' : 'verify')
    url.searchParams.set('token', body.token)
    const action = reset ? 'Reset your Nexus password' : 'Verify your Nexus email address'
    try {
      await env.NEXUS_MAIL.send({
        from: sender,
        to: body.email,
        subject: action,
        text: `${action} using the link below.\n\n${url}\n\nYou can ignore this if you did not request it.`,
      })
      return new Response(null, { status: 204 })
    } catch {
      return new Response(null, { status: 502 })
    }
  },
}
