import { sess, call, log, ID } from './_h.mjs'
const c = await sess('uat.co1.mgr')
for (const p of ['/api/portal/dashboard','/api/portal/cases?limit=100','/api/portal/cases/'+ID.C1,'/api/portal/billing-batches','/api/portal/tax-invoices','/api/portal/handover-lots','/api/portal/handover-lots/'+ID.LOT3,'/api/portal/reports/revenue-summary','/api/portal/reports/ar-aging','/api/portal/company-profile']) {
  const r = await call(c,'GET',p); console.log('##', p, r.status, JSON.stringify(r.body).slice(0, 900))
}
