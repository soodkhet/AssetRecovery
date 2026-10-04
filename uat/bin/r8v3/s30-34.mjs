// R8.30 ปลดล็อก · R8.31 A2 · R8.32 การเงินอนุมัติ · R8.33 บริหารปฏิเสธ · R8.34 บัญชีล็อกใหม่
import { openAs, shot, R, ID, log, q, q1, settle, sleep, waitToast, mainText, dlgText, BASE, api, guard2xx, auditSince, fp } from './_h.mjs'
log('=== R8.30-34', new Date().toISOString())
const T = q1('select now()'); log('T', T, 'FP', fp())
const P = `/api/accounting/periods/${ID.PERIOD}`
const e = await openAs('uat.exec'); const ep = e.page
// R8.30
await ep.goto(`${BASE}/accounting?tab=closing`); await settle(ep); await sleep(1000)
let r = await api(ep, 'PATCH', `${P}/unlock`, { reason: '' }); log('30 unlock ว่าง', r); guard2xx('30e', r)
await ep.locator('main').getByRole('button', { name: 'ปลดล็อก' }).first().click(); await sleep(800)
const d = ep.locator('[role="dialog"]').last(); const cb = d.getByRole('button', { name: /ยืนยันปลดล็อก/ })
log('30 dlg', await dlgText(ep, 1400), '| confirm disabled (ว่าง):', await cb.isDisabled())
await shot(ep, R, '30a-unlock-modal-empty')
await d.locator('textarea').fill('ปลดล็อกชั่วคราว — สำนักงานบัญชีขอปรับค่าธรรมเนียมรอบจ่าย OUT-2 ผ่านรายการปรับปรุง UAT R8')
await shot(ep, R, '30b-unlock-modal-filled')
{ const rs = []; ep.on('response', x => { if (x.url().includes(`/periods/${ID.PERIOD}/unlock`)) rs.push(x) })
  await cb.dblclick(); await sleep(3000)
  for (const x of rs) log('30 ui unlock resp', x.status(), (await x.text()).slice(0, 300)) }
log('30 toast', await waitToast(ep)); await sleep(1200); await settle(ep)
log('30 closing after', await mainText(ep, 1400)); await shot(ep, R, '30c-closing-unlocked', { fullPage: true })
r = await api(ep, 'PATCH', `${P}/unlock`, { reason: 'ปลดซ้ำ probe' }); log('30 unlock ซ้ำ', r); guard2xx('30dup', r)
log('30 sql', q(`select status, locked_at, locked_by, sent_at from accounting_periods where id='${ID.PERIOD}'`))
const a = await openAs('uat.account'); const ap = a.page
await ap.goto(`${BASE}/accounting?tab=closing`); await settle(ap)
r = await api(ap, 'PATCH', `/api/accounting/wht-certificates/${ID.WHT016}/cancel`, { reason: 'probe R8 หลังปลดล็อก', reissue: false }); log('30 WHT cancel (sent again)', r); guard2xx('30w', r)
r = await api(ap, 'PATCH', `/api/accounting/expenses/${ID.ER}/cost-center`, { costCenterId: '00000000-0000-4000-8000-000000000001', reason: 'probe R8 หลังปลดล็อก' }); log('30 cost-center (sent again)', r); guard2xx('30c', r)
// R8.31
const f = await openAs('uat.finance'); const fp_ = f.page
await fp_.goto(`${BASE}/finance?tab=adjustment`); await settle(fp_); await sleep(1000)
await fp_.getByRole('button', { name: /สร้าง Adjustment/ }).first().click(); await sleep(900)
const d2 = fp_.locator('[role="dialog"]').last()
await d2.locator('select').first().selectOption('payout_batch'); await sleep(500)
await d2.locator('input[placeholder^="เช่น CASE"]').fill('OUT-2'); await d2.getByRole('button', { name: 'ค้นหา' }).click(); await sleep(1200)
await d2.getByRole('button', { name: /OUT-2/ }).first().click(); await sleep(800)
await d2.locator('select').nth(1).selectOption('increase')
await d2.locator('input[placeholder="0.00"]').fill('50.00')
await d2.locator('textarea').fill('ธนาคารเรียกค่าธรรมเนียมโอนเพิ่มสำหรับรอบ OUT-2 ขอปรับเพิ่มยอดรอบจ่าย UAT R8')
log('31 dlg', await dlgText(fp_, 2400)); await shot(fp_, R, '31a-a2-form')
{ const rp = fp_.waitForResponse(x => x.url().endsWith('/api/adjustments') && x.request().method() === 'POST', { timeout: 15000 })
  await d2.getByRole('button', { name: 'สร้างรายการ' }).click(); const x = await rp; log('31 POST', x.status(), (await x.text()).slice(0, 600)) }
