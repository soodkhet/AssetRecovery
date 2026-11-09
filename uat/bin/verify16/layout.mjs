// localhost — ตารางเงินทดรอง: เลขใบรับรองแทนใบเสร็จต้องไม่ล้นทับคอลัมน์ "ขอเบิก"
import { openAs, BASE } from '../lib.mjs'
const s = await openAs(process.env.PERSONA ?? 'uat.finance')
const page = s.page
await page.goto(`${BASE}/finance?tab=advances`)
await page.waitForTimeout(3500)
const rows = page.locator('tr', { hasText: 'CRT-' })
const n = await rows.count()
const out = []
for (let i = 0; i < n; i++) {
  const row = rows.nth(i)
  const crt = row.locator('span.font-mono', { hasText: /^CRT-/ }).first()
  const cell = crt.locator('xpath=ancestor::td[1]')
  const a = await crt.boundingBox(); const c = await cell.boundingBox()
  out.push({ crt: await crt.innerText(), crtRight: Math.round(a.x + a.width), cellRight: Math.round(c.x + c.width), overflow: a.x + a.width > c.x + c.width })
}
await rows.first().scrollIntoViewIfNeeded()
await page.screenshot({ path: `${process.env.SHOT_DIR}/layout-local.png` })
console.log(JSON.stringify({ base: BASE, rows: out, console: s.consoleErrors.slice(0, 3) }, null, 2))
await s.browser.close()
