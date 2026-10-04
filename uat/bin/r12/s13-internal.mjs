import { sess, call, INV1, ID } from './_h.mjs'
import { writeFileSync, readFileSync } from 'node:fs'
const f = await sess('uat.finance'), a = await sess('uat.account'), m = await sess('uat.co1.mgr')
const ar = await call(f, 'GET', '/api/ar-aging'); console.log('ar-aging', ar.status, JSON.stringify(ar.body).slice(0, 700))
for (const p of ['/api/reports/finance/F2', '/api/reports/finance/F3']) { const r = await call(f, 'GET', p); console.log(p, r.status, JSON.stringify(r.body).slice(0, 900)) }
const ip = await a.get(`/api/accounting/tax-invoices/${INV1}/pdf`, { failOnStatusCode: false }); const ib = await ip.body()
const pp = await m.get(`/api/portal/tax-invoices/${INV1}/download`, { failOnStatusCode: false }); const pb = await pp.body()
writeFileSync('uat/fixtures/downloads-R12/internal-account-INV-0001.pdf', ib)
const strip = b => b.toString('latin1').replace(/\/(CreationDate|ModDate) \(D:[^)]*\)/g, '').replace(/\/ID \[[^\]]*\]/g, '')
console.log('internal', ip.status(), ip.headers()['content-type'], ib.length, 'portal', pp.status(), pb.length, 'sameAfterStrip', strip(ib) === strip(pb))
