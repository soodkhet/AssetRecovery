// R13.42 ค่าตั้งภาษี WHT: probe สิทธิ์ → ชุดที่ 1 → probe วันย้อนหลัง/เหตุผลว่าง → ชุดที่ 2 คืนค่า · R13.43 แท็บ WHT
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText, post, get } from './_h.mjs'
log('=== h42', new Date().toISOString())
const T = new Date().toISOString()
const URL = `${BASE}/settings/finance?tab=whtpolicy`
const bkk = (d = 0) => new Date(Date.now() + 7 * 3600e3 + d * 864e5).toISOString().slice(0, 10)
const body = (o) => ({ effectiveFrom: bkk(), baseExpenseTypes: ['commission', 'no_success_fee', 'fuel', 'allowance'], certificateMode: 'per_payee_batch', incomeTypeMode: 'all_40_8', issueZeroRate402Certificate: true, inhouseIncomeCategory: 'sec_40_2', outsourceIncomeCategory: 'sec_40_8', filingMethod: 'online', reason: 'UAT R13 probe ห้ามบันทึก', ...o })
// probe ก่อน
for (const u of ['uat.account', 'uat.finance']) {
  const s = await openAs(u); const p = s.page
  await p.goto(URL); await settle(p); await sleep(1200)
  log(u, 'url', p.url().replace(BASE, ''), 'btn ตั้งค่าชุดใหม่:', await p.getByRole('button', { name: '+ ตั้งค่าชุดใหม่' }).count())
  log(u, 'text', await mainText(p, 500))
  await shot(p, R, `42-probe-${u.replace('uat.', '')}`)
  log(u, 'GET', (await get(p, '/api/settings/wht-policy')).slice(0, 120))
  log(u, 'POST', await post(p, '/api/settings/wht-policy', body({})))
  await s.browser.close()
}
log('history after probes', q('select count(*) from wht_policy_history'))
const e = await openAs('uat.exec'); const p = e.page
await p.goto(URL); await settle(p); await sleep(1200)
log('exec before:', await mainText(p, 1500))
await shot(p, R, '42-exec-before', { fullPage: true })
async function fill(o) {
  await p.getByRole('button', { name: '+ ตั้งค่าชุดใหม่' }).click(); await sleep(700)
  const d = p.locator('[role="dialog"]').last()
  if (o.from) await d.locator('#wht-policy-from').fill(o.from)
  if (o.income) await d.locator('#wht-policy-income').selectOption(o.income)
  await sleep(300)
  if (o.inhouse) await d.locator('#wht-policy-inhouse').selectOption(o.inhouse)
  if (o.outsource) await d.locator('#wht-policy-outsource').selectOption(o.outsource)
  if (o.filing) await d.locator('#wht-policy-filing').selectOption(o.filing)
  if (o.zero !== undefined) { const c = d.locator('#wht-policy-zero-rate'); if (await c.count() && (await c.isChecked()) !== o.zero) await c.click() }
  await d.locator('#wht-policy-reason').fill(o.reason ?? '')
  return d
}
// ชุดที่ 1
let d = await fill({ income: 'by_team_side', inhouse: 'sec_40_1', outsource: 'sec_40_8', filing: 'paper', reason: 'UAT R13 ทดสอบค่าตั้ง (คืนค่าในขั้นเดียวกัน)' })
log('modal1:', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 1400))
await shot(p, R, '42-set1-modal')
await d.getByRole('button', { name: 'บันทึกค่าตั้ง' }).click()
log('toast1', await toasts(p, 2500)); await sleep(800)
log('after set1:', await mainText(p, 1500))
await shot(p, R, '42-set1-saved', { fullPage: true })
// probe วันย้อนหลัง + เหตุผลว่าง (ผ่านหน้าจอ)
d = await fill({ from: bkk(-1), reason: 'UAT R13 probe วันมีผลย้อนหลัง' })
await d.getByRole('button', { name: 'บันทึกค่าตั้ง' }).click(); await sleep(1500)
log('backdate:', (await d.innerText().catch(() => '(closed)')).replace(/\s+/g, ' ').slice(0, 700), await toasts(p, 300))
await shot(p, R, '42-probe-backdate')
await d.locator('#wht-policy-from').fill(bkk()); await d.locator('#wht-policy-reason').fill('')
await d.getByRole('button', { name: 'บันทึกค่าตั้ง' }).click(); await sleep(1000)
log('empty reason:', (await d.innerText().catch(() => '(closed)')).replace(/\s+/g, ' ').slice(0, 700))
await d.getByRole('button', { name: 'ยกเลิก' }).click(); await sleep(500)
log('API backdate', await post(p, '/api/settings/wht-policy', body({ effectiveFrom: bkk(-1) })))
log('API empty reason', await post(p, '/api/settings/wht-policy', body({ reason: '' })))
log('history after set1+probes', q('select count(*) from wht_policy_history'))
// ชุดที่ 2 คืนค่า
d = await fill({ income: 'all_40_8', filing: 'online', reason: 'คืนค่าเดิมหลังทดสอบ R13' })
await sleep(300)
if (await d.locator('#wht-policy-inhouse').count()) { await d.locator('#wht-policy-inhouse').selectOption('sec_40_2'); await d.locator('#wht-policy-outsource').selectOption('sec_40_8') }
const z = d.locator('#wht-policy-zero-rate'); log('zero-rate checkbox', await z.count(), await z.count() ? await z.isChecked() : '-')
log('modal2:', (await d.innerText()).replace(/\s+/g, ' ').slice(0, 1400))
await shot(p, R, '42-set2-modal')
await d.getByRole('button', { name: 'บันทึกค่าตั้ง' }).click()
log('toast2', await toasts(p, 2500)); await sleep(800)
log('after set2:', await mainText(p, 1800))
await shot(p, R, '42-set2-restored', { fullPage: true })
log(q(`select effective_from, base_expense_types, certificate_mode, income_type_mode, issue_zero_rate_402_certificate z, inhouse_income_category ih, outsource_income_category os, filing_method, reason, created_at from wht_policy_history order by created_at`))
log(q(`select action,target_type,reason from audit_logs where created_at > '${T}' order by created_at`))
log('5xx', e.serverErrors)
await e.browser.close()
