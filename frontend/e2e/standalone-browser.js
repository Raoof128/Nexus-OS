// Run by the PostgreSQL and Better Auth rehearsal against the real Nexus API.
import { chromium, expect } from '@playwright/test'

const {
  NEXUS_E2E_ORIGIN: origin,
  NEXUS_E2E_API: api,
  NEXUS_E2E_EMAIL: email,
  NEXUS_E2E_PASSWORD: password,
  NEXUS_E2E_RESET_URL: resetUrl,
} = process.env
const requestHeaders = { Origin: origin, 'X-Requested-With': 'XMLHttpRequest' }
const browser = await chromium.launch()

try {
  const context = await browser.newContext({
    baseURL: origin,
    timezoneId: 'Australia/Sydney',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  })
  context.setDefaultTimeout(10_000)
  // Fixture data stays on the two loopback services. API calls are forwarded as-is.
  await context.route('**/*', (route) => {
    const target = new URL(route.request().url()).origin
    return [origin, api].includes(target) ? route.continue() : route.abort()
  })
  await context.addInitScript(() => {
    sessionStorage.setItem('nexus_booted', '1')
    Object.defineProperty(document, 'hidden', { get: () => false })
  })
  const page = await context.newPage()
  await page.goto(resetUrl)
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  if (new URL(page.url()).search) throw new Error('Recovery token was left in the address bar')
  await page.getByLabel('New password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Set new password' }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  const media = page.getByRole('region', { name: 'Media Vault', exact: true })
  await expect(media).toBeVisible()
  const data = { type: 'book', title: 'Standalone browser book', creator: 'Example author' }
  const mediaResponse = await context.request.post(`${api}/media`, {
    data,
    headers: requestHeaders,
  })
  expect(mediaResponse.status()).toBe(201)
  await page.reload()
  await expect(media.getByText(data.title, { exact: true })).toBeVisible()

  await page.goto('/?app=email')
  const mail = page.getByRole('region', { name: 'Email', exact: true })
  await expect(mail.getByText('Rehearsal 100%', { exact: true })).toBeVisible()
  await mail
    .getByRole('combobox', { name: 'Select email account' })
    .selectOption({ label: 'Gmail — fixture@example.com' })
  await expect(mail.getByText('Rehearsal 100%', { exact: true })).toBeVisible()

  const chatData = { title: 'Standalone browser conversation' }
  const chatResponse = await context.request.post(`${api}/chat/sessions`, {
    data: chatData,
    headers: requestHeaders,
  })
  expect(chatResponse.status()).toBe(201)
  await page.goto('/?app=chat')
  const chat = page.getByRole('region', { name: 'AI Chat', exact: true })
  await expect(chat.getByText(chatData.title, { exact: true })).toBeVisible()

  await page.goto('/?app=notes')
  const editor = page.getByRole('textbox', { name: 'Note editor', exact: true })
  await editor.fill('Standalone browser note')
  await expect(editor).toHaveValue('Standalone browser note')

  await page.goto('/?app=settings')
  const settings = page.getByRole('region', { name: 'Control Panel', exact: true })
  const frame = settings.locator('.title-bar')
  await settings.getByRole('button', { name: 'Leaf', exact: true }).click()
  await expect
    .poll(() =>
      frame.evaluate((el) => getComputedStyle(el.parentElement, '::before').backgroundColor),
    )
    .toBe('rgb(76, 143, 58)')
  await settings.getByRole('button', { name: 'Wallpaper 3', exact: true }).click()
  await settings.getByRole('button', { name: 'Save changes', exact: true }).click()
  await page.reload()
  await expect(page.locator('.nx-wallpaper-aero')).toHaveCSS('background-image', /W3\.jpg/)

  const listResponse = await context.request.post(`${api}/api/tasks/lists`, {
    data: { name: 'Standalone browser list' },
    headers: requestHeaders,
  })
  expect(listResponse.status()).toBe(201)
  const list = await listResponse.json()
  const due = new Date('2026-11-17T10:02:00+11:00')
  const title = 'Rehearsal browser reminder'
  const other = await context.newPage()
  const start = new Date('2026-11-17T10:00:00+11:00')
  for (const tab of [page, other]) {
    await tab.clock.install({ time: start })
  }
  await page.goto('/?app=tasks')
  const tasks = page.getByRole('region', { name: 'Tasks', exact: true })
  await tasks.getByRole('button', { name: 'Add with details' }).click()
  await tasks.getByLabel('Task title').fill(title)
  await tasks.getByLabel('Due date').fill('2026-11-17')
  await tasks.getByLabel('Due time').fill('10:02')
  await tasks.getByRole('button', { name: 'Add task', exact: true }).click()
  await expect(tasks.getByLabel('Task title')).toBeHidden()
  const itemsResponse = await context.request.get(`${api}/api/tasks/lists/${list.id}/items`)
  expect(itemsResponse.status()).toBe(200)
  const [saved] = await itemsResponse.json()
  expect(new Date(saved.due_at).toISOString()).toBe(due.toISOString())
  expect(saved.due_timezone).toBe('Australia/Sydney')

  await other.goto('/?app=tasks')
  const otherTasks = other.getByRole('region', { name: 'Tasks', exact: true })
  await expect(otherTasks.getByText(title, { exact: true })).toBeVisible()
  const toasts = [page, other].map((tab) => tab.getByRole('tooltip').filter({ hasText: title }))
  await Promise.all([page, other].map((tab) => tab.clock.pauseAt(new Date(due - 1000))))
  expect((await toasts[0].count()) + (await toasts[1].count())).toBe(0)
  await Promise.all([page, other].map((tab) => tab.clock.fastForward(1000)))
  await expect.poll(async () => (await toasts[0].count()) + (await toasts[1].count())).toBe(1)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(JSON.parse(localStorage.getItem('nexus-os:tasks:reminders-fired')).claims)
            .length,
      ),
    )
    .toBe(1)
  console.log(
    'Chromium passed: auth, Media Vault, Inbox, Chat, Notes, personalization, and one timed reminder across two tabs.',
  )
} finally {
  await browser.close()
}
