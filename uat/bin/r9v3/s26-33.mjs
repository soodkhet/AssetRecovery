// R9d บริหาร E1–E3 + ข้ามเมนู + N/A + ส่งออก · admin spot-check
import { openAs, shot, R, getJ, log, sleep, summ, exportUI, btns, clickBtn, openReport, screenText, fp, dump } from './_h.mjs'
log('==== R9d', new Date().toISOString())
const s = await openAs('uat.exec'); const p = s.page
const G = async (path, label) => { const r = await getJ(p, path); log(`--- ${label ?? path} → ${r.status}`); log(r.status === 200 ? summ(r.body) : JSON.stringify(r.body).slice(0, 200)); return r }
const ex = async (label, pre) => { const r = await exportUI(p, label, pre); log('EXPORT', pre, r.name); return r }
await p.goto('http://localhost:3000/reports'); await sleep(3000); await shot(p, R, '26-exec-reports-menu', { fullPage: true })
const L = await getJ(p, '/api/reports'); const rs = L.body.data.reports
log('R9.26 list', rs.length, Object.entries(rs.reduce((a, r) => ((a[r.categoryLabel] = (a[r.categoryLabel] ?? 0) + 1), a), {})), 'unavailable', rs.filter(r => !r.available).map(r => r.code))
// E1
const e1 = await G('/api/reports/kpi-summary?refresh=true', 'R9.27 E1 month')
const d1 = e1.body.data; dump('e1-month', d1)
log('E1 extra keys', Object.keys(d1).join(','), 'charts', JSON.stringify(d1.charts ?? d1.chart ?? d1.series ?? null).slice(0, 1500))
await openReport(p, 'kpi-summary', 7000); await shot(p, R, '27a-e1-month', { fullPage: true }); log('E1 screen', (await screenText(p)).slice(0, 1200))
await G('/api/reports/kpi-summary?preset=this_year&refresh=true', 'R9.27 E1 year')
const e1l = await G('/api/reports/kpi-summary?preset=last_month&refresh=true', 'R9.31 E1 last month')
await clickBtn(p, 'เดือนที่แล้ว'); await sleep(4000); await shot(p, R, '31a-e1-last-month-NA', { fullPage: true }); log('E1 lastmonth screen', (await screenText(p)).slice(0, 600))
// E2
await G('/api/reports/company-scorecard?refresh=true', 'R9.28 E2')
await openReport(p, 'company-scorecard', 6000); await shot(p, R, '28-e2', { fullPage: true })
await ex('ส่งออก Excel', 'R9.32')
await G('/api/reports/company-scorecard?preset=last_month&refresh=true', 'R9.31 E2 last month')
await clickBtn(p, 'เดือนที่แล้ว'); await sleep(3500); await shot(p, R, '31b-e2-last-month', { fullPage: true })
// E3
await G('/api/reports/team-scorecard?refresh=true', 'R9.29 E3')
await openReport(p, 'team-scorecard', 6000); await shot(p, R, '29-e3', { fullPage: true }); log('E3 screen', (await screenText(p)).slice(0, 900))
await ex('ส่งออก PDF', 'R9.32')
await openReport(p, 'kpi-summary', 7000); await ex('ส่งออก PDF', 'R9.32')
// R9.30 cross menu
await G('/api/reports/gross-profit?dimension=company&refresh=true', 'R9.30 F1'); await G('/api/reports/revenue-summary?groupBy=company&refresh=true', 'R9.30 F2 company')
await G('/api/reports/revenue-summary?preset=last_month&refresh=true', 'R9.31 F2 last month')
await G('/api/reports/ar-aging?refresh=true', 'R9.30 F3'); await G('/api/reports/wht-summary', 'R9.30 A1'); await G('/api/reports/tax-invoice', 'R9.30 A2')
await G('/api/reports/compensation', 'R9.30 F4')
const pr = await getJ(p, '/api/reports/profitability?dimension=company&period=month&refresh=true'); log('R9.30 profit tab', pr.status, JSON.stringify(pr.body?.data?.rows ?? pr.body).slice(0, 500), JSON.stringify(pr.body?.data?.total ?? pr.body?.data?.totals ?? '').slice(0, 300))
for (const d of ['team', 'company']) await G(`/api/reports/success-rate?dimension=${d}&refresh=true`, `R9.30 O1 ${d}`)
await openReport(p, 'success-rate', 6000); await shot(p, R, '30a-o1-exec-team', { fullPage: true }); await ex('ส่งออก Excel', 'R9.32')
await G('/api/reports/workload?refresh=true', 'R9.30 O3'); await G('/api/reports/warehouse-summary?refresh=true', 'R9.30 O5'); await G('/api/reports/sla-breach?refresh=true', 'R9.30 O4')
await G('/api/reports/team-performance?refresh=true', 'R9.30 O2')
await G('/api/reports/advance-overdue', 'R9.30 F5')
log('R9d console', s.consoleErrors.filter(e => !/same key/.test(e)).slice(0, 5), 'server', s.serverErrors)
await s.browser.close()
// R9.33 admin
const a = await openAs('admin'); const ap = a.page
const AL = await getJ(ap, '/api/reports'); log('R9.33 admin list', AL.status, AL.body?.data?.reports?.length)
const ae1 = await getJ(ap, '/api/reports/kpi-summary'); log('R9.33 admin E1', ae1.status, summ(ae1.body).split('\n').filter(l => /KPI/.test(l)).join(' / '))
const ao1 = await getJ(ap, '/api/reports/success-rate?dimension=team'); log('R9.33 admin O1', ao1.status, summ(ao1.body).split('\n').filter(l => /ROW|TOT/.test(l)).join(' / '))
await ap.goto('http://localhost:3000/reports'); await sleep(3000); await shot(ap, R, '33-admin-reports-menu', { fullPage: true })
log('R9.33 console', a.consoleErrors.slice(0, 3), a.serverErrors)
await a.browser.close()
log('R9d FP', fp())
