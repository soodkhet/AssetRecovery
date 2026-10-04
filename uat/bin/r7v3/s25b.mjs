import { openAs, log } from './_h.mjs'
const f = await openAs('uat.finance')
const r = await (await f.page.request.get('http://localhost:3000/api/reports/advance-overdue')).json()
log('F5 rows', JSON.stringify(r.data.rows ?? r.data.data ?? Object.keys(r.data)).slice(0, 300))
await f.browser.close()
