// ออกใบเสร็จรับเงิน/ใบกำกับภาษีจากแท็บเงินรับ (uat.account) — ใช้ R14.15 / R14.17 / R14.20
// ROW=<ข้อความในแถว เช่น ฿3,000.00> · DATES=<วันที่ที่ลองตามลำดับ คั่นด้วย , — ตัวสุดท้ายคือวันที่จริง ว่าง = ใช้ค่าเริ่มต้นก่อน> · BTN=<regex ชื่อปุ่ม> · TAG=<ชื่อภาพ>
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, qa, mainText } from './_h.mjs'
const ROW = process.env.ROW, TAG = process.env.TAG ?? 'issue', BTN = new RegExp(process.env.BTN ?? 'ออกใบเสร็จรับเงิน')
const DATES = (process.env.DATES ?? '').split(',')
const a = await openAs('uat.account'); const p = a.page
const res = []; p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 500)}`) })
const dlg = () => p.locator('[role="dialog"]').last()
const seq = () => qa(`select tax_invoice_seq from organizations`) + ' / n=' + qa(`select count(*) from tax_invoices`)
await p.goto(`${BASE}/accounting?tab=receipts`); await settle(p); await sleep(1500)
log(`== ${TAG} seq before`, seq())
const row = p.locator('tbody tr').filter({ hasText: ROW }).first()
log('row', (await row.innerText()).replace(/\s+/g, ' '))
log('row buttons', (await row.getByRole('button').allInnerTexts()).map(s => s.trim()))
await row.getByRole('button', { name: BTN }).click(); await sleep(1200)
log('modal', (await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 900))
const date = dlg().locator('input[type=date]').first()
log('default date', await date.inputValue())
await shot(p, R, `${TAG}-modal`)
const submit = dlg().getByRole('button', { name: /ยืนยันออกเอกสาร|ออกใบแทน|ยืนยัน/ }).last()
for (const [i, d] of DATES.entries()) {
  res.length = 0
  if (d) await date.fill(d); await sleep(300)
  log(`try date=${await date.inputValue()}`)
  await submit.click(); await sleep(2500)
  log('toasts', (await toasts(p, 300)).filter(s => !s.startsWith('ทำไมแก้ยอด') && !s.startsWith('ออกแล้วแก้ไม่ได้'))); log('res', res.splice(0))
  await shot(p, R, `${TAG}-try${i + 1}`)
  log('seq', seq())
}
await settle(p); await sleep(800)
log('row after', (await p.locator('tbody tr').filter({ hasText: ROW }).first().innerText().catch(() => '')).replace(/\s+/g, ' '))
await shot(p, R, `${TAG}-after`, { fullPage: true })
log('5xx', a.serverErrors)
await a.browser.close()
log(q(`select t.invoice_number,t.doc_kind,t.status,t.invoice_date,t.amount_before_vat_satang b,t.vat_satang v,t.total_satang tot,t.vat_rate_pct_used r,(select received_date from cash_receipts c where c.id=t.cash_receipt_id) rcv,(select invoice_number from tax_invoices o where o.id=t.replaces_tax_invoice_id) repl,t.buyer_name,t.description from tax_invoices t where t.created_at>now()-interval '3 minutes' order by invoice_number`))
