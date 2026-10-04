import { openAs, log, api } from './_h.mjs'
const f = await openAs('uat.finance')
log('F5', (await api(f.page, 'GET', '/api/reports/advance-overdue')).slice(0, 400))
log('F5 catalog path', (await api(f.page, 'GET', '/api/reports/finance/advance-overdue')).slice(0, 120))
await f.browser.close()
