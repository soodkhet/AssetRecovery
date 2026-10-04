import { PERSONAS, sess, call, log } from './_h.mjs'
const first = await call(await sess('uat.finance'), 'GET', '/api/meta/menu'); console.log(JSON.stringify(first.body).slice(0, 600))
const ids = (o) => { if (Array.isArray(o)) return o.map(ids).join(' · '); const ch = o.children ?? o.items ?? o.subItems ?? o.sub ?? []; return (o.id ?? o.key) + (ch.length ? '(' + ch.map((c) => c.id ?? c.key).join(',') + ')' : '') }
for (const u of PERSONAS) { const r = await call(await sess(u), 'GET', '/api/meta/menu'); const d = r.body.data; const arr = Object.values(d).find(Array.isArray) ?? []; log('MENU', u, d.audience, ids(arr)) }
