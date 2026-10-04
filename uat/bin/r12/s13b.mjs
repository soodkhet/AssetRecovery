import { sess, call } from './_h.mjs'
const f = await sess('uat.finance')
for (const p of ['/api/reports/finance/revenue-summary', '/api/reports/revenue-summary']) { const r = await call(f, 'GET', p); const s = JSON.stringify(r.body); const i = s.indexOf('ลิสซิ่ง'); console.log(p, r.status, s.slice(0, 300), '...', i > 0 ? s.slice(i - 300, i + 400) : '') }
