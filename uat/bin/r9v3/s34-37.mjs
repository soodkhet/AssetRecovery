// R9e กวาดสิทธิ์ · ผู้ใช้บริษัท/Portal · role ไม่มีเมนู · แคช
import { request } from '@playwright/test'
import { openAs, shot, R, getJ, postJ, log, sleep, clickBtn, openReport, screenText, fp, BASE } from './_h.mjs'
log('==== R9e', new Date().toISOString())
const SL = { F: ['gross-profit','revenue-summary','ar-aging','compensation','advance-overdue'], O: ['success-rate','team-performance','workload','sla-breach','warehouse-summary'], A: ['wht-summary','tax-invoice','export-history','exception-summary'], E: ['kpi-summary','company-scorecard','team-scorecard'] }
const users = ['uat.finance','uat.account','uat.mgr.in','uat.mgr.out','uat.sup.in','uat.exec','admin','uat.admin','uat.approver','uat.agent.in1','uat.agent.in2','uat.agent.out1','uat.co1.mgr','uat.co1.sup','uat.co2.admin']
const leakRe = /\d{4,}|กำไร|รายได้|ยูเอที|ทีม A/
for (const u of users) {
  const s = await openAs(u, { mobile: /agent/.test(u) }); const p = s.page
  const row = {}; const leaks = []; let n500 = 0
  for (const [cat, list] of Object.entries(SL)) {
    const st = []
    for (const sl of list) { const r = await getJ(p, `/api/reports/${sl}`); st.push(r.status); if (r.status >= 500) n500++; if (r.status === 403 && leakRe.test(JSON.stringify(r.body))) leaks.push(sl) }
    row[cat] = [...new Set(st)].join('/') + (new Set(st).size > 1 ? ` (${st.join(',')})` : '')
  }
  const L = await getJ(p, '/api/reports')
  log(`R9.34 ${u.padEnd(15)} F=${row.F} O=${row.O} A=${row.A} E=${row.E} list=${L.status}:${L.body?.data?.reports?.length} leak=${leaks.join(',') || '-'} 500=${n500}`)
  if (/co\d|uat.admin|approver|agent.in1/.test(u)) {
    await p.goto(`${BASE}/`); await sleep(2500); const home = p.url()
    const tag = u.replace('uat.', '').replace('.', '')
    if (/co\d/.test(u)) { await shot(p, R, `35-${tag}-home`, { fullPage: true }); log(`R9.35 ${u} home ${home} text`, (await screenText(p)).slice(0, 200)) }
    for (const path of ['/reports', '/reports/revenue-summary', '/reports/ar-aging']) { await p.goto(`${BASE}${path}`); await sleep(2500); log(`R9.35/36 ${u} open ${path} → ${p.url()} · ${(await screenText(p)).slice(0, 90)}`) }
    if (u === 'uat.co1.mgr' || u === 'uat.admin' || u === 'uat.agent.in1') await shot(p, R, `${/co/.test(u) ? 35 : 36}-${tag}-open-reports`, { fullPage: true })
    log(`R9.36 ${u} nav`, (await p.locator('nav, aside, header').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160))
    if (/co\d/.test(u)) {
      const g = await getJ(p, '/api/reports/revenue-summary?groupBy=company'); log(`R9.35 ${u} F2 company`, g.status, JSON.stringify(g.body).slice(0, 120))
      for (const path of ['/api/portal/reports', '/api/portal/revenue-summary']) { const r = await getJ(p, path); log(`R9.35 ${u} ${path} → ${r.status}`) }
      const ex = await postJ(p, '/api/reports/revenue-summary/export', { format: 'xlsx', preset: 'this_month' }); log(`R9.35 ${u} POST export → ${ex.status}`)
    }
  }
  await s.browser.close()
}
// ไม่ล็อกอิน
const anon = await request.newContext(); const ar = await anon.get(`${BASE}/api/reports/gross-profit`); log('R9.34 anon gross-profit', ar.status(), (await ar.text()).slice(0, 150)); const al = await anon.get(`${BASE}/api/reports`); log('R9.34 anon list', al.status()); await anon.dispose()
// R9.37 แคช
const s = await openAs('uat.exec'); const p = s.page
await openReport(p, 'gross-profit', 5000)
const c0 = await getJ(p, '/api/reports/gross-profit?dimension=company'); log('R9.37 F1 before', JSON.stringify(c0.body.data.cache))
await clickBtn(p, 'รีเฟรชตอนนี้'); await sleep(2500)
const c1 = await getJ(p, '/api/reports/gross-profit?dimension=company&refresh=true'); log('R9.37 refresh=true (2nd within 5 min)', c1.status, JSON.stringify(c1.body.data.cache))
await clickBtn(p, 'รีเฟรชตอนนี้'); await sleep(2500); await shot(p, R, '37a-refresh-throttled', { fullPage: true }); log('R9.37 screen', (await screenText(p)).slice(0, 500))
const c2 = await getJ(p, '/api/reports/gross-profit?refresh=1'); log('R9.37 refresh=1', c2.status, JSON.stringify(c2.body).slice(0, 250))
const c3 = await postJ(p, '/api/reports/gross-profit/refresh', {}); log('R9.37 POST refresh', c3.status, JSON.stringify(c3.body).slice(0, 300))
for (const sl of ['compensation', 'advance-overdue', 'wht-summary', 'tax-invoice', 'export-history', 'exception-summary']) { const r = await getJ(p, `/api/reports/${sl}`); const c = r.body.data.cache; log(`R9.37 ${sl} mode=${c.mode} fromCache=${c.fromCache} exp=${c.expiresAt}`) }
for (const sl of ['success-rate', 'kpi-summary']) { const r = await getJ(p, `/api/reports/${sl}`); const c = r.body.data.cache; log(`R9.37 ${sl} mode=${c.mode} fromCache=${c.fromCache} exp=${c.expiresAt}`) }
log('R9.37 console', s.consoleErrors.filter(e => !/same key/.test(e)).slice(0, 3), s.serverErrors)
await s.browser.close()
log('R9e FP', fp())
