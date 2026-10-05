// R13c R13.38 (ส่วนแรก) ส่ง BL-2569-003 → R13.32 ออกใบกำกับ CO1 (BL-003) แล้ว CO2 (BL-004) + ดาวน์โหลด PDF
// ⚠️ ลำดับปรับจาก step sheet: sales record ของ CO1 เกิดเมื่อส่งบิล ⇒ ออก INV ของ CO1 ก่อนส่งไม่ได้ —
//    เลื่อน R13.32/33 มาหลังส่ง BL-003 เพื่อรักษาเลข INV-0003 = CO1 / INV-0004 = CO2 ตามค่าคาด
import { writeFileSync, mkdirSync } from 'node:fs'
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText } from './_h.mjs'
log('=== c38a', new Date().toISOString())
const f = await openAs('uat.finance'); const p = f.page
const res = []; const hook = pg => pg.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 400)}`) })
hook(p)
await p.goto(`${BASE}/finance?tab=revenue`); await settle(p); await sleep(1000)
const row = p.locator('tr').filter({ hasText: 'BL-2569-003' }).first()
await row.getByRole('button', { name: 'ส่งวางบิล' }).click(); await sleep(800)
let d = p.locator('[role="dialog"]').last()
await d.locator('textarea').first().fill('UAT R13c ส่งใบวางบิลให้ CO1 แล้ว')
await d.getByRole('button', { name: 'ยืนยันส่งบิล' }).click(); await sleep(2500)
log('toast send BL-003', await toasts(p, 400)); log('res', res)
await shot(p, R, 'c38-send-bl003')
await f.browser.close()
log(q(`select batch_number,status,total_satang from billing_batches where batch_number='BL-2569-003'`))
// R13.32 ออกใบกำกับ (บัญชี)
const a = await openAs('uat.account'); const ap = a.page; hook(ap)
await ap.goto(`${BASE}/accounting?tab=sales`); await settle(ap); await sleep(1200)
for (const bl of ['BL-2569-003', 'BL-2569-004']) {
  res.length = 0
  const r = ap.locator('tbody tr').filter({ hasText: bl }).first()
  log(`row ${bl}`, (await r.innerText()).replace(/\s+/g, ' '))
  await r.getByRole('button', { name: 'ออกใบกำกับภาษี' }).click(); await sleep(800)
  d = ap.locator('[role="dialog"]').last()
  log('modal', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 600))
  await shot(ap, R, `c32-issue-modal-${bl}`)
  await d.getByRole('button', { name: 'ยืนยันออกใบกำกับภาษี' }).click(); await sleep(2500)
  log(`toast issue ${bl}`, await toasts(ap, 400)); log('res', res)
  await settle(ap); await sleep(800)
}
log(await mainText(ap, 1500))
await shot(ap, R, 'c32-sales-after', { fullPage: true })
const inv = q(`select t.id, t.invoice_number, t.invoice_date, t.buyer_branch_code, t.seller_branch_code, (select batch_number from sales_records s join billing_batches b on b.id=s.billing_batch_id where s.id=t.sales_record_id) bl from tax_invoices t order by t.created_at`)
log(inv)
mkdirSync('uat/fixtures/downloads-R13', { recursive: true })
for (const line of inv.split('\n').filter(l => /INV-000[34]/.test(l))) {
  const [id, no] = line.split('|').map(s => s.trim())
  const r = await ap.request.get(`${BASE}/api/accounting/tax-invoices/${id}/pdf`, { failOnStatusCode: false })
  const path = `uat/fixtures/downloads-R13/c-${no}.pdf`
  writeFileSync(path, await r.body()); log('pdf', no, r.status(), r.headers()['content-type'], path)
}
log(q(`select action, target_type, reason, created_at from audit_logs where target_type='tax_invoices' order by created_at desc limit 4`))
log('5xx', a.serverErrors, a.consoleErrors.slice(0, 3))
await a.browser.close()
