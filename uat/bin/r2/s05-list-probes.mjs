import { openAs, shot, BASE, collect, log, q, settle, sleep, CASES, apiBody, CO1_ID } from './_h.mjs'
const ids = Object.fromEntries(q(`select case_ref||'='||id from cases`).split('\n').filter(l => l.includes('=') && l.includes('UAT')).map(l => l.trim().split('=')))
const C = k => ids[CASES[k].ref]
log('== R2.16')
const A = await openAs('uat.admin'); const page = A.page
await page.goto(`${BASE}/cases/submit`); await settle(page)
const main = (await page.locator('main').first().innerText()).replace(/\s+/g, ' ')
log('kpi', main.slice(0, 330))
const rows = await page.locator('tbody tr').allInnerTexts()
log('rows', rows.length); for (const r of rows) log('  ', r.replace(/\s+/g, ' '))
log('date regex all rows', rows.every(r => /\d{2}\/\d{2}\/2569 \d{2}:\d{2}/.test(r)), 'CE?', rows.some(r => /\/20\d{2}/.test(r)))
await shot(page, 'R2', 'R2.16-list-8-pending', { fullPage: true })
const sels = await page.locator('main select').evaluateAll(es => es.map(e => `${e.id}|${e.getAttribute('aria-label')}|${[...e.options].slice(0, 3).map(o => o.text).join(',')}`))
log('selects', sels)
const inputs = await page.locator('main input:not([type=file])').evaluateAll(es => es.map(e => `${e.id}|${e.type}|${e.placeholder}|${e.getAttribute('aria-label')}`))
log('inputs', inputs)
await page.locator('main select').first().selectOption({ label: 'รอพิจารณา' })
const search = page.locator('main input[type=search], main input[placeholder*="ค้นหา"]').first()
await search.fill('UAT-CO2'); await sleep(1200); await settle(page)
const f = await page.locator('tbody tr').allInnerTexts()
log('filtered', f.length, f.map(r => r.split(/\s+/)[0]))
await shot(page, 'R2', 'R2.16-filter-co2')
await A.browser.close()

log('== R2.17 perms')
const probe = async (u, method, path, data) => {
  const S = await openAs(u)
  const r = method === 'POST' ? await S.page.request.post(`${BASE}${path}`, { data }) : await S.page.request.patch(`${BASE}${path}`, { data })
  const b = await r.text(); await S.browser.close()
  let code = ''; try { code = JSON.parse(b).error?.code ?? '' } catch {}
  return `${r.status()} ${code}`
}
const dummy = ref => apiBody(CASES.C1, { caseRef: ref, assetImeiSerial: '356789100000999' })
const res = {
  a: await probe('uat.agent.in1', 'POST', '/api/cases', dummy('UAT-PROBE-AG')),
  b: await probe('uat.agent.in1', 'PATCH', `/api/cases/${C('C2')}/status`, { action: 'accept' }),
  c: await probe('uat.finance', 'POST', '/api/cases', dummy('UAT-PROBE-FN')),
  d: await probe('uat.finance', 'PATCH', `/api/cases/${C('C2')}/status`, { action: 'accept' }),
  e: await probe('uat.admin', 'PATCH', `/api/cases/${C('C2')}/status`, { action: 'accept' }),
  f: await probe('uat.mgr.in', 'PATCH', `/api/cases/${C('C1')}/status`, { action: 'accept' }),
  g: await probe('uat.approver', 'POST', '/api/cases', dummy('UAT-PROBE-AP')),
  h: await probe('uat.co1.mgr', 'POST', `/api/cases/${C('C1')}/documents`, { documentType: 'contract_doc', fileUrl: `cases/${C('C1')}/contract_doc/x.pdf`, fileHash: '0'.repeat(64), originalName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10 }),
}
log(res)
log(q(`select count(*) probe from cases where case_ref like 'UAT-PROBE%'`))
log(q(`select case_ref,status,assigned_team_id from cases where case_ref in ('UAT-CO1-001','UAT-CO1-002')`))
log(q(`select count(*) docs_c1 from case_documents where case_id='${C('C1')}'`))

