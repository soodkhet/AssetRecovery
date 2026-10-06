import { openAs, BASE, log, get } from './_h.mjs'
const f = await openAs('uat.finance')
log('F4 API nov emp', await get(f.page, '/api/reports/finance/compensation?groupBy=employee&preset=custom&from=2026-11-01&to=2026-11-30', 4000))
await f.browser.close()
