// ผู้ใช้สั่ง 16/10/2569: uat.finance กด "ตรวจแล้ว" ADV-2569-0005 ผ่านหน้าจอ
import { writeFileSync } from 'node:fs'
import { openAs, BASE } from '../lib.mjs'
const OUT = process.env.SHOT_DIR
const ADV = 'f063c417-46e9-4a47-bcbe-1efca7270d30'
const s = await openAs('uat.finance')
const page = s.page
await page.goto(`${BASE}/finance?tab=advances`)
await page.waitForTimeout(3000)
const row = page.locator('tr', { hasText: 'ADV-2569-0005' })
await row.getByRole('button', { name: 'ตรวจแล้ว', exact: true }).click()
const resp = page.waitForResponse((r) => r.url().includes(`/api/advances/${ADV}/clear-review`))
await page.getByRole('button', { name: 'ยืนยันตรวจแล้ว' }).click()
const r = await resp
const b = await r.json()
await page.waitForTimeout(2500)
await row.first().scrollIntoViewIfNeeded()
await page.screenshot({ path: `${OUT}/q1-reviewed.png` })
const out = {
  api: { status: r.status(), clearReviewedAt: b.data?.clearReviewedAt ?? null, by: b.data?.clearReviewedByName ?? null, error: b.error ?? null },
  rowText: (await row.first().innerText()).replace(/\s+/g, ' ').slice(-200),
  reviewButtonLeft: await row.getByRole('button', { name: 'ตรวจแล้ว', exact: true }).count(),
  console: s.consoleErrors.slice(0, 3), server: s.serverErrors,
}
writeFileSync(`${OUT}/q1-reviewed.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await s.browser.close()
