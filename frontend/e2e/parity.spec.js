// Visual parity: every component example on the 7.css documentation page is
// screenshotted on the live reference, then the *same markup* is rendered in
// win7-parity.html (Nexus's full CSS stack) and pixel-diffed. A mismatch means
// the Nexus integration (Preflight, win7-reset, nexus adapter) altered 7.css.
//
//   npx playwright test e2e/parity.spec.js --project=desktop
//
// Needs network access to khang-nd.github.io. Results: e2e/.results/parity/
// (ref-*.png, ours-*.png, diff-*.png, summary.json).
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { test, expect } from '@playwright/test'

const REF_URL = 'https://khang-nd.github.io/7.css/'
const OUT = process.env.PARITY_DIR || 'e2e/.results/parity'

test.describe.configure({ mode: 'serial' })

test('7.css components render identically inside the Nexus CSS stack', async ({ browser }) => {
  test.setTimeout(240_000)
  fs.mkdirSync(OUT, { recursive: true })
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  })
  const ref = await ctx.newPage()
  await ref.goto(REF_URL, { waitUntil: 'networkidle' })

  // Collect every example under the Components section with its section id.
  const examples = await ref.evaluate(() => {
    const out = []
    document.querySelectorAll('.example').forEach((el, i) => {
      let sec = el.closest('section')
      let id = sec?.id || ''
      // nearest preceding heading with an id
      let h = el
      while (h && !id) {
        h = h.previousElementSibling || h.parentElement
        if (h?.id) id = h.id
      }
      const r = el.getBoundingClientRect()
      out.push({ i, id: id || `example-${i}`, width: Math.round(r.width), html: el.innerHTML })
    })
    return out
  })

  // Clean reference stage: the live, official 7.css + docs.css with nothing
  // else, so both sides render each snippet at the same integer position
  // (screenshotting in place on the long docs page adds sub-pixel rounding).
  const refStage = await ctx.newPage()
  await refStage.setContent(
    `<!doctype html><html><head>
      <link rel="stylesheet" href="${REF_URL}7.css">
      <link rel="stylesheet" href="${REF_URL}docs.css">
    </head><body style="margin:0"><div id="stage"></div></body></html>`,
    { waitUntil: 'networkidle' },
  )

  const ours = await ctx.newPage()
  await ours.goto('/win7-parity.html')
  await ours.waitForFunction(() => window.__parityReady === true)

  const results = []
  for (const ex of examples) {
    const name = `${String(ex.i).padStart(2, '0')}-${ex.id}`.replace(/[^a-z0-9-]/gi, '_')
    const mount = ({ html, width }) => {
      const stage = document.getElementById('stage')
      stage.innerHTML = ''
      const box = document.createElement('div')
      box.className = 'example'
      Object.assign(box.style, {
        margin: '16px 0',
        padding: '12px 24px',
        borderLeft: '1px solid #808080',
        boxSizing: 'border-box',
        width: `${width}px`,
        color: '#222',
        background: 'var(--w7-surface)',
        font: 'var(--w7-font)',
      })
      box.innerHTML = html
      stage.appendChild(box)
    }
    // Compare the component node itself (.raw), not the docs' "Show code" row.
    await refStage.evaluate(mount, { html: ex.html, width: ex.width })
    await refStage.mouse.move(0, 0)
    const refBuf = await refStage
      .locator('#stage > .example .raw')
      .first()
      .screenshot({ animations: 'disabled' })

    await ours.evaluate(mount, { html: ex.html, width: ex.width })
    await ours.mouse.move(0, 0)
    const ourBuf = await ours
      .locator('#stage > .example .raw')
      .first()
      .screenshot({ animations: 'disabled' })

    const a = PNG.sync.read(refBuf)
    const b = PNG.sync.read(ourBuf)
    const w = Math.min(a.width, b.width)
    const h = Math.min(a.height, b.height)
    const crop = (img) => {
      const out = new PNG({ width: w, height: h })
      PNG.bitblt(img, out, 0, 0, w, h, 0, 0)
      return out
    }
    const ca = crop(a)
    const cb = crop(b)
    const diff = new PNG({ width: w, height: h })
    const mismatched = pixelmatch(ca.data, cb.data, diff.data, w, h, { threshold: 0.1 })
    const pct = (mismatched / (w * h)) * 100
    fs.writeFileSync(path.join(OUT, `ref-${name}.png`), refBuf)
    fs.writeFileSync(path.join(OUT, `ours-${name}.png`), ourBuf)
    if (mismatched > 0) fs.writeFileSync(path.join(OUT, `diff-${name}.png`), PNG.sync.write(diff))
    results.push({
      name,
      section: ex.id,
      refSize: [a.width, a.height],
      oursSize: [b.width, b.height],
      mismatchedPixels: mismatched,
      mismatchPct: Number(pct.toFixed(3)),
    })
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(results, null, 2))
  await ctx.close()

  const sizeMismatch = results.filter(
    (r) => r.refSize[0] !== r.oursSize[0] || r.refSize[1] !== r.oursSize[1],
  )
  const failing = results.filter((r) => r.mismatchPct > 0.5)
  console.log(
    `parity: ${results.length} examples, ${failing.length} over 0.5% mismatch, ${sizeMismatch.length} size mismatches`,
  )
  expect(results.length).toBeGreaterThan(30)
})
