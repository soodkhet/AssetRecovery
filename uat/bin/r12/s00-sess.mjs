import { sess, call, log } from './_h.mjs'
for (const u of ['uat.co1.mgr','uat.co1.sup','uat.co2.admin','uat.finance','uat.admin','admin']) {
  const c = await sess(u); const r = await call(c,'GET','/api/portal/company-profile'); log('sess', u, r.status, r.body?.data?.username ?? r.body?.data?.user?.username ?? JSON.stringify(r.body).slice(0,120)); await c.dispose()
}
