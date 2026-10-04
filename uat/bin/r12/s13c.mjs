import { sess, call } from './_h.mjs'
const f = await sess('uat.finance')
const r = await call(f, 'GET', '/api/reports/finance/revenue-summary'); const d = r.body.data
console.log(JSON.stringify({ rows: d.rows, kpis: d.kpis ?? d.summary, notes: d.notes }).slice(0, 1500))
