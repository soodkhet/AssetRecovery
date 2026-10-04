import { sess, ID } from './_h.mjs'
const c = await sess('uat.co2.admin')
for (const i of [0,1,2]) { const r = await c.get(`/api/portal/assets/${ID.AS5}/photos/${i}`, { failOnStatusCode:false }); console.log(i, r.status(), r.headers()['content-type'], r.headers()['cache-control'], (await r.body()).length) }
const m = await sess('uat.co1.mgr')
for (const i of [0,6,7]) { const r = await m.get(`/api/portal/assets/${ID.AS1}/photos/${i}`, { failOnStatusCode:false }); console.log('mgr',i, r.status(), r.headers()['content-type'], (await r.body()).length) }
