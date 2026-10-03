// R6.36 ยืนยัน in2 → IN-2 → ไฟล์ → ยืนยันจ่าย · R6.37 OUT-2
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { openAs, shot, BASE, settle, sleep, log, R, q, waitToast, flat, dlgText, api, guard2xx, SQLB, BFF, BACC, TODAY, pbId, dlgReasonConfirm, T0B } from './_hb.mjs'
log('=== s36-37', new Date().toISOString())
const DL = 'uat/fixtures/downloads-R6b'
const f = await openAs('uat.finance'); const p = f.page
await p.goto(`${BASE}/finance?tab=payee`); await settle(p); await sleep(1000)
await p.locator('tbody tr').filter({ hasText: 'บุญมี ภาคสนาม' }).getByRole('button', { name: 'ยืนยัน', exact: true }).click(); await sleep(500)
log('verify in2', await dlgReasonConfirm(p, 'ตรวจสมุดบัญชีกรุงเทพแล้ว UAT R6', 'ยืนยันผู้รับเงิน', '/verify')); log('toast', await waitToast(p, 6000))
log(q(SQLB.payee))
await p.goto(`${BASE}/finance?tab=payout`); await settle(p); await sleep(1000)
const rowOf = n => p.locator('tbody tr').filter({ hasText: n })
const posts = []; p.on('response', async r => { if (r.request().method() === 'POST' && r.url().endsWith('/api/payout-batches')) posts.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 260)}`) })
async function create(side, name) {
  posts.length = 0
  await p.getByRole('button', { name: '+ สร้างรอบจ่าย' }).click(); await sleep(500)
  const d = p.locator('[role="dialog"]').last()
  await d.locator('select').first().selectOption(side); await d.locator('input[type=date]').fill(TODAY); await d.locator('input:not([type=date])').last().fill(name)
  await d.getByRole('button', { name: 'สร้างรอบจ่าย' }).dblclick()
  const t = await waitToast(p, 10000); await sleep(2000); log(`create ${name}`, posts, t)
}
async function genFile(batch, reason) {
  await rowOf(batch).getByRole('button', { name: /สร้างไฟล์โอน/ }).click(); await sleep(1500)
  const d = p.locator('[role="dialog"]').last()
  await d.locator('select').first().selectOption(BFF); await d.locator('select').nth(1).selectOption(BACC)
  log(`${batch} modal:`, await dlgText(p, 700))
  const res = await dlgReasonConfirm(p, reason, 'สร้างไฟล์โอน', '/generate-payment-file')
  log(`${batch} gen:`, res.slice(0, 120)); log('toast', await waitToast(p, 6000)); await sleep(800)
  log(`${batch} after:`, await dlgText(p, 700))
  return d
}
async function dl(id, tag) { const r = await p.request.get(`${BASE}/api/payout-batches/${id}/payment-file`); const b = await r.body(); writeFileSync(`${DL}/${tag}.csv`, b); log(`download ${tag}`, r.status(), r.headers()['content-disposition'], 'sha256', createHash('sha256').update(b).digest('hex')); return b.toString('utf8') }
async function complete(batch, reason, shotName) {
  await p.reload(); await settle(p); await sleep(1000)
  await rowOf(batch).getByRole('button', { name: '✓ ยืนยันจ่ายแล้ว' }).click(); await sleep(600)
  const d = p.locator('[role="dialog"]').last()
  log(`${batch} complete modal:`, await dlgText(p, 300))
  await d.locator('textarea').fill(reason)
  const [resp] = await Promise.all([p.waitForResponse(x => x.url().includes('/complete'), { timeout: 20000 }), d.getByRole('button', { name: 'ยืนยันจ่ายแล้ว' }).click()])
  log(`${batch} complete`, resp.status(), (await resp.text()).slice(0, 150)); log('toast', await waitToast(p, 6000)); await sleep(800)
  if (shotName) await shot(p, R, shotName, { fullPage: true })
}
await create('inhouse', 'UAT IN-2')
const IN2 = pbId('UAT IN-2')
log(q(`select coalesce(c.case_ref, e.expense_type::text, 'ADV') src, e.expense_type, i.gross_satang, i.wht_satang, i.net_satang, i.wht_pct_snapshot from payout_batch_items i left join expenses e on e.id=i.expense_id left join cases c on c.id=e.case_id where i.payout_batch_id='${IN2}' order by 1,2`))
await p.reload(); await settle(p); await sleep(800)
await shot(p, R, '63-R6.36-in2-created', { fullPage: true })
await genFile('UAT IN-2', 'UAT R6 สร้างไฟล์โอนรอบ IN-2'); await shot(p, R, '64-R6.36-in2-file'); await p.keyboard.press('Escape'); await sleep(400)
log('IN-2 csv:\n' + (await dl(IN2, 'IN-2')))
await complete('UAT IN-2', 'ตรวจสลิปโอนกรุงเทพครบ UAT R6', '65-R6.36-in2-completed')
// R6.37 OUT-2
await create('outsource', 'UAT OUT-2')
const OUT2 = pbId('UAT OUT-2')
log(q(`select e.expense_type, i.gross_satang, i.wht_satang, i.net_satang, i.wht_pct_snapshot from payout_batch_items i left join expenses e on e.id=i.expense_id where i.payout_batch_id='${OUT2}'`))
await p.reload(); await settle(p); await sleep(800)
await genFile('UAT OUT-2', 'UAT R6 สร้างไฟล์โอนรอบ OUT-2'); await p.keyboard.press('Escape'); await sleep(400)
log('OUT-2 csv:\n' + (await dl(OUT2, 'OUT-2')))
await complete('UAT OUT-2', 'ตรวจสลิปโอนไทยพาณิชย์ครบ UAT R6 OUT-2', '66-R6.37-payout-all')
const again = await api(p, 'POST', '/api/payout-batches', { side: 'outsource', cutoffDate: TODAY, name: 'UAT OUT-3 probe' }); log('outsource again', again); guard2xx('out-again', again)
const again2 = await api(p, 'POST', '/api/payout-batches', { side: 'inhouse', cutoffDate: TODAY, name: 'UAT IN-3 probe' }); log('inhouse again', again2); guard2xx('in-again', again2)
log(q(SQLB.pb))
log(q(`select count(*), sum(gross_satang), sum(wht_satang), sum(net_satang) from expense_records`))
log(q(`select w.certificate_number, w.gross_satang, w.wht_satang, w.filing_form, w.status, w.payment_date from wht_certificates w order by w.certificate_number`))
log(q(`select to_char(n.created_at,'HH24:MI:SS') t,u.username,n.event_code,left(n.body,70) from notifications n join users u on u.id=n.user_id where n.created_at > '${T0B}' and n.event_code like 'payout%' order by 1`))
log('5xx', f.serverErrors, f.consoleErrors.slice(0, 3))
await f.browser.close()
