// R8.01–R8.05 ก่อนล็อก (งวด sent_to_accountant)
import { openAs, shot, R, ID, log, q, q1, settle, sleep, mainText, BASE, api, guard2xx, fp, auditSince } from './_h.mjs'
log('=== R8.01-05', new Date().toISOString())
const FP0 = fp(); log('FP0', FP0)
const P = `/api/accounting/periods/${ID.PERIOD}`
// R8.01
const ex = await openAs('uat.exec'); const acc = await openAs('uat.account')
for (const [n, s] of [['exec', ex], ['account', acc]]) {
  await s.page.goto(`${BASE}/accounting?tab=closing`); await settle(s.page); await sleep(1200)
  log(`01 ${n} closing`, await mainText(s.page, 1800))
  const btns = await s.page.locator('main button').allInnerTexts(); log(`01 ${n} buttons`, btns.map(x => x.trim()).filter(Boolean).join(' / '))
  await shot(s.page, R, `01-${n}-closing-sent`, { fullPage: true })
}
// R8.02 นโยบาย
await ex.page.goto(`${BASE}/settings/finance?tab=lock`); await settle(ex.page); await sleep(1200)
log('02 exec settings lock url', ex.page.url()); log('02 exec lock tab', await mainText(ex.page, 2200))
await shot(ex.page, R, '02-exec-settings-lock', { fullPage: true })
log('02 api policy (exec)', await api(ex.page, 'GET', '/api/settings/period-lock-policy'))
await acc.page.goto(`${BASE}/settings/finance?tab=lock`); await settle(acc.page); await sleep(1000)
log('02 account settings lock url', acc.page.url()); log('02 account lock tab', await mainText(acc.page, 900))
await shot(acc.page, R, '02-account-settings-lock', { fullPage: true })
// R8.03 probe สิทธิ์
const fin = await openAs('uat.finance'); const mgr = await openAs('uat.mgr.in'); const in1 = await openAs('uat.agent.in1', { mobile: true }); const co = await openAs('uat.co1.mgr')
let r
r = await api(fin.page, 'PATCH', `${P}/lock`, { reason: 'probe' }); log('03 finance lock', r); guard2xx('fin lock', r)
r = await api(fin.page, 'GET', '/api/accounting/periods'); log('03 finance GET periods', r)
await fin.page.goto(`${BASE}/accounting`); await settle(fin.page); await sleep(800)
log('03 finance /accounting url', fin.page.url()); log('03 finance nav', (await fin.page.locator('nav, aside').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400))
await shot(fin.page, R, '03-finance-accounting-redirect')
r = await api(mgr.page, 'PATCH', `${P}/lock`, { reason: 'probe' }); log('03 mgr.in lock', r); guard2xx('mgr lock', r)
r = await api(mgr.page, 'GET', '/api/adjustments'); log('03 mgr.in GET adjustments', r)
await mgr.page.goto(`${BASE}/accounting`); await settle(mgr.page); await sleep(800); log('03 mgr.in /accounting url', mgr.page.url())
await shot(mgr.page, R, '03-mgr-accounting-redirect')
r = await api(in1.page, 'GET', '/api/accounting/periods'); log('03 in1 GET periods', r)
r = await api(in1.page, 'POST', '/api/adjustments', { targetType: 'revenue', targetId: ID.C1REV, adjustmentType: 'decrease', amountSatang: 10000, reason: 'probe in1 ห้ามสร้าง' }); log('03 in1 POST adjustments', r); guard2xx('in1 adj', r)
r = await api(co.page, 'GET', '/api/accounting/periods'); log('03 co1.mgr GET periods', r)
r = await api(co.page, 'GET', '/api/adjustments'); log('03 co1.mgr GET adjustments', r)
r = await api(acc.page, 'PATCH', `${P}/unlock`, { reason: 'probe' }); log('03 account unlock', r); guard2xx('acc unlock', r)
r = await api(ex.page, 'PATCH', `${P}/send`, { reason: 'probe' }); log('03 exec send', r); guard2xx('exec send', r)
log('03 FP', fp() === FP0 ? 'FP=FP0' : 'FP DIFF ' + fp())
// R8.04 นโยบายจำกัด
r = await api(acc.page, 'PATCH', `/api/accounting/wht-certificates/${ID.WHT016}/cancel`, { reason: 'probe R8 งวดส่งแล้ว', reissue: false }); log('04 account WHT cancel (sent)', r); guard2xx('wht', r)
r = await api(acc.page, 'PATCH', `/api/accounting/expenses/${ID.ER}/cost-center`, { costCenterId: '00000000-0000-4000-8000-000000000001', reason: 'probe R8 งวดส่งแล้ว' }); log('04 account cost-center (sent)', r); guard2xx('cc', r)
log('04 FP', fp() === FP0 ? 'FP=FP0' : 'FP DIFF ' + fp())
// R8.05 baseline รายงาน (เก็บแคช — ไม่ refresh)
for (const dim of ['company', 'team']) {
  r = await api(ex.page, 'GET', `/api/reports/profitability?dimension=${dim}&period=month`); log(`05 profit ${dim}`, r.slice(0, 1400))
}
await ex.page.goto(`${BASE}/finance?tab=profit`); await settle(ex.page); await sleep(1500)
log('05 exec profit ui', await mainText(ex.page, 1800))
await shot(ex.page, R, '05-exec-profit-baseline', { fullPage: true })
log('audit since T0', q(auditSince('2026-10-04 05:51:54+00')))
log('errs', ex.serverErrors, acc.serverErrors, fin.serverErrors, mgr.serverErrors, in1.serverErrors, co.serverErrors, ex.consoleErrors.slice(0, 4))
await Promise.all([ex, acc, fin, mgr, in1, co].map(s => s.browser.close()))
