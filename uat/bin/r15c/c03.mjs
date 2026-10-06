// R15c.03 สลิปค่าตอบแทน (UI) · F4 (พ.ย.) · Export Pack (บัญชี) ไฟล์ 05 รวมภาษีที่ออกให้
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText, DL, get } from './_h.mjs'
const ID = '4b234a2e-5c73-4504-8cbe-fc5611166a77', PID = '879302b0-bb29-4bae-9f9a-1e16aba8bb31'
const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
log('== c03', new Date().toISOString())
const f = await openAs('uat.finance'); const page = f.page
await page.goto(`${BASE}/finance?tab=payout`); await settle(page); await sleep(1200)
const row = page.locator('tbody tr').filter({ hasText: 'UAT R15b IN on' })
await row.getByRole('button', { name: 'ดูรายการ' }).click(); await sleep(1500)
const d = page.getByRole('dialog').last()
log('detail', flat(await d.innerText()).slice(0, 1500))
await shot(page, R, 'c-03-payout-detail-completed', { fullPage: true })
const links = await d.locator('a').evaluateAll(as => as.map(a => `${a.innerText.trim()} ${a.getAttribute('href')}`))
log('links', links)
const r = await page.request.get(`${BASE}/api/payout-batches/${ID}/payslip-pdf`, { failOnStatusCode: false })
writeFileSync(`${DL}/c03-payslip.pdf`, await r.body()); log('payslip', r.status(), r.headers()['content-disposition'])
await page.keyboard.press('Escape')
await page.goto(`${BASE}/reports/compensation`); await settle(page); await sleep(2000)
log('F4 default', await mainText(page, 1500))
log('F4 API nov emp', await get(page, '/api/reports/finance/compensation?groupBy=employee&from=2026-11-01&to=2026-11-30', 2000))
await f.browser.close()
// Export pack
log('before', q('select version, status, left(file_hash,16) h from export_records order by version'))
const a = await openAs('uat.account'); const p = a.page
await p.goto(`${BASE}/accounting?tab=export`); await settle(p); await sleep(1000)
await p.locator('main').getByRole('button', { name: 'สร้างชุดเอกสารใหม่' }).click(); await sleep(800)
const m = p.locator('[role="dialog"]').last(); const sel = m.locator('select').first(); if (!(await sel.inputValue())) await sel.selectOption(PID); await sleep(500)
await m.locator('textarea').fill('UAT R15c ชุดเอกสารหลังรอบจ่ายเงื่อนไข (2)/(3)')
log('dlg', flat(await m.innerText()).slice(0, 800)); await shot(p, R, 'c-03-export-modal')
const rp = p.waitForResponse(x => x.url().includes('/api/accounting/export-pack') && x.request().method() === 'POST', { timeout: 120000 })
await m.getByRole('button', { name: 'ดาวน์โหลดไฟล์ (.zip)' }).click()
const x = await rp; let j = {}; try { j = await x.json() } catch {} log('resp', x.status(), JSON.stringify(j).slice(0, 600)); const rec = j.data
log('toast', await toasts(p, 1500)); await sleep(2500); await settle(p)
await shot(p, R, 'c-03-export-history', { fullPage: true })
if (rec?.id) {
  const res = await p.request.get(`${BASE}/api/accounting/export-history/${rec.id}/download`)
  const b = await res.body(); const fn = `${DL}/export-pack-v${rec.version}.zip`; writeFileSync(fn, b)
  log('dl', res.status(), b.length, 'sha256', createHash('sha256').update(b).digest('hex'), fn)
}
log('after', q('select version, status, left(file_hash,16) h, created_at from export_records order by version desc limit 2'))
log('5xx', a.serverErrors, f.serverErrors)
await a.browser.close()
