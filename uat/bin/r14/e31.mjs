// R14.31 ส่ง + ล็อกงวด ต.ค. 2569 ด้วย dev asOf 2026-11-01 · probe ยกเลิก INV-0008 หลังล็อก
import { sess, call } from '../r10v3/_h.mjs'
import { openAs, shot, log, settle, sleep, R, BASE, q, mainText } from './_h.mjs'
const PER = '879302b0-bb29-4bae-9f9a-1e16aba8bb31', INV8 = 'a02be95b-e136-49cd-8396-4c838bb4cbdc'
const T = new Date().toISOString()
const show = (tag, r) => log(tag, r.status, r.code, (r.msg ?? '').slice(0, 160), r.status < 300 ? JSON.stringify(r.body?.data ?? {}).slice(0, 200) : '')
log('before', q(`select period_label,status from accounting_periods where id='${PER}'`).replace(/\s+/g, ' '))
const acc = await sess('uat.account')
show('send', await call(acc, 'POST', `/api/dev/accounting-periods/${PER}/send`, { reason: 'UAT R14 ปิดงวดจำลอง', asOf: '2026-11-01' }))
log('mid', q(`select status from accounting_periods where id='${PER}'`).replace(/\s+/g, ' '))
show('lock', await call(acc, 'POST', `/api/dev/accounting-periods/${PER}/lock`, { reason: 'UAT R14 ล็อกงวดจำลอง', asOf: '2026-11-01' }))
log('after', q(`select period_label,status from accounting_periods where id='${PER}'`).replace(/\s+/g, ' '))
show('probe cancel INV-0008 after lock', await call(acc, 'PATCH', `/api/accounting/tax-invoices/${INV8}/cancel`, { reason: 'UAT R14 probe หลังล็อกงวด' }))
log('INV-0008', q(`select status from tax_invoices where id='${INV8}'`).replace(/\s+/g, ' '))
const { browser, page } = await openAs('uat.account')
await page.goto(`${BASE}/accounting?tab=closing`); await settle(page); await sleep(1500)
log('closing tab', await mainText(page, 900)); await shot(page, R, '31-period-locked', { fullPage: true })
await page.goto(`${BASE}/accounting?tab=sales`); await settle(page); await sleep(1500)
const r8 = page.locator('tr').filter({ hasText: 'INV-0008' }).first()
log('INV-0008 row', (await r8.innerText().catch(() => '')).replace(/\s+/g, ' '), await r8.getByRole('button').allInnerTexts().catch(() => []))
const btn = r8.getByRole('button', { name: 'ยกเลิก' })
if (await btn.count()) { log('cancel btn disabled?', await btn.isDisabled()); if (!(await btn.isDisabled())) { await btn.click(); await sleep(800); log('modal', (await page.locator('[role=dialog]').last().innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 500)); await shot(page, R, '31-cancel-after-lock-modal'); await page.keyboard.press('Escape') } }
await shot(page, R, '31-sales-after-lock', { fullPage: true })
await browser.close()
log(q(`select a.action,a.target_type,a.reason from audit_logs a where a.created_at>'${T}' and a.action not in ('login') order by a.created_at`))