log('== R2.18 scope')
const get = async (S, path) => { const r = await S.page.request.get(`${BASE}${path}`); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch {} ; return { s: r.status(), j, t } }
const summ = x => { const d = x.j?.data; const items = Array.isArray(d) ? d : (d?.items ?? d?.cases ?? d?.rows); return `${x.s} total=${x.j?.meta?.total ?? x.j?.data?.total ?? items?.length} refs=${items?.map(i => i.caseRef).sort().join(',')}` }
{
  const S = await openAs('uat.co2.admin')
  const l = await get(S, '/api/cases?limit=100'); log('co2.admin list', summ(l))
  const d0 = Array.isArray(l.j?.data) ? l.j.data : (l.j?.data?.items ?? []); log('co2 sample redact', JSON.stringify(d0.map(i => ({ fc: i.financeCompanyName, st: i.suggestedTeamName, at: i.assignedTeamName, by: i.createdByName, pr: i.projectedRevenueSatang }))))
  const g1 = await get(S, `/api/cases/${C('C1')}`), g0 = await get(S, '/api/cases/00000000-0000-4000-8000-000000000000')
  log('co2 GET C1', g1.s, g1.t.slice(0, 200)); log('co2 GET rnd', g0.s, g0.t.slice(0, 200), 'same?', g1.t === g0.t)
  log('co2 ?finance_company_id=CO1', summ(await get(S, `/api/cases?finance_company_id=${CO1_ID}`)), '?search=UAT-CO1', summ(await get(S, '/api/cases?search=UAT-CO1')))
  await S.page.goto(`${BASE}/cases`); await settle(S.page)
  const t = await S.page.locator('main').first().innerText().catch(() => '')
  log('co2 /cases url', S.page.url(), 'has UAT-?', /UAT-CO/.test(t), t.replace(/\s+/g, ' ').slice(0, 150))
  await shot(S.page, 'R2', 'R2.18-co2-cases-placeholder')
  await S.page.goto(`${BASE}/cases/submit`); await settle(S.page); log('co2 /cases/submit →', S.page.url())
  await S.browser.close()
}
{
  const S = await openAs('uat.co1.mgr')
  log('co1.mgr list', summ(await get(S, '/api/cases?limit=100')))
  const g = await get(S, `/api/cases/${C('C1')}`); const d = g.j?.data
  log('co1.mgr GET C1', g.s, JSON.stringify({ pr: d?.projectedRevenueSatang, at: d?.assignedTeamId, st: d?.suggestedTeamId, stn: d?.suggestedTeamName }))
  log('co1.mgr GET C3', (await get(S, `/api/cases/${C('C3')}`)).s)
  await S.browser.close()
}
{
  const S = await openAs('uat.mgr.out')
  log('mgr.out list', summ(await get(S, '/api/cases?limit=100')), 'GET C1', (await get(S, `/api/cases/${C('C1')}`)).s)
  await S.page.goto(`${BASE}/cases`); await settle(S.page)
  const t = await S.page.locator('main').first().innerText().catch(() => '')
  log('mgr.out /cases url', S.page.url(), 'refs', t.match(/UAT-CO\d-\d{3}/g))
  await shot(S.page, 'R2', 'R2.18-mgr-out-assign')
  await S.browser.close()
}
{
  const S = await openAs('uat.mgr.in'); log('mgr.in list', summ(await get(S, '/api/cases?limit=100'))); await S.browser.close()
}
{
  const S = await openAs('uat.agent.in1'); const x = await get(S, '/api/cases'); log('agent list', x.s, x.j?.error?.code); await S.browser.close()
}
{
  const S = await openAs('uat.finance'); log('finance list', summ(await get(S, '/api/cases?limit=100'))); await S.browser.close()
}
