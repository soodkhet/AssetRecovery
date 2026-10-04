// R9.12 ส่งออก (การเงิน) + R9.13 probe สิทธิ์
import { openAs, shot, R, getJ, postJ, log, sleep, exportUI, clickBtn, openReport, screenText, fp, q } from './_h.mjs'
const s = await openAs('uat.finance'); const p = s.page
const ex = async (label, pre) => { const r = await exportUI(p, label, pre); log('EXPORT', pre, r.name); return r }
await openReport(p, 'gross-profit', 5000); await clickBtn(p, 'รีเฟรชตอนนี้'); await sleep(2000)
await ex('ส่งออก Excel', 'R9.12'); await ex('ส่งออก PDF', 'R9.12')
await openReport(p, 'revenue-summary', 4000); await clickBtn(p, 'รายบริษัทไฟแนนซ์'); await clickBtn(p, 'รีเฟรชตอนนี้'); await sleep(2000)
await ex('ส่งออก Excel', 'R9.12')
await openReport(p, 'compensation', 4000); await clickBtn(p, 'รายพนักงาน'); await sleep(3000)
await shot(p, R, '10b-f4-employee', { fullPage: true })
await ex('ส่งออก PDF', 'R9.12')
// R9.13 probes
const G = async path => { const r = await getJ(p, path); log(`R9.13 GET ${path} → ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`) }
for (const sl of ['kpi-summary', 'company-scorecard', 'team-scorecard', 'wht-summary', 'success-rate']) await G(`/api/reports/${sl}`)
log('R9.13 POST export E1', JSON.stringify(await postJ(p, '/api/reports/kpi-summary/export', { format: 'xlsx', preset: 'this_month' })).slice(0, 250))
log('R9.13 POST refresh E1', JSON.stringify(await postJ(p, '/api/reports/kpi-summary/refresh', {})).slice(0, 250))
for (const path of ['/api/reports/finance/gross-profit', '/api/reports/finance/advance-overdue', '/api/reports/executive/kpi-summary', '/api/reports/accounting/wht-summary', '/api/reports/operations/success-rate', '/api/reports/finance/kpi-summary']) {
  const r = await getJ(p, path); const d = r.body?.data; log(`R9.13 alias ${path} → ${r.status} ${d ? `report=${d.report?.code} rows=${d.rows?.length}` : JSON.stringify(r.body).slice(0, 200)}`)
}
await p.goto('http://localhost:3000/reports/kpi-summary'); await sleep(3500)
log('R9.13 page E1 url', p.url(), 'text', (await screenText(p)).slice(0, 400))
await shot(p, R, '13-finance-open-e1-page', { fullPage: true })
log('R9.13 FP', fp())
log('R9.13 audit export', q(`select to_char(created_at at time zone 'Asia/Bangkok','HH24:MI:SS') t, actor_role, target_type, target_id, reason, after->>'report_code' code, after->>'format' fmt, after->>'row_count' rows from audit_logs where action='export' and created_at > '2026-10-04 06:15:54+00' order by created_at`))
log('R9.13 console', s.consoleErrors.filter(e => !/same key/.test(e)).slice(0, 5), 'server', s.serverErrors)
await s.browser.close()
