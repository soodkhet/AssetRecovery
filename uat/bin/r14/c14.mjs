// R14.14 แท็บเงินรับ → ออกใบเสร็จรับเงิน/ใบกำกับภาษี CO1 · probe วันที่อนาคต/ก่อนวันรับเงิน (ไม่กินเลข) → INV-0005
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, qa, mainText } from './_h.mjs'
const a = await openAs('uat.account'); const p = a.page
const res = []; p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 500)}`) })
const dlg = () => p.locator('[role="dialog"]').last()
await p.goto(`${BASE}/accounting?tab=receipts`); await settle(p); await sleep(1500)


log('url', p.url()); log('receipts tab', await mainText(p, 1800))
await shot(p, R, '14-receipts-tab', { fullPage: true })
const seq = () => qa(`select tax_invoice_seq from organizations`) + ' / n=' + qa(`select count(*) from tax_invoices`)
log('seq before', seq())
const row = p.locator('tbody tr').filter({ hasText: 'BL-2569-005' }).first()
log('row', (await row.innerText()).replace(/\s+/g, ' '))
await row.getByRole('button', { name: /ออกใบเสร็จรับเงิน/ }).click(); await sleep(1200)
log('modal', (await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 1200))
const date = dlg().locator('input[type=date]').first()
log('default date', await date.inputValue())
await shot(p, R, '14-issue-modal')
const submit = dlg().getByRole('button', { name: /ออกใบเสร็จ|ยืนยัน/ }).last()
for (const [d, tag] of [['2026-10-07', 'future'], ['2026-10-05', 'before-receipt']]) {
  res.length = 0
  await date.fill(d); await sleep(300)
  log(`probe ${d} submit disabled?`, await submit.isDisabled())
  if (!(await submit.isDisabled())) { await submit.click(); await sleep(2000) }
  log(`probe ${tag} toasts`, await toasts(p, 300)); log('res', res.splice(0))
  log('modal text', (await dlg().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-400))
  await shot(p, R, `14-probe-${tag}`)
  log('seq after probe', seq())
}
await date.fill('2026-10-06'); await sleep(300)
res.length = 0
await submit.click(); await sleep(2500)
log('issue toasts', await toasts(p, 300)); log('res', res.splice(0))
await settle(p); await sleep(800)
await shot(p, R, '14-after-issue', { fullPage: true })
log('5xx', a.serverErrors)
await a.browser.close()
log('seq end', seq())
log(q(`select t.invoice_number,t.doc_kind,t.status,t.invoice_date,t.amount_before_vat_satang b,t.vat_satang v,t.total_satang tot,t.vat_rate_pct_used r,(select received_date from cash_receipts c where c.id=t.cash_receipt_id) rcv,t.buyer_name,t.buyer_tax_id,t.buyer_branch_code,left(t.buyer_address,40) addr,t.description from tax_invoices t where invoice_number='INV-0005'`))
log(q(`select action,actor_role,target_type from audit_logs where target_type='tax_invoices' and created_at>now()-interval '5 minutes'`))
