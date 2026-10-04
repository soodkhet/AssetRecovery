import { login, call, ID } from './_h.mjs'
const c = await login('uat.co2.admin')
for (const p of ['/api/portal/dashboard', `/api/portal/cases/${ID.C5}`]) { const r = await call(c, 'GET', p); console.log(p, r.status) }
