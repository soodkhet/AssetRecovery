// R13c R13.35–R13.37 — นำเข้า statement (วันที่เล่นจริง 06/10/2569) · probe นำเข้าซ้ำ · จับคู่เงินออก IN-R13b
// · ย้าย 780/250 เป็นเงินรับรอตรวจสอบ · probe exec · readiness
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText, get } from './_h.mjs'
const BANK = 'c30800c4-52c6-431a-a357-b073cf077b89'
const CSV = 'uat/fixtures/bank-R13-filled.csv'
log('=== c35', new Date().toISOString())
const a = await openAs('uat.account'); const p = a.page
const res = []; p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 500)}`) })
const dlg = () => p.locator('[role="dialog"]').last()
async function importOnce(tag) {
  res.length = 0
  await p.getByRole('button', { name: 'Import Statement' }).click(); await sleep(700)
  await dlg().locator('select').first().selectOption(BANK)
  await dlg().locator('input[type=file]').setInputFiles(CSV); await sleep(400)
  await dlg().getByRole('button', { name: 'อัปโหลดและประมวลผล' }).click(); await sleep(3500)
  log(`toast import ${tag}`, await toasts(p, 500)); log('res', res)
  await settle(p); await sleep(800)
}
const rowOf = txt => p.locator('tbody tr').filter({ hasText: txt }).first()
await p.goto(`${BASE}/accounting?tab=bank`); await settle(p); await sleep(1000)
await importOnce('1')
log(q(`select transaction_date, amount_satang, match_status, (select batch_number from billing_batches b where b.id=matched_billing_id) bl, matched_payout_id is not null p, left(description,40) d from bank_transactions order by created_at desc limit 4`))
log(q(`select batch_number,status,received_satang from billing_batches where batch_number in ('BL-2569-003','BL-2569-004')`))
await shot(p, R, 'c35-bank-after-import', { fullPage: true })
// probe: นำเข้าไฟล์เดิมซ้ำ (ระบบกันซ้ำรายแถว)
const before = q(`select count(*) from bank_transactions`)
await importOnce('2-duplicate-probe')
log('bank rows before/after dup import', before.split('\n')[2], q(`select count(*) from bank_transactions`).split('\n')[2])
await shot(p, R, 'c35-dup-import-toast')
// จับคู่เงินออก −2,059.50 กับรอบ IN-R13b
res.length = 0
const out = rowOf('2,059.50')
log('out row:', (await out.innerText()).replace(/\s+/g, ' '))
if (await out.getByRole('button', { name: 'จับคู่ Manual' }).count()) {
  await out.getByRole('button', { name: 'จับคู่ Manual' }).click(); await sleep(1500)
  const opts = await dlg().locator('select option').allInnerTexts(); log('candidates', opts)
  const pick = opts.findIndex(o => o.includes('IN-R13b'))
  const vals = await dlg().locator('select option').evaluateAll(os => os.map(o => o.value))
  await shot(p, R, 'c35-match-payout-modal')
  if (pick >= 0) {
    await dlg().locator('select').first().selectOption(vals[pick]); await sleep(400)
    const ta = dlg().locator('textarea'); if (await ta.count()) await ta.first().fill('UAT R13c จับคู่เงินออกกับรอบจ่าย IN-R13b (ยอดโอนจริงหลังหักคืนเงินทดรอง)')
    log('modal', (await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 700))
    await dlg().getByRole('button', { name: 'ยืนยันการจับคู่' }).click(); await sleep(2500)
    log('toast match out', await toasts(p, 500)); log('res', res)
  } else { log('!! ไม่พบผู้สมัคร IN-R13b'); await p.keyboard.press('Escape') }
  await settle(p); await sleep(600)
}
// R13.36 ย้าย 780 / 250 เป็นเงินรับรอตรวจสอบ
for (const [ref, amt] of [['780.00', '780'], ['250.00', '250']]) {
  res.length = 0
  const r = rowOf(ref)
  await r.getByRole('button', { name: 'เงินรอตรวจสอบ' }).click(); await sleep(700)
  await dlg().locator('input:not([type])').last().fill('ยังไม่ทราบผู้โอน').catch(async () => { await dlg().locator('input').last().fill('ยังไม่ทราบผู้โอน') })
  log(`suspense modal ${amt}`, (await dlg().innerText()).replace(/\s+/g, ' ').slice(0, 500))
  await dlg().getByRole('button', { name: 'ยืนยันย้ายเป็นเงินรับรอตรวจสอบ' }).click(); await sleep(2500)
  log(`toast suspense ${amt}`, await toasts(p, 500)); log('res', res)
  await settle(p); await sleep(600)
}
log('main', await mainText(p, 1600))
const outRow = rowOf('2,059.50')
log('out row buttons', await outRow.getByRole('button').allInnerTexts())
await shot(p, R, 'c36-bank-suspense', { fullPage: true })
log(q(`select amount_satang, match_status, suspense_note, (select name from payout_batches pb where pb.id=matched_payout_id) payout, match_note from bank_transactions order by created_at desc limit 4`))
log(q(`select count(*) receipts from cash_receipts`))
// R13.37 readiness
await p.goto(`${BASE}/accounting?tab=closing`); await settle(p); await sleep(1500)
await p.getByRole('button', { name: 'ตรวจความพร้อม' }).first().click(); await sleep(2500)
log('R13.37 readiness:', (await dlg().innerText()).replace(/\s*\n+\s*/g, ' | ').slice(0, 2200))
await shot(p, R, 'c37-readiness')
log('5xx', a.serverErrors, a.consoleErrors.slice(0, 3))
await a.browser.close()
// probe exec เปิดหน้ากระทบยอด
const e = await openAs('uat.exec'); const ep = e.page
await ep.goto(`${BASE}/accounting?tab=bank`); await settle(ep); await sleep(800)
log('exec url', ep.url(), (await mainText(ep, 200)))
log('exec GET tx', (await get(ep, '/api/bank-reconciliation/transactions')).slice(0, 200))
await e.browser.close()
