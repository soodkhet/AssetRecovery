import { openAs, shot, BASE, log, q, settle, sleep } from './_h.mjs'
const ids = Object.fromEntries(q(`select case_ref||'='||id from cases`).split('\n').filter(l => l.includes('=') && l.includes('UAT')).map(l => l.trim().split('=')))
const get = async (S, path) => { const r = await S.page.request.get(`${BASE}${path}`); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch {} ; return { s: r.status(), j, t } }
const items = x => { const d = x.j?.data; return Array.isArray(d) ? d : (d?.items ?? []) }
const summ = x => `${x.s} total=${x.j?.meta?.total ?? items(x).length} ${items(x).map(i => `${i.caseRef}:${i.status}`).sort().join(',')}`
log('== R2.19b approver filter options')
{ const S = await openAs('uat.approver'); await S.page.goto(`${BASE}/cases/submit`); await settle(S.page)
  log('approver company filter', await S.page.locator('main select[aria-label="กรองตามบริษัทไฟแนนซ์"]').evaluate(e => [...e.options].map(o => o.text)))
  await S.browser.close() }
log('== R2.29')
{ const S = await openAs('uat.co2.admin')
  log('co2 list', summ(await get(S, '/api/cases?limit=100')))
  const rnd = await get(S, '/api/cases/00000000-0000-4000-8000-000000000000')
  for (const k of ['UAT-CO1-001', 'UAT-CO1-008']) { const g = await get(S, `/api/cases/${ids[k]}`); log('co2 GET', k, g.s, 'same as random', g.t === rnd.t) }
  const g3 = await get(S, `/api/cases/${ids['UAT-CO2-003']}`); const d = g3.j?.data ?? {}
  const sensitive = Object.entries(d).filter(([k, v]) => /team|revenue|serviceFee|projected|createdBy|reviewed|teamChange/i.test(k)).map(([k, v]) => `${k}=${JSON.stringify(v)}`)
  log('co2 GET C3', g3.s, sensitive.join(' | '))
  await S.browser.close() }
for (const u of ['uat.co1.mgr', 'uat.co1.sup']) { const S = await openAs(u); log(u, summ(await get(S, '/api/cases?limit=100'))); await S.browser.close() }
{ const S = await openAs('uat.mgr.out')
  log('mgr.out', summ(await get(S, '/api/cases?limit=100')))
  await S.page.goto(`${BASE}/cases/assign`); await settle(S.page); await sleep(800)
  log('mgr.out assign refs', [...new Set((await S.page.locator('main').first().innerText()).match(/UAT-CO\d-\d{3}/g) ?? [])])
  await shot(S.page, 'R2', 'R2.29-mgr-out-assign', { fullPage: true })
  await S.browser.close() }
{ const S = await openAs('uat.mgr.in')
  log('mgr.in', summ(await get(S, '/api/cases?limit=100')))
  await S.page.goto(`${BASE}/cases/assign`); await settle(S.page); await sleep(800)
  log('mgr.in assign refs', [...new Set((await S.page.locator('main').first().innerText()).match(/UAT-CO\d-\d{3}/g) ?? [])].sort())
  await shot(S.page, 'R2', 'R2.29-mgr-in-assign', { fullPage: true })
  await S.browser.close() }
log('== R2.30')
log(q(`select n.event_code,u.username,count(*) from notifications n join users u on u.id=n.user_id group by 1,2 order by 1`))
{ const S = await openAs('uat.admin'); await S.page.goto(`${BASE}/dashboard`); await settle(S.page)
  const bell = S.page.getByRole('button', { name: /แจ้งเตือน/ }).first()
  log('bell count', await S.page.getByRole('button', { name: /แจ้งเตือน/ }).count(), await bell.getAttribute('aria-label').catch(() => null), (await bell.innerText().catch(() => '')).trim())
  await bell.click().catch(e => log('bell click fail', e.message.slice(0, 80))); await sleep(1200)
  const panel = S.page.locator('[role=dialog],[role=menu],[role=region]').filter({ hasText: 'UAT-CO' }).first()
  const txt = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ')
  log('bell panel', txt.slice(0, 900))
  log('panel dates BE?', /\d{2}\/\d{2}\/2569/.test(txt), 'CE?', /\/20\d{2}\b/.test(txt))
  await shot(S.page, 'R2', 'R2.30-admin-notifications')
  await S.browser.close() }
