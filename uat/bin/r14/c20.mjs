// R14.20 ยกเลิก INV-0005 (แท็บรายได้และขาย) · probe เว้นเหตุผล (ปุ่ม + API) → เหตุผลจริง → cancelled
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q } from './_h.mjs'
const ID5 = '079ce195-1db2-427a-a8a0-845ed6918e2b'
const a = await openAs('uat.account'); const p = a.page
const res = []; p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 400)}`) })
const dlg = () => p.locator('[role="dialog"]').last()
await p.goto(`${BASE}/accounting?tab=sales`); await settle(p); await sleep(1500)
const row = p.locator('tbody tr').filter({ hasText: 'INV-0005' }).first()
await row.getByRole('button', { name: 'ยกเลิก', exact: true }).click(); await sleep(1000)
log('cancel modal', (await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 800))
const btns = (await dlg().getByRole('button').allInnerTexts()).map(s => s.trim()); log('buttons', btns)
const confirm = dlg().getByRole('button', { name: /ยืนยันยกเลิก|ยกเลิกใบ|ยืนยัน/ }).last()
log('empty reason → confirm disabled?', await confirm.isDisabled())
await shot(p, R, '20-cancel-modal-empty')
// probe API เหตุผลว่าง — ใช้ path เดียวกับที่ปุ่มเรียก (ลองทั้ง PATCH /cancel และ POST /cancel)
for (const [m, path] of [['PATCH', `/api/accounting/tax-invoices/${ID5}/cancel`], ['POST', `/api/accounting/tax-invoices/${ID5}/cancel`]]) {
  const r = await p.request.fetch(`${BASE}${path}`, { method: m, data: { reason: '' }, failOnStatusCode: false })
  log('probe', m, path, r.status(), (await r.text()).slice(0, 300))
  if (r.status() !== 404 && r.status() !== 405) break
}
log(q(`select invoice_number,status from tax_invoices where id='${ID5}'`))
await dlg().locator('textarea').first().fill('UAT R14 ทดสอบออกใบแทน'); await sleep(300)
res.length = 0
await confirm.click(); await sleep(2500)
log('toast', (await toasts(p, 300)).slice(0, 2)); log('res', res.splice(0))
await settle(p); await sleep(800)
log('row after', (await p.locator('tbody tr').filter({ hasText: 'INV-0005' }).first().innerText()).replace(/\s+/g, ' '))
await shot(p, R, '20-after-cancel', { fullPage: true })
log('5xx', a.serverErrors); await a.browser.close()
log(q(`select invoice_number,status,cancel_reason,cancelled_at is not null c from tax_invoices where id='${ID5}'`))
log(q(`select action,actor_role,reason from audit_logs where target_id='${ID5}' order by created_at`))
