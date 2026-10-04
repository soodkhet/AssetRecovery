import { sess, call, ID, INV1 } from './_h.mjs'
const c = await sess('uat.co1.mgr')
const P = ['/api/portal/dashboard', '/api/portal/cases', `/api/portal/cases/${ID.C1}`, '/api/portal/billing-batches', '/api/portal/tax-invoices', `/api/portal/tax-invoices/${INV1}/download`, '/api/portal/handover-lots', `/api/portal/handover-lots/${ID.LOT3}/download`, '/api/portal/reports/revenue-summary', '/api/portal/reports/ar-aging', '/api/portal/company-profile', `/api/portal/handover-lots/${ID.LOT3}`, `/api/portal/assets/${ID.AS1}/photos/0`]
const tally = {}; let bad = []
for (const p of P) for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  const r = await call(c, m, p, {}); tally[r.status] = (tally[r.status] ?? 0) + 1
  if (r.status < 300 || ![404, 405].includes(r.status)) bad.push(`${m} ${p} ${r.status} ${r.code}`)
}
// HEAD/OPTIONS แค่จด
const h = await c.fetch('/api/portal/dashboard', { method: 'OPTIONS', failOnStatusCode: false })
console.log(JSON.stringify({ n: P.length * 4, tally, bad, options: h.status(), allow: h.headers()['allow'] }))
if (bad.some(b => / 2\d\d /.test(b))) process.exit(9)
