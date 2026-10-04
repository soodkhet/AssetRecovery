// R9c ผู้จัดการ/หัวหน้า O1–O5
import { openAs, shot, R, getJ, log, sleep, summ, exportUI, btns, clickBtn, openReport, screenText, fp } from './_h.mjs'
log('==== R9c', new Date().toISOString())
async function role(u, tag, opts = {}) {
  const s = await openAs(u); const p = s.page
  const G = async (path, label) => { const r = await getJ(p, path); log(`--- [${u}] ${label ?? path} → ${r.status}`); log(r.status === 200 ? summ(r.body) : JSON.stringify(r.body).slice(0, 200)); return r }
  await p.goto('http://localhost:3000/reports'); await sleep(3000); await shot(p, R, `${tag}a-reports-menu`, { fullPage: true })
  const L = await getJ(p, '/api/reports'); log(`[${u}] list`, L.body.data.reports.map(r => `${r.code}`).join(','))
  log(`[${u}] nav`, (await p.locator('nav, aside').first().innerText()).replace(/\s+/g, ' ').slice(0, 200))
  for (const d of ['team', 'company', 'month']) await G(`/api/reports/success-rate?dimension=${d}&refresh=true`, `O1 ${d}`)
  await G('/api/reports/team-performance?refresh=true', 'O2'); await G('/api/reports/workload?refresh=true', 'O3')
  await G('/api/reports/sla-breach?refresh=true', 'O4'); await G('/api/reports/warehouse-summary?refresh=true', 'O5')
  await openReport(p, 'success-rate', 6000); await shot(p, R, `${tag}b-o1-team`, { fullPage: true })
  if (opts.full) {
    await openReport(p, 'team-performance', 6000); await shot(p, R, `${tag}c-o2`, { fullPage: true })
    await openReport(p, 'workload', 6000); await shot(p, R, `${tag}d-o3`, { fullPage: true })
    await openReport(p, 'sla-breach', 5000); await shot(p, R, `${tag}e-o4-empty`, { fullPage: true }); log('O4 screen', (await screenText(p)).slice(0, 400))
    await openReport(p, 'warehouse-summary', 6000); await shot(p, R, `${tag}f-o5`, { fullPage: true })
  }
  if (opts.probe) {
    for (const sl of ['gross-profit', 'kpi-summary', 'wht-summary']) { const r = await getJ(p, `/api/reports/${sl}`); log(`[${u}] probe ${sl} → ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`) }
    await openReport(p, 'success-rate', 6000)
    const r = await exportUI(p, 'ส่งออก Excel', 'R9.25'); log('EXPORT', r.name)
  }
  log(`[${u}] console`, s.consoleErrors.filter(e => !/same key/.test(e)).slice(0, 4), 'server', s.serverErrors)
  await s.browser.close()
}
await role('uat.mgr.in', '21', { full: true, probe: true })
await role('uat.mgr.out', '24', { full: true })
await role('uat.sup.in', '25', {})
log('R9c FP', fp())
