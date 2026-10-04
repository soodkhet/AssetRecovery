// R9a การเงิน F1–F5
import { openAs, shot, R, getJ, postJ, log, sleep, dump, summ, exportUI, btns, clickBtn, openReport, screenText, fp } from './_h.mjs'
log('==== R9a', new Date().toISOString(), 'FP', fp())
const s = await openAs('uat.finance'); const p = s.page
const G = async (path, label) => { const r = await getJ(p, path); log(`--- ${label ?? path} → ${r.status}`); log(r.status === 200 ? summ(r.body) : JSON.stringify(r.body).slice(0, 400)); return r }
// R9.03
await p.goto('http://localhost:3000/reports'); await sleep(3000)
await shot(p, R, '03-finance-reports-menu', { fullPage: true })
const L = await getJ(p, '/api/reports'); log('R9.03 list', L.status, L.body.data.reports.map(r => `${r.code}:${r.available}`).join(','))
log('R9.03 nav', (await p.locator('nav, aside').first().innerText()).replace(/\s+/g, ' ').slice(0, 400))
// R9.04 F1 company
await openReport(p, 'gross-profit'); await clickBtn(p, 'รีเฟรชตอนนี้'); await sleep(2000)
await shot(p, R, '04-f1-company', { fullPage: true })
log('R9.04 screen', await screenText(p))
await G('/api/reports/gross-profit?dimension=company', 'R9.04 F1 company (หลังกดรีเฟรชบนจอ)')
// R9.05 team
await clickBtn(p, 'ทีม'); await clickBtn(p, 'รีเฟรชตอนนี้'); await sleep(1500)
await shot(p, R, '05a-f1-team', { fullPage: true })
await G('/api/reports/gross-profit?dimension=team', 'R9.05 F1 team')
const teamSel = await p.locator('#gross-profit-drilldown option').allInnerTexts(); log('team drill options', teamSel)
await p.locator('#gross-profit-drilldown').selectOption({ index: 1 }); await sleep(3000)
await shot(p, R, '05b-f1-drill-teamA', { fullPage: true })
log('drill teamA screen', await screenText(p))
await clickBtn(p, 'บริษัทไฟแนนซ์'); await sleep(1500)
await p.locator('#gross-profit-drilldown').selectOption({ label: 'บริษัท ยูเอที ลิสซิ่ง จำกัด' }); await sleep(3000)
await shot(p, R, '05c-f1-drill-co1', { fullPage: true })
await p.locator('#gross-profit-drilldown').selectOption({ label: 'บริษัท ยูเอที แคปปิตอล จำกัด' }); await sleep(3000)
await shot(p, R, '05d-f1-drill-co2-NA', { fullPage: true })
log('drill co2 screen', await screenText(p))
for (const id of ['e27e79bf-2344-4f52-8979-c58be09a9de6', 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56']) await G(`/api/reports/gross-profit?dimension=company&dimensionId=${id}&refresh=true`, 'drill ' + id.slice(0, 8))
const tl = await getJ(p, '/api/reports/gross-profit?dimension=team'); const ta = tl.body.data.rows.find(r => /ทีม A/.test(r.dimension))
if (ta) await G(`/api/reports/gross-profit?dimension=team&dimensionId=${ta.__key}&refresh=true`, 'drill team A')
// R9.06 ranges
for (const qs of ['preset=last_month', 'preset=this_quarter', 'preset=this_year', 'preset=custom&from=2026-10-04&to=2026-10-04', 'preset=custom&from=2026-10-03&to=2026-10-03', 'preset=custom&from=2026-10-31&to=2026-10-01', 'preset=custom&from=2026-10-04']) {
  const r = await getJ(p, `/api/reports/gross-profit?dimension=company&refresh=true&${qs}`)
  const d = r.body?.data; log(`R9.06 ${qs} → ${r.status} ${d ? `label=${d.range.label} rows=${d.rows.length} tot=${d.totalRow?.revenueSatang}/${d.totalRow?.grossProfitSatang}/${d.totalRow?.marginPct} empty=${JSON.stringify(d.emptyMessage ?? null)}` : JSON.stringify(r.body).slice(0, 250)}`)
}
log('R9.06 404', JSON.stringify(await getJ(p, '/api/reports/no-such-report')))
await openReport(p, 'gross-profit'); await clickBtn(p, 'เดือนที่แล้ว'); await sleep(1500)
await shot(p, R, '06a-f1-last-month-empty', { fullPage: true }); log('lastmonth screen', await screenText(p))
await clickBtn(p, 'ปีนี้'); await shot(p, R, '06b-f1-this-year', { fullPage: true }); log('year label', (await screenText(p)).slice(0, 200))
await clickBtn(p, 'กำหนดเอง'); await p.locator('#report-range-from').fill('2026-10-31'); await p.locator('#report-range-to').fill('2026-10-01'); await sleep(2500)
await shot(p, R, '06c-f1-custom-invalid', { fullPage: true }); log('custom invalid screen', (await screenText(p)).slice(0, 600))
// R9.07 profit tab
const pr0 = await getJ(p, '/api/reports/profitability?dimension=company&period=month')
log('R9.07 profit tab before refresh', pr0.status, JSON.stringify(pr0.body?.data ?? pr0.body).slice(0, 900))
const pr1 = await getJ(p, '/api/reports/profitability?dimension=company&period=month&refresh=true')
log('R9.07 profit tab refresh', pr1.status, JSON.stringify(pr1.body?.data ?? pr1.body).slice(0, 1400))
await p.goto('http://localhost:3000/finance?tab=profit'); await sleep(4000)
await shot(p, R, '07-finance-profit-tab', { fullPage: true }); log('profit tab screen', (await screenText(p)).slice(0, 900))
// R9.08 F2
await openReport(p, 'revenue-summary'); log('F2 buttons', await btns(p))
for (const g of ['month', 'quarter', 'company']) await G(`/api/reports/revenue-summary?groupBy=${g}&refresh=true`, 'R9.08 F2 ' + g)
await p.reload(); await sleep(3500); await shot(p, R, '08a-f2-month', { fullPage: true })
await clickBtn(p, 'รายบริษัทไฟแนนซ์'); await shot(p, R, '08b-f2-company', { fullPage: true }); log('F2 company screen', await screenText(p))
// R9.09 F3
await G('/api/reports/ar-aging?refresh=true', 'R9.09 F3')
await openReport(p, 'ar-aging'); await shot(p, R, '09-f3-ar-aging', { fullPage: true }); log('F3 screen', (await screenText(p)).slice(0, 600))
// R9.10 F4
await G('/api/reports/compensation?groupBy=team', 'R9.10 F4 team'); await G('/api/reports/compensation?groupBy=employee', 'R9.10 F4 employee')
await openReport(p, 'compensation'); log('F4 buttons', await btns(p)); await shot(p, R, '10a-f4-team', { fullPage: true })
// R9.11 F5
await G('/api/reports/advance-overdue', 'R9.11 F5'); await G('/api/reports/advance-overdue?preset=custom&from=2026-10-01&to=2026-10-04', 'R9.11 F5 custom→04/10')
await openReport(p, 'advance-overdue'); await shot(p, R, '11-f5-empty', { fullPage: true }); log('F5 screen', (await screenText(p)).slice(0, 500))
log('R9a errors console', s.consoleErrors.slice(0, 8), 'server', s.serverErrors)
await s.browser.close()
