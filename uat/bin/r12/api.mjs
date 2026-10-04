// R12.05 matrix หมวด · R12.07 · R12.15–R12.21 (API ล้วน)
import { request } from '@playwright/test'
import { sess, call, log, rnd, ID, INV1, INV2, BASE, sameDenial, qa } from './_h.mjs'
import { writeFileSync } from 'node:fs'
const out = {}
const T0 = (await import('node:fs')).readFileSync('uat/bin/r12/T0', 'utf8').trim()
const eps = (own) => [
  ['dashboard', '/api/portal/dashboard'], ['cases', '/api/portal/cases'], ['cases/:id', `/api/portal/cases/${own.case}`],
  ['billing-batches', '/api/portal/billing-batches'], ['tax-invoices', '/api/portal/tax-invoices'],
  ['tax-invoices/:id/download', `/api/portal/tax-invoices/${own.inv}/download`], ['handover-lots', '/api/portal/handover-lots'],
  ['handover-lots/:id/download', `/api/portal/handover-lots/${own.lot}/download`], ['reports/revenue-summary', '/api/portal/reports/revenue-summary'],
  ['reports/ar-aging', '/api/portal/reports/ar-aging'], ['company-profile', '/api/portal/company-profile'],
  ['handover-lots/:id', `/api/portal/handover-lots/${own.lot}`], ['assets/:id/photos/0', `/api/portal/assets/${own.asset}/photos/0`]]
const OWN = { 'uat.co1.mgr': { case: ID.C1, inv: INV1, lot: ID.LOT3, asset: ID.AS1 }, 'uat.co1.sup': { case: ID.C1, inv: INV1, lot: ID.LOT3, asset: ID.AS1 }, 'uat.co2.admin': { case: ID.C5, inv: INV2, lot: ID.LOT4, asset: ID.AS5 } }
const ctx = {}; for (const u of [...Object.keys(OWN), 'admin', 'uat.admin', 'uat.finance']) ctx[u] = await sess(u)
const raw = async (c, path) => { const r = await c.fetch(path, { failOnStatusCode: false, maxRedirects: 0 }); const ct = r.headers()['content-type'] ?? ''; const buf = await r.body(); let j = null; if (ct.includes('json')) try { j = JSON.parse(buf.toString()) } catch {} ; return { status: r.status(), ct, len: buf.length, json: j, text: ct.includes('json') ? buf.toString() : '' } }
// R12.05
out.matrix = {}; out.bodies = {}
for (const u of Object.keys(OWN)) { out.matrix[u] = {}; for (const [k, p] of eps(OWN[u])) { const r = await raw(ctx[u], p); out.matrix[u][k] = r.status + (r.json?.error?.code ? ':' + r.json.error.code : '') + (r.status === 200 && !r.ct.includes('json') ? `:${r.ct.split(';')[0]}` : ''); if (r.text) out.bodies[`${u} ${p}`] = r.text } }
out.dashKeys = Object.fromEntries(Object.keys(OWN).map(u => [u, Object.keys(JSON.parse(out.bodies[`${u} /api/portal/dashboard`]).data)]))
const denyMsgs = new Set(); for (const [k, v] of Object.entries(out.bodies)) { const j = JSON.parse(v); if (j.error) denyMsgs.add(JSON.stringify(j.error)) } out.denyBodies = [...denyMsgs]
// R12.07
out.badStatus = (await call(ctx['uat.co1.mgr'], 'GET', '/api/portal/cases?status=closed_success')).status
const st = await call(ctx['uat.co1.mgr'], 'GET', '/api/portal/cases?limit=100')
out.mapping = st.body.data.items.map(i => `${i.caseRef}=${i.statusDisplay.code}/${i.statusDisplay.label}${i.statusReason ? '/' + i.statusReason.slice(0, 20) : ''}`)
// R12.15 ข้ามบริษัท
const X = [
  ['uat.co1.mgr', `/api/portal/cases/${ID.C5}`, id => `/api/portal/cases/${id}`], ['uat.co1.mgr', `/api/portal/cases/${ID.C3}`, id => `/api/portal/cases/${id}`],
  ['uat.co1.mgr', `/api/portal/cases/${ID.C7}`, id => `/api/portal/cases/${id}`], ['uat.co1.mgr', `/api/portal/tax-invoices/${INV2}/download`, id => `/api/portal/tax-invoices/${id}/download`],
  ['uat.co1.mgr', `/api/portal/handover-lots/${ID.LOT4}`, id => `/api/portal/handover-lots/${id}`], ['uat.co1.mgr', `/api/portal/handover-lots/${ID.LOT4}/download`, id => `/api/portal/handover-lots/${id}/download`],
  ['uat.co1.mgr', `/api/portal/assets/${ID.AS5}/photos/0`, id => `/api/portal/assets/${id}/photos/0`],
  ['uat.co1.sup', `/api/portal/cases/${ID.C5}`, id => `/api/portal/cases/${id}`], ['uat.co1.sup', `/api/portal/handover-lots/${ID.LOT4}`, id => `/api/portal/handover-lots/${id}`],
  ['uat.co1.sup', `/api/portal/assets/${ID.AS5}/photos/1`, id => `/api/portal/assets/${id}/photos/1`],
  ['uat.co2.admin', `/api/portal/cases/${ID.C1}`, id => `/api/portal/cases/${id}`], ['uat.co2.admin', `/api/portal/cases/b976a24e-af0d-490c-a8be-e402f9b9ecd4`, id => `/api/portal/cases/${id}`],
  ['uat.co2.admin', `/api/portal/assets/${ID.AS1}/photos/0`, id => `/api/portal/assets/${id}/photos/0`]]
