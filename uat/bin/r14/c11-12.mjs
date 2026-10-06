// R14.11 นำเข้า statement bank-R14.csv → CO1 จับคู่อัตโนมัติ · R14.12 จับคู่ 3,000.00 → BL-2569-006 (บางส่วน) + AR ภายใน vs portal
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText, CO1, CO2 } from './_h.mjs'
const BANK = 'c30800c4-52c6-431a-a357-b073cf077b89', CSV = 'uat/fixtures/bank-R14.csv'
const T = new Date().toISOString()
const a = await openAs('uat.account'); const p = a.page
const res = []; p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 500)}`) })
const dlg = () => p.locator('[role="dialog"]').last()
await p.goto(`${BASE}/accounting?tab=bank`); await settle(p); await sleep(1000)
if (process.env.SKIP_IMPORT !== '1') {
  await p.getByRole('button', { name: 'Import Statement' }).click(); await sleep(700)
  await dlg().locator('select').first().selectOption(BANK)
  await dlg().locator('input[type=file]').setInputFiles(CSV); await sleep(400)
  await shot(p, R, '11-import-modal')
  await dlg().getByRole('button', { name: 'อัปโหลดและประมวลผล' }).click(); await sleep(3500)
  log('toast import', await toasts(p, 500)); log('res', res.splice(0))
  await settle(p); await sleep(800)
  await shot(p, R, '11-bank-after-import', { fullPage: true })
  log(q(`select transaction_date, amount_satang, match_status, (select batch_number from billing_batches b where b.id=matched_billing_id) bl, left(description,40) d from bank_transactions order by created_at desc limit 3`))
  log(q(`select batch_number,status,total_satang,received_satang,wht_withheld_by_customer_satang wht from billing_batches where batch_number in ('BL-2569-005','BL-2569-006')`))
  log(q(`select amount_satang, wht_withheld_by_customer_satang, received_date from cash_receipts where created_at>'${T}'`))
  log(q(`select company_id=('${CO1}')::uuid co1, withheld_satang, status from customer_wht_certificates where created_at>'${T}'`))
}
// R14.12 จับคู่ 3,000.00 → BL-006
const row = p.locator('tbody tr').filter({ hasText: '3,000.00' }).first()
log('row 3000', (await row.innerText()).replace(/\s+/g, ' '))
await row.getByRole('button', { name: 'จับคู่ Manual' }).click(); await sleep(1500)
const opts = await dlg().locator('select option').allInnerTexts(); log('candidates', opts)
const vals = await dlg().locator('select option').evaluateAll(os => os.map(o => o.value))
const pick = opts.findIndex(o => o.includes('BL-2569-006'))
if (pick < 0) { log('!! ไม่มีผู้สมัคร BL-2569-006'); await shot(p, R, '12-match-modal-nocand'); await a.browser.close(); process.exit(1) }
await dlg().locator('select').first().selectOption(vals[pick]); await sleep(400)
const btn = dlg().getByRole('button', { name: 'ยืนยันการจับคู่' })
log('note empty → confirm disabled?', await btn.isDisabled())
await dlg().locator('textarea').first().fill('รับชำระบางส่วนงวดที่ 1 ของ BL-2569-006')
log('modal', (await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 900))
await shot(p, R, '12-match-modal')
res.length = 0
await btn.click(); await sleep(2500)
log('toast match', await toasts(p, 500)); log('res', res.splice(0))
await settle(p); await sleep(800)
await shot(p, R, '12-bank-after-match', { fullPage: true })
log(q(`select transaction_date,amount_satang,match_status,match_note from bank_transactions where amount_satang=300000 and created_at>'${T}'`))
log(q(`select batch_number,status,received_satang from billing_batches where batch_number='BL-2569-006'`))
log(q(`select amount_satang, wht_withheld_by_customer_satang, received_date from cash_receipts where created_at>'${T}' order by created_at`))
await a.browser.close()
// AR ภายใน (การเงิน)
const f = await openAs('uat.finance'); const fp = f.page
await fp.goto(`${BASE}/finance?tab=revenue`); await settle(fp); await sleep(1200)
log('finance revenue', await mainText(fp, 700))
const aging = fp.getByRole('button', { name: 'AR Aging' }).or(fp.getByRole('tab', { name: 'AR Aging' })).first()
if (await aging.count()) { await aging.click(); await sleep(1200); log('AR aging', await mainText(fp, 1800)) }
await shot(fp, R, '12-finance-ar', { fullPage: true })
await f.browser.close()
const u = await openAs('uat.admin')
for (const [co, tag] of [[CO2, 'co2'], [CO1, 'co1']]) {
  await u.page.goto(`${BASE}/portal/view-as/${co}`); await settle(u.page); await sleep(1500)
  log(`portal view-as ${tag}`, await mainText(u.page, 700))
  await shot(u.page, R, `12-portal-viewas-${tag}`)
}
await u.browser.close()