log('31 toast', await waitToast(fp_)); await sleep(1200); await settle(fp_)
await shot(fp_, R, '31b-a2-pending', { fullPage: true })
const A2 = q1('select id from adjustments order by created_at desc limit 1'); log('A2', A2)
log('31 sql', q(`select adjustment_type, amount_satang, status, period_status_at_target, revenue_id is not null r, expense_id is not null e, billing_batch_id is not null b, payout_batch_id='${ID.OUT2}' p_out2 from adjustments where id='${A2}'`))
// R8.32
const row = fp_.locator('tbody tr').filter({ hasText: 'OUT-2' }).first()
await row.getByRole('button', { name: /อนุมัติ/ }).first().click(); await sleep(800)
const d3 = fp_.locator('[role="dialog"]').last(); log('32 dlg', await dlgText(fp_, 1200)); await shot(fp_, R, '32a-finance-approve-a2-modal')
{ const rp = fp_.waitForResponse(x => x.url().includes(`/api/adjustments/${A2}/approve`), { timeout: 15000 }); await d3.getByRole('button', { name: /ยืนยันอนุมัติ/ }).click(); const x = await rp; log('32 finance approve', x.status(), (await x.text()).slice(0, 700)) }
log('32 toast', await waitToast(fp_)); await sleep(1000); await settle(fp_)
log('32 main', (await mainText(fp_, 2400)).slice(-700)); await shot(fp_, R, '32b-a2-partial', { fullPage: true })
r = await api(fp_, 'PATCH', `/api/adjustments/${A2}/approve`, { note: 'ซ้ำ probe' }); log('32 finance approve ซ้ำ', r); guard2xx('32dup', r)
log('32 sql', q(`select status from adjustments where id='${A2}'`), q(`select action, actor_role, after_data->'approved_roles' ar, after_data->'missing_approver_roles' mr from audit_logs where target_type='adjustments' and target_id='${A2}' order by created_at`))
// R8.33
await ep.goto(`${BASE}/finance?tab=adjustment`); await settle(ep); await sleep(1000)
const row2 = ep.locator('tbody tr').filter({ hasText: 'OUT-2' }).first()
log('33 exec row', (await row2.innerText()).replace(/\s+/g, ' '))
await row2.getByRole('button', { name: 'ปฏิเสธ' }).click(); await sleep(800)
const d4 = ep.locator('[role="dialog"]').last(); const rb = d4.getByRole('button', { name: /ยืนยันปฏิเสธ/ })
log('33 dlg', await dlgText(ep, 1200), '| confirm disabled (ว่าง):', await rb.isDisabled())
await shot(ep, R, '33a-reject-modal-empty')
await d4.locator('textarea').fill('ค่าธรรมเนียมธนาคารเป็นค่าใช้จ่ายของบริษัท ไม่ใช่ยอดจ่ายผู้รับเงิน — บันทึกเป็นค่าธรรมเนียมธนาคารนอกรอบจ่าย')
await shot(ep, R, '33b-reject-modal-filled')
{ const rp = ep.waitForResponse(x => x.url().includes(`/api/adjustments/${A2}/reject`), { timeout: 15000 }); await rb.click(); const x = await rp; log('33 reject', x.status(), (await x.text()).slice(0, 500)) }
log('33 toast', await waitToast(ep)); await sleep(1000); await settle(ep)
log('33 main', (await mainText(ep, 2600)).slice(-900)); await shot(ep, R, '33c-a2-rejected', { fullPage: true })
r = await api(ep, 'PATCH', `/api/adjustments/${A2}/approve`, { note: 'probe' }); log('33 approve หลังปฏิเสธ', r); guard2xx('33a', r)
r = await api(ep, 'PATCH', `/api/adjustments/${A2}/reject`, { rejectionReason: 'probe ปฏิเสธซ้ำอีกครั้ง' }); log('33 reject ซ้ำ', r); guard2xx('33b', r)
log('33 sql', q(`select status, left(rejection_reason,60) rr, rejected_by is not null rb from adjustments where id='${A2}'`))
log('33 out2', q(`select name, status, total_net_satang from payout_batches where id='${ID.OUT2}'`))
// R8.34
await ap.goto(`${BASE}/accounting?tab=closing`); await settle(ap); await sleep(1000)
await ap.locator('main').getByRole('button', { name: 'ล็อกงวด' }).first().click(); await sleep(800)
const d5 = ap.locator('[role="dialog"]').last()
await d5.locator('textarea').fill('ล็อกงวด ต.ค. 2569 อีกครั้งหลังพิจารณารายการปรับปรุง OUT-2 แล้ว UAT R8')
await shot(ap, R, '34a-relock-modal')
{ const rp = ap.waitForResponse(x => x.url().includes(`/periods/${ID.PERIOD}/lock`), { timeout: 15000 }); await d5.getByRole('button', { name: /ยืนยันล็อกงวด/ }).click(); const x = await rp; log('34 relock', x.status(), (await x.text()).slice(0, 300)) }
log('34 toast', await waitToast(ap)); await sleep(1200); await settle(ap)
log('34 closing', await mainText(ap, 1400)); await shot(ap, R, '34b-closing-relocked', { fullPage: true })
log('34 sql', q(`select status, locked_by=(select id from users where username='uat.account') by_acc, locked_at from accounting_periods where id='${ID.PERIOD}'`))
r = await api(ap, 'PATCH', `/api/accounting/tax-invoices/${ID.INV2}/cancel`, { reason: 'probe R8 หลังล็อกใหม่' }); log('34 cancel INV-0002', r); guard2xx('34p', r)
log('audit since T', q(auditSince(T)))
log('errs', e.serverErrors, a.serverErrors, f.serverErrors, e.consoleErrors.slice(0, 3), f.consoleErrors.slice(0, 3))
await Promise.all([e, a, f].map(x => x.browser.close()))
