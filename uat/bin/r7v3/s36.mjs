// R7.36 ตรวจปลาย R7 + probe สิทธิ์ Export ซ้ำหลังแก้ BUG-116 (body ไม่ครบ — สิทธิ์ถูกตรวจก่อน parse)
import { openAs, shot, R, ID, log, q, q1, settle, sleep, BASE, auditSince, api, guard2xx } from './_h.mjs'
log('=== R7.36', new Date().toISOString())
const T = q1('select now()')
const V1 = q1('select id from export_records where version=1')
for (const u of ['uat.finance', 'uat.exec']) {
  const s = await openAs(u)
  const a = await api(s.page, 'POST', '/api/accounting/export-pack', {}); log(`36 ${u} POST export-pack`, a); guard2xx('export', a)
  const b = await api(s.page, 'PATCH', `/api/accounting/export-history/${V1}/mark-sent`, {}); log(`36 ${u} PATCH mark-sent v1`, b); guard2xx('mark', b)
  const r = await s.page.request.get(`${BASE}/api/accounting/export-history/${V1}/download`); log(`36 ${u} GET download v1`, r.status(), r.headers()['content-type'], (await r.body()).length)
  if (u === 'uat.exec') { await s.page.goto(`${BASE}/accounting?tab=closing`); await settle(p0(s)); await sleep(1000); await shot(s.page, R, '36a-exec-closing-sent', { fullPage: true }) }
  await s.browser.close()
}
function p0(s) { return s.page }
log('36 audit (ต้องว่าง)', q(auditSince(T)))
