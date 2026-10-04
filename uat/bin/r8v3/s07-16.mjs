// R8.07–R8.16 probe เขียนตรงหลังล็อก — ทุกข้อคาด 400 PERIOD_LOCKED_DIRECT_EDIT · ไม่มี mutation
import { openAs, shot, R, ID, D, log, q, q1, settle, sleep, waitToast, mainText, dlgText, BASE, api, guard2xx, fp, auditSince } from './_h.mjs'
log('=== R8.07-16', new Date().toISOString())
const T = q1('select now()'); const FP1 = fp(); log('T', T, 'FP1', FP1)
const P = `/api/accounting/periods/${ID.PERIOD}`
const chk = tag => { const f = fp(); log(`${tag} FP`, f === FP1 ? 'FP=FP1' : '!!! FP DIFF ' + f); if (f !== FP1) { log('!!! STOP mutation'); process.exit(8) } }
let r
// R8.07 in1 มือถือ ขอเบิก
const m = await openAs('uat.agent.in1', { mobile: true }); const mp = m.page
await mp.goto(`${BASE}/field/advances`); await settle(mp); await sleep(1200)
log('07 in1 advances', await mainText(mp, 900))
await shot(mp, R, '07a-in1-advances', { fullPage: true })
const reqBtn = mp.getByRole('button', { name: /ขอเงินทดรอง/ })
log('07 request btn', await reqBtn.count())
if (await reqBtn.count()) {
  await reqBtn.first().click(); await sleep(800)
  const md = mp.locator('[role="dialog"]').last()
  await md.locator('input').first().fill('500')
  await md.locator('textarea').first().fill('probe R8 งวดปิดแล้ว')
  const dd = md.locator('input[type=date]'); if (await dd.count() && !(await dd.inputValue())) await dd.fill('2026-10-10')
  await shot(mp, R, '07b-in1-advance-form')
  const rp = mp.waitForResponse(x => x.url().includes('/api/advances') && x.request().method() === 'POST', { timeout: 10000 }).catch(() => null)
  await md.getByRole('button', { name: /ส่งคำขอ/ }).click()
  const x = await rp; const t = x ? `${x.status()} ${(await x.text()).slice(0, 400)}` : '(no request)'; log('07 POST', t); guard2xx('07', t)
  await sleep(600); log('07 dlg/toast', await dlgText(mp, 700), await waitToast(mp, 3000))
  await shot(mp, R, '07c-in1-advance-blocked')
}
chk('07')
// R8.09 in1 claim API
r = await api(mp, 'POST', '/api/claims', { claimType: 'manual', grossSatang: 10000, expenseDate: D, note: 'probe R8 งวดปิดแล้ว' }); log('09 in1 POST claims', r); guard2xx('09', r)
chk('09')
// R8.08 การเงิน เคลียร์ ADV3 (UI)
const f = await openAs('uat.finance'); const p = f.page
await p.goto(`${BASE}/finance?tab=advances`); await settle(p); await sleep(1000)
const btn = p.locator('tbody tr').filter({ hasText: 'เลยกำหนดเคลียร์' }).getByRole('button', { name: /เคลียร์ยอด/ })
log('08 settle btn', await btn.count())
if (await btn.count()) {
  await btn.first().click(); await sleep(800)
  const d = p.locator('[role="dialog"]').last(); await d.locator('input').first().fill('2000.00'); await sleep(300)
  log('08 dlg', await dlgText(p, 900))
  await shot(p, R, '08a-finance-settle-adv3-form')
  const rp = p.waitForResponse(x => x.url().includes('/api/advances') && x.request().method() !== 'GET', { timeout: 10000 }).catch(() => null)
  await d.getByRole('button', { name: 'บันทึกการเคลียร์ยอด' }).click()
  const x = await rp; const t = x ? `${x.status()} ${(await x.text()).slice(0, 400)}` : '(no request)'; log('08 settle', t); guard2xx('08', t)
  await sleep(500); log('08 toast/dlg', await waitToast(p, 3000), await dlgText(p, 500))
  await shot(p, R, '08b-finance-settle-adv3-blocked')
}
log('08 adv3', q1(`select status from advances where id='${ID.ADV3}'`))
chk('08')
// R8.10 / R8.11
r = await api(p, 'POST', '/api/payout-batches', { side: 'inhouse', cutoffDate: D }); log('10 finance POST payout-batches', r); guard2xx('10', r)
r = await api(p, 'POST', '/api/billing-batches', { companyId: ID.CO1, cutoffDate: D, cycleId: null, reason: 'probe R8 งวดปิดแล้ว' }); log('11 finance POST billing-batches', r); guard2xx('11', r)
chk('10-11')
// R8.12 บัญชี ยกเลิก INV-0002
const a = await openAs('uat.account'); const ap = a.page
await ap.goto(`${BASE}/accounting?tab=closing`); await settle(ap)
r = await api(ap, 'PATCH', `/api/accounting/tax-invoices/${ID.INV2}/cancel`, { reason: 'probe R8 งวดปิดแล้ว' }); log('12 account cancel INV-0002', r); guard2xx('12', r)
chk('12')
// R8.13 ยกเลิก 50 ทวิ 016 (UI)
await ap.goto(`${BASE}/accounting?tab=wht`); await settle(ap); await sleep(1200)
const row = ap.locator('tbody tr').filter({ hasText: 'WHT-2569-016' })
log('13 row', (await row.first().innerText().catch(() => '')).replace(/\s+/g, ' '))
await row.getByRole('button', { name: 'ยกเลิก' }).click(); await sleep(800)
const d2 = ap.locator('[role="dialog"]').last()
await d2.locator('textarea').fill('probe R8 งวดปิดแล้ว')
log('13 dlg', await dlgText(ap, 900))
await shot(ap, R, '13a-wht016-cancel-form')
{ const rp = ap.waitForResponse(x => x.url().includes('/cancel') && x.request().method() === 'PATCH', { timeout: 15000 }).catch(() => null)
  await d2.getByRole('button', { name: 'ยืนยันยกเลิก' }).click()
  const x = await rp; const t = x ? `${x.status()} ${(await x.text()).slice(0, 400)}` : '(no request)'; log('13 cancel', t); guard2xx('13', t)
  await sleep(400); log('13 toast/dlg', await waitToast(ap, 3000), await dlgText(ap, 400))
  await shot(ap, R, '13b-wht016-cancel-blocked') }
