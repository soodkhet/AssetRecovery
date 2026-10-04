import { sess, call, log, ID } from './_h.mjs'
const a = await sess('admin')
let r = await call(a, 'GET', `/api/roles/${ID.R_ADMIN}/permissions`)
const d = r.body.data
console.log('roleperm keys', Object.keys(d), JSON.stringify(d).slice(0, 400))
const all = JSON.stringify(d); const locked = [...all.matchAll(/"code":"([a-z_]+)"[^{}]*?"locked":true/g)].map(m => m[1])
const locked2 = []; const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.locked === true || (o.locked && typeof o.locked === 'object') || typeof o.locked === 'string') locked2.push(o.code ?? o.capabilityCode); Object.values(o).forEach(walk) } }; walk(d)
log('R10.21 role ธุรการ locked', [...new Set(locked2)].sort().join(','), 'n=' + new Set(locked2).size)
r = await call(a, 'GET', '/api/settings/functional-permissions'); const f = r.body.data
console.log('func', JSON.stringify(f).slice(0, 500))
const l3 = []; const caps = new Set(); const walk2 = (o) => { if (Array.isArray(o)) o.forEach(walk2); else if (o && typeof o === 'object') { if (o.code && typeof o.code === 'string' && /^[a-z_]+$/.test(o.code)) caps.add(o.code); if (o.locked) l3.push(o.code ?? o.capabilityCode); Object.values(o).forEach(walk2) } }; walk2(f)
log('R10.21 functional caps n=' + caps.size, 'locked', [...new Set(l3)].sort().join(','), 'n=' + new Set(l3).size)
