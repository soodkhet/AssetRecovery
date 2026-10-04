// R9b บัญชี A1–A4
import { openAs, shot, R, getJ, postJ, log, sleep, summ, exportUI, btns, clickBtn, openReport, screenText, fp, q } from './_h.mjs'
log('==== R9b', new Date().toISOString())
const s = await openAs('uat.account'); const p = s.page
const G = async (path, label) => { const r = await getJ(p, path); log(`--- ${label ?? path} → ${r.status}`); log(r.status === 200 ? summ(r.body) : JSON.stringify(r.body).slice(0, 300)); return r }
const ex = async (label, pre) => { const r = await exportUI(p, label, pre); log('EXPORT', pre, r.name); return r }
await p.goto('http://localhost:3000/reports'); await sleep(3000); await shot(p, R, '14-account-reports-menu', { fullPage: true })
const L = await getJ(p, '/api/reports'); log('R9.14 list', L.body.data.reports.map(r => `${r.code}:${r.available}`).join(','))
log('R9.14 nav', (await p.locator('nav, aside').first().innerText()).replace(/\s+/g, ' ').slice(0, 300))
await G('/api/reports/wht-summary', 'R9.15 A1 month'); await G('/api/reports/wht-summary?preset=this_year', 'R9.15 A1 year')
await openReport(p, 'wht-summary', 5000); await shot(p, R, '15-a1-wht', { fullPage: true }); log('A1 screen', (await screenText(p)).slice(0, 700))
log('R9.15 sql', q(`select (select sum(wht_satang) from wht_certificates where status='active' and filing_form='PND3') pnd3_cert, (select sum(wht_satang) from wht_certificates) all_cert, (select pnd3_satang from wht_filing_summaries) pnd3_summary`))
await G('/api/reports/tax-invoice?dimension=month', 'R9.16 A2 month'); await G('/api/reports/tax-invoice?dimension=company', 'R9.16 A2 company')
await openReport(p, 'tax-invoice', 4500); log('A2 buttons', await btns(p)); await shot(p, R, '16a-a2-month', { fullPage: true })
await clickBtn(p, 'รายบริษัทไฟแนนซ์'); await sleep(2500); await shot(p, R, '16b-a2-company', { fullPage: true })
await ex('ส่งออก PDF', 'R9.19')
await G('/api/reports/export-history', 'R9.17 A3')
await openReport(p, 'export-history', 4500); await shot(p, R, '17-a3-export-history', { fullPage: true }); log('A3 screen', (await screenText(p)).slice(0, 900))
await ex('ส่งออก Excel', 'R9.19')
log('R9.17 sql', q(`select version, status, to_char(sent_at at time zone 'Asia/Bangkok','DD/MM/YYYY HH24:MI') sent, (select display_name from users u where u.id=e.sent_by) sent_by, left(file_hash,12) h, case when jsonb_typeof(file_urls)='array' then jsonb_array_length(file_urls) end files from export_records e order by version`))
await G('/api/reports/exception-summary', 'R9.18 A4')
await openReport(p, 'exception-summary', 4500); await shot(p, R, '18-a4-exceptions', { fullPage: true }); log('A4 screen', (await screenText(p)).slice(0, 700))
log('R9.18 sql', q(`select level, status, source_module, left(title,40) from exceptions order by created_at`))
await openReport(p, 'wht-summary', 4500); await ex('ส่งออก Excel', 'R9.19')
for (const sl of ['kpi-summary', 'gross-profit', 'compensation', 'workload']) { const r = await getJ(p, `/api/reports/${sl}`); log(`R9.20 GET ${sl} → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`) }
log('R9.20 FP', fp())
log('R9b console', s.consoleErrors.filter(e => !/same key/.test(e)).slice(0, 5), 'server', s.serverErrors)
await s.browser.close()