const adBefore = Number(qa(`select count(*) from audit_logs where action='access_denied'`))
out.cross = []
for (const [u, p, mk] of X) {
  const a = await call(ctx[u], 'GET', p), b = await call(ctx[u], 'GET', mk(rnd())), c = await call(ctx[u], 'GET', mk('not-a-uuid'))
  out.cross.push({ u, p: p.replace('/api/portal/', ''), real: `${a.status}:${a.code}`, rnd: `${b.status}:${b.code}`, bad: `${c.status}:${c.code}`, same: sameDenial(a, b) && sameDenial(a, c), leak: a.status === 200 })
}
out.crossAudit = Number(qa(`select count(*) from audit_logs where action='access_denied'`)) - adBefore
out.crossAuditTargets = qa(`select target_type||':'||coalesce(target_id::text,'-')||':'||coalesce(after_data::text,'') from audit_logs where action='access_denied' and actor_id in (select id from users where username like 'uat.co%') and created_at > now() - interval '2 minutes' order by created_at desc limit 6`)
// R12.16 query
out.query = {}
for (const p of [`/api/portal/cases?companyId=${ID.CO2}&limit=100`, `/api/portal/cases?company_id=${ID.CO2}&limit=100`, `/api/portal/cases?search=UAT-CO2`, `/api/portal/handover-lots?companyId=${ID.CO2}`, `/api/portal/billing-batches?companyId=${ID.CO2}`, `/api/portal/tax-invoices?company_id=${ID.CO2}`]) {
  const r = await raw(ctx['uat.co1.mgr'], p); out.query[p.replace('/api/portal/', '')] = `${r.status} co2=${/CO2|dd5c5017|INV-0002|LOT-2569-004/.test(r.text)}`
}
// R12.17 deep-scan
const CO2S = ['dd5c5017', ID.C5, ID.C3, ID.C7, ID.AS5, ID.LOT4, INV2, 'UAT-CO2', 'INV-0002', 'LOT-2569-004', 'DLV-2569-004', '0105561000020', 'แคปปิตอล', 'ประยุทธ์', 'วีระ', 'ปิยะ']
const CO1S = ['e27e79bf', ID.C1, ID.AS1, ID.LOT3, INV1, 'UAT-CO1', 'INV-0001', 'LOT-2569-003', '0105561000011', 'ลิสซิ่ง', 'สมชาย']
const staff = qa(`select string_agg(username||'|'||coalesce(full_name,''),'|') from users u join roles r on r.id=u.role_id where r.role_group<>'finance_company'`).split('|').filter(s => s.length > 3)
const INTERNAL_KEYS = /"(expense\w*|payout\w*|agent\w*|team\w*|cost\w*|imei\w*|serial\w*|createdBy|updatedBy|reviewer\w*|reviewedBy|approvedBy|templateId|template_id|gps\w*|lat|lng|organizationId|companyId)"\s*:/gi
out.scan = []
for (const [k, txt] of Object.entries(out.bodies)) {
  const isCo1 = k.startsWith('uat.co1'), forb = isCo1 ? CO2S : CO1S
  const f = forb.filter(s => txt.includes(s)), imei = txt.match(/3567891\d{8}/g), st2 = staff.filter(s => txt.includes(s)), keys = txt.match(INTERNAL_KEYS)
  if (f.length || imei || st2.length || keys) out.scan.push({ k, other: f, imei, staff: st2.slice(0, 5), keys: keys && [...new Set(keys)] })
}
out.scanned = Object.keys(out.bodies).length
// R12.19 ภายใน → portal API
out.internal = {}
for (const u of ['admin', 'uat.admin', 'uat.finance']) out.internal[u] = await Promise.all(['/api/portal/dashboard', '/api/portal/cases', '/api/portal/company-profile', `/api/portal/cases/${ID.C1}`].map(async p => { const r = await call(ctx[u], 'GET', p); return `${p.replace('/api/portal/', '')}=${r.status}:${r.code}` }))
// R12.20 บริษัท → API ภายใน
out.companyInternal = {}
for (const p of ['/api/cases', `/api/cases/${ID.C1}`, '/api/billing-batches', '/api/finance-companies', `/api/finance-companies/${ID.CO1}`, '/api/ar-aging', '/api/handover-lots', '/api/assets', '/api/revenues', '/api/meta/menu', '/api/notifications', '/api/reports/revenue-summary']) {
  const r = await call(ctx['uat.co1.mgr'], 'GET', p); out.companyInternal[p] = `${r.status}:${r.code}`
}
// R12.21 ไม่ login
const anon = await request.newContext({ baseURL: BASE })
out.anon = { api: (await call(anon, 'GET', '/api/portal/dashboard')).status, page: (await anon.fetch('/portal', { maxRedirects: 0 })).headers()['location'] }
writeFileSync('uat/bin/r12/out/api.json', JSON.stringify(out, null, 1))
const { bodies, ...show } = out; console.log(JSON.stringify(show, null, 1))
