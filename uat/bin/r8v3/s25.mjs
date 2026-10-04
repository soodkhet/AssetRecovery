// R8.25 รายงานแสดงยอดสุทธิ (+ แคช)
import { openAs, shot, R, log, q, settle, sleep, mainText, BASE, api } from './_h.mjs'
await new Promise(r => setTimeout(r, 65000))
log('=== R8.25', new Date().toISOString())
const e = await openAs('uat.exec'); const p = e.page
const pick = s => { try { const j = JSON.parse(s.slice(4)); const d = j.data; return JSON.stringify({ rows: (d.rows ?? []).map(r => [r.label, r.revenueSatang, r.directCostSatang, r.grossProfitSatang, r.marginPct?.toFixed?.(2)]), total: d.total && [d.total.revenueSatang, d.total.directCostSatang, d.total.grossProfitSatang, d.total.marginPct?.toFixed?.(2)], computedAt: d.computedAt ?? j.meta?.computedAt, fromCache: d.fromCache ?? j.meta?.fromCache }) } catch { return s.slice(0, 600) } }
for (const dim of ['company', 'team']) log(`25 cached ${dim}`, pick(await api(p, 'GET', `/api/reports/profitability?dimension=${dim}&period=month`)))
await p.goto(`${BASE}/finance?tab=profit`); await settle(p); await sleep(1500)
log('25 ui cached', await mainText(p, 1600))
await shot(p, R, '25a-profit-cached-before-refresh', { fullPage: true })
log('25 refresh=1', (await api(p, 'GET', `/api/reports/profitability?dimension=company&period=month&refresh=1`)).slice(0, 300))
const rb = p.getByRole('button', { name: 'รีเฟรชตอนนี้' })
const rp = p.waitForResponse(x => x.url().includes('/api/reports/profitability') && x.url().includes('refresh'), { timeout: 15000 }).catch(() => null)
await rb.click(); const x = await rp; log('25 ui refresh resp', x ? `${x.status()} ${pick(`${x.status()} ${await x.text()}`)}` : '(none)')
await sleep(1500); await settle(p)
log('25 ui after refresh', await mainText(p, 1600))
await shot(p, R, '25b-profit-after-refresh-company', { fullPage: true })
for (const dim of ['company', 'team']) log(`25 refresh ${dim}`, pick(await api(p, 'GET', `/api/reports/profitability?dimension=${dim}&period=month&refresh=true`)))
await p.getByRole('button', { name: 'แยกตามทีม' }).click().catch(() => {}); await sleep(1500)
await shot(p, R, '25c-profit-after-refresh-team', { fullPage: true })
for (const path of ['finance/gross-profit', 'finance/revenue-summary', 'executive/company-scorecard', 'executive/team-scorecard', 'finance/ar-aging', 'finance/compensation', 'finance/advance-overdue', 'accounting/wht-summary', 'accounting/tax-invoice', 'executive/kpi-summary']) {
  const r = await api(p, 'GET', `/api/reports/${path}?refresh=true`)
  log(`25 ${path}`, r.slice(0, 900))
}
log('errs', e.serverErrors, e.consoleErrors.slice(0, 3))
await e.browser.close()
