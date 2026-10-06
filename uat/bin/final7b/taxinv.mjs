// Flow 12 — บัญชี: ออกใบเสร็จรับเงิน/ใบกำกับภาษี BL-2569-011 (หลังรับชำระ + ตัดค่าธรรมเนียม) → PDF
import { openAs, shot, log, q, collect, trackApi } from './_h.mjs'

const s = await openAs('uat.account'); const { page } = s; const api = trackApi(page)
await page.goto('http://localhost:3000/accounting?tab=receipts'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200)
const row = page.locator('tr', { hasText: process.argv[2] ?? 'F7B-BL011' }).first()
log('u169', 'row', (await row.innerText()).replace(/\s+/g, ' '), '| btns', (await row.getByRole('button').allInnerTexts()).join('|'))
const b = row.getByRole('button', { name: /ออกใบ/ }).first()
if (await b.count()) { await b.click(); await page.waitForTimeout(1200)
  const d = page.getByRole('dialog').last(); log('u169', 'dlg', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 1800)); await shot(page, 'u169-issue-dlg', { fullPage: true })
  for (const ta of await d.locator('textarea').all()) await ta.fill('ออกใบกำกับ ด่าน 7')
  await d.getByRole('button', { name: /ออกใบ|ยืนยัน/ }).last().click()
  log('u169', 'issue', await collect(page, 5000), api.splice(0).map(x => x.slice(0, 400))) }
log('u169', q(`select * from tax_invoices order by created_at desc limit 1`))
log('u169', 'console', s.consoleErrors, s.serverErrors); await s.browser.close()
