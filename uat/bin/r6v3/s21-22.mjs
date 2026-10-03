// R6.21 ยืนยัน payee in1/out1 + probe · R6.22 probe นโยบายบังคับเอกสาร
import { openAs, shot, BASE, settle, sleep, log, R, q, waitToast, flat, dlgText, api, guard2xx, PY, SQLB, dlgReasonConfirm } from './_hb.mjs'
log('=== s21-22', new Date().toISOString())
const f = await openAs('uat.finance'); const p = f.page
await p.goto(`${BASE}/finance?tab=payee`); await settle(p); await sleep(1000)
log('R6.21 tabs:', flat(await p.locator('main').innerText()).slice(0, 600))
await shot(p, R, '38-R6.21-payee-before', { fullPage: true })
async function verify(name, reason, n) {
  const r = p.locator('tbody tr').filter({ hasText: name })
  log(`row ${name} count`, await r.count(), flat(await r.first().innerText()).slice(0, 250))
  await r.first().getByRole('button', { name: 'ยืนยัน', exact: true }).click(); await sleep(500)
  const d = p.locator('[role="dialog"]').last()
  log('dialog:', await dlgText(p, 600))
  const btn = d.getByRole('button', { name: 'ยืนยันผู้รับเงิน' })
  log('empty reason → disabled?', await btn.isDisabled())
  if (n) await shot(p, R, n)
  const res = await dlgReasonConfirm(p, reason, 'ยืนยันผู้รับเงิน', '/verify')
  log('verify', name, res)
  log('toast', await waitToast(p, 6000))
}
await verify('อนันต์ ตามทรัพย์', 'ตรวจสมุดบัญชีกสิกรไทยและบัตรประชาชนแล้ว UAT R6', '39-R6.21-verify-modal')
await sleep(1500)
await verify('ประเสริฐ รับเหมา', 'ตรวจสมุดบัญชีไทยพาณิชย์แล้ว UAT R6')
await sleep(1500)
await p.reload(); await settle(p); await sleep(1000)
log('rows after:', flat(await p.locator('tbody').innerText()).slice(0, 900))
await shot(p, R, '40-R6.21-payee-verified', { fullPage: true })
const pr = await api(p, 'PATCH', `/api/payees/${PY.in2}/verify`, {}); log('probe verify in2 {}', pr); guard2xx('verify-empty', pr)
log(q(SQLB.payee))
log(q(`select action,target_type,left(target_id::text,8),before_data->>'is_verified' b,after_data->>'is_verified' a,reason from audit_logs where target_type='payee_profiles' and created_at > '2026-10-03 19:14:00+00'`))
log('5xx', f.serverErrors, f.consoleErrors.slice(0, 3))
await f.browser.close()
// exec ไม่เห็นแท็บ payee
const x = await openAs('uat.exec'); const xp = x.page
await xp.goto(`${BASE}/finance?tab=payee`); await settle(xp); await sleep(1000)
log('exec tabs:', flat(await xp.locator('main').innerText()).slice(0, 400), '| url', xp.url())
await shot(xp, R, '41-R6.21-exec-no-payee-tab')
await x.browser.close()
// R6.22 นโยบาย
async function policy(on, reason, shotName) {
  const a = await openAs('admin'); const ap = a.page
  await ap.goto(`${BASE}/settings/finance?tab=approval`); await settle(ap); await sleep(1200)
  const cb = ap.locator('label', { hasText: 'บังคับแนบเอกสารยืนยันตัวตนผู้รับเงิน' }).locator('input[type=checkbox]')
  log('policy checkbox before', await cb.isChecked())
  if ((await cb.isChecked()) !== on) await cb.click()
  await ap.locator('#policy-reason').fill(reason)
  const [resp] = await Promise.all([ap.waitForResponse(r => r.request().method() !== 'GET' && r.url().includes('/api/settings'), { timeout: 20000 }), ap.getByRole('button', { name: 'บันทึกนโยบายการเงิน' }).click()])
  log('policy save', on, resp.status(), (await resp.text()).slice(0, 300))
  log('toast', await waitToast(ap, 6000))
  if (shotName) { await cb.scrollIntoViewIfNeeded(); await shot(ap, R, shotName) }
  await a.browser.close()
}
await policy(true, 'UAT R6 ทดสอบบังคับเอกสาร payee ชั่วคราว', '42-R6.22-policy-on')
log(q(`select require_payee_id_document, advance_max_amount_per_request_satang from finance_policy_settings`))
const f2 = await openAs('uat.finance')
const pr2 = await api(f2.page, 'PATCH', `/api/payees/${PY.in2}/verify`, { reason: 'ทดสอบ policy เอกสาร UAT R6' }); log('probe verify in2 with policy', pr2); guard2xx('verify-policy', pr2)
await f2.browser.close()
await policy(false, 'UAT R6 คืนค่านโยบายหลังทดสอบ')
log(q(`select require_payee_id_document, advance_max_amount_per_request_satang from finance_policy_settings`))
log(q(SQLB.payee))
log(q(SQLB.auditNB))