log('13 wht', q1(`select count(*)||'/'||sum(wht_satang) from wht_certificates where status='active'`))
chk('13')
// R8.14 งานจัดหมวด
r = await api(ap, 'PATCH', `/api/accounting/expenses/${ID.ER}/cost-center`, { costCenterId: '00000000-0000-4000-8000-000000000001', reason: 'probe R8 งวดปิดแล้ว' }); log('14 account cost-center (locked)', r); guard2xx('14', r)
// R8.15 statement
r = await api(ap, 'POST', '/api/bank-reconciliation/import', { bankAccountId: ID.BANK, fileName: 'probe-R8.csv', csv: `วันที่,รายละเอียด,อ้างอิง,เงินเข้า,เงินออก\n${D},probe R8,PRB8,1.00,` }); log('15 account import statement', r); guard2xx('15', r)
chk('14-15')
// R8.16 action ของรอบ
r = await api(ap, 'PATCH', `${P}/lock`, { reason: 'probe' }); log('16 account lock', r); guard2xx('16a', r)
r = await api(ap, 'PATCH', `${P}/send`, { reason: 'probe' }); log('16 account send', r); guard2xx('16b', r)
r = await api(ap, 'PATCH', `${P}/unlock`, { reason: 'probe' }); log('16 account unlock', r); guard2xx('16c', r)
r = await api(p, 'PATCH', `${P}/unlock`, { reason: 'probe' }); log('16 finance unlock', r); guard2xx('16d', r)
await ap.goto(`${BASE}/accounting?tab=closing`); await settle(ap); await sleep(800)
log('16 account buttons', (await ap.locator('main button').allInnerTexts()).map(x => x.trim()).join(' / '))
chk('16')
log('16 audit since T', q(auditSince(T)))
log('errs', m.serverErrors, f.serverErrors, a.serverErrors, m.consoleErrors.slice(0, 3), f.consoleErrors.slice(0, 3), a.consoleErrors.slice(0, 3))
await Promise.all([m, f, a].map(s => s.browser.close()))
