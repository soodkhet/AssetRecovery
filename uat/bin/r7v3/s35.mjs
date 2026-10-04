// R7.35 probe สิทธิ์งานบัญชี — body ไม่ครบทุกตัว (ถ้าสิทธิ์รั่วจะได้ 400 ไม่ใช่ mutation)
import { openAs, R, ID, log, q, q1, api, guard2xx, auditSince, BASE, shot, settle, sleep, mainText } from './_h.mjs'
log('=== R7.35', new Date().toISOString())
const T = q1('select now()')
const W16 = q1("select id from wht_certificates where certificate_number='WHT-2569-016'")
const probes = [
  ['POST', '/api/accounting/tax-invoices', {}],
  ['PATCH', `/api/accounting/wht-certificates/${W16}/cancel`, { reason: '' }],
  ['POST', '/api/accounting/export-pack', {}],
  ['PATCH', `/api/accounting/periods/${ID.PERIOD}/send`, { reason: '' }],
  ['POST', '/api/exceptions', {}],
  ['POST', '/api/accounting/questions', {}],
  ['GET', '/api/accounting/wht-certificates'],
  ['GET', `/api/accounting/periods/${ID.PERIOD}/readiness`],
  ['GET', '/api/accounting/export-history'],
]
for (const u of ['uat.finance', 'uat.exec', 'uat.agent.in1']) {
  const s = await openAs(u, u.includes('agent') ? { mobile: true } : {})
  for (const [m, path, body] of probes) {
    const r = await api(s.page, m, path, body)
    log('35', u, m, path.replace(/[0-9a-f-]{36}/g, ':id'), r.slice(0, 150))
    if (m !== 'GET') guard2xx(`${u} ${path}`, r)
  }
  if (u !== 'uat.agent.in1') {
    await s.page.goto(`${BASE}/accounting?tab=closing`); await settle(s.page); await sleep(900)
    log('35', u, 'page', s.page.url(), (await mainText(s.page, 500)))
    await shot(s.page, R, `35-${u.replace('uat.', '')}-accounting`)
  }
  await s.browser.close()
}
log('35 audit', q(auditSince(T)))
