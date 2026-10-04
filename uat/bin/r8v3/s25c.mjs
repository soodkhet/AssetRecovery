import { openAs, log, BASE, shot, R, settle, sleep, mainText } from './_h.mjs'
const e = await openAs('uat.exec'); const p = e.page
const j = await (await p.request.get(`${BASE}/api/reports/finance/revenue-summary?groupBy=company&refresh=true`)).json()
log('25c F2 company', JSON.stringify((j.data?.rows ?? []).map(r => [r.group, r.revenueSatang, r.caseCount, r.revenuePerCaseSatang])), JSON.stringify(j.error ?? ''))
await p.goto(`${BASE}/reports`); await settle(p); await sleep(1200)
await shot(p, R, '25d-reports-catalog', { fullPage: true })
await p.goto(`${BASE}/reports/company-scorecard`); await settle(p); await sleep(1500)
log('25c E2 ui', p.url(), await mainText(p, 900))
await shot(p, R, '25e-company-scorecard', { fullPage: true })
await e.browser.close()
