// R10.08 ลำดับ middleware (claim วันที่ในงวดล็อก) · R10.09 รายงานรายหมวด
import { PERSONAS, sess, call, log, qa } from './_h.mjs'
const ctx = {}; for (const u of PERSONAS) ctx[u] = await sess(u)
const e0 = qa('select count(*) from expenses')
log('--- R10.08 claim 05/10/2569 (งวด ต.ค. locked)')
await Promise.all(PERSONAS.map(async (u) => {
  const r = await call(ctx[u], 'POST', '/api/claims', { claimType: 'manual', grossSatang: 10000, expenseDate: '2026-10-05', note: 'probe R10 ลำดับสิทธิ์' })
  log('CLM', u, r.status, r.code)
  if (r.status >= 200 && r.status < 300) { log('!!! STOP S1 ยามงวดรั่ว', u); process.exit(9) }
}))
log('expenses ก่อน/หลัง', e0, qa('select count(*) from expenses'))
log('--- R10.09 รายงาน')
const jobs0 = qa(`select count(*) from jobs`), ex0 = qa(`select count(*) from audit_logs where action='export'`)
const fin = ctx['uat.finance']
for (const id of ['kpi-summary', 'company-scorecard', 'team-scorecard']) { const r = await call(fin, 'GET', `/api/reports/${id}`); log('FIN-E', id, r.status, r.code) }
let r = await call(fin, 'POST', '/api/reports/kpi-summary/export', { format: 'xlsx' }); log('FIN export xlsx', r.status, r.code)
r = await call(fin, 'POST', '/api/reports/kpi-summary/export', {}); log('FIN export {}', r.status, r.code)
log('jobs/export audit ก่อน-หลัง', jobs0, qa('select count(*) from jobs'), ex0, qa(`select count(*) from audit_logs where action='export'`))
const catIds = (b) => { const d = b?.data ?? b; const arr = Array.isArray(d) ? d : (d?.reports ?? d?.items ?? d?.groups?.flatMap((g) => g.reports ?? g.items ?? []) ?? []); return arr.map((x) => x.code ?? x.id ?? x.slug).join(',') }
for (const u of PERSONAS) {
  const c = await call(ctx[u], 'GET', '/api/reports')
  const gp = await call(ctx[u], 'GET', '/api/reports/gross-profit')
  const nf = await call(ctx[u], 'GET', '/api/reports/no-such-report')
  log('CAT', u, c.status, c.code ?? '', '[' + catIds(c.body) + ']', '| GP', gp.status, gp.code ?? '', '| nosuch', nf.status, nf.code)
}
for (const u of ['uat.mgr.in', 'uat.sup.in', 'uat.mgr.out']) {
  const s = await call(ctx[u], 'GET', '/api/reports/success-rate')
  const t = JSON.stringify(s.body)
  log('SR', u, s.status, 'ทีมA=' + (t.includes('8dc4fa90') || t.includes('ทีม A') || t.includes('TEAM_A')), 'ทีมB=' + (t.includes('5074e06b')), 'ทีมC=' + t.includes('c89d6982'), 'len=' + t.length)
}
