// R13.48 เทียบ co1.mgr + probe `as` · R13.49 มือถือ · R13.34 (ต่อ) view-as CO2 billing (ต่อจาก j47)
import { openAs, shot, BASE, settle, sleep, log, R, q, mainText, get, post } from './_h.mjs'
import { mkdirSync } from 'node:fs'
log('=== j47', new Date().toISOString())
const T = new Date().toISOString()
const CO1 = 'e27e79bf-2344-4f52-8979-c58be09a9de6', CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
log('=== j48', new Date().toISOString()); let p
{ const s = await openAs('uat.admin'); const pp = s.page; await pp.goto(`${BASE}/portal/view-as/${CO2}/billing`); await pp.waitForLoadState('networkidle').catch(() => {}); await sleep(1500); log('R13.34 view-as CO2 billing:', await mainText(pp, 900)); await shot(pp, R, '34-viewas-co2-billing', { fullPage: true }); await s.browser.close() }
// R13.48 co1.mgr
const c = await openAs("uat.co1.mgr"); p = c.page
await p.goto(`${BASE}/portal`); await settle(p); await sleep(2000)
const coHome = await p.locator('body').innerText()
log('R13.48 co1 home:', coHome.replace(/\s*\n+\s*/g, ' | ').slice(0, 1500))
await shot(p, R, '48-co1-home', { fullPage: true })
await p.goto(`${BASE}/portal/billing`); await settle(p); await sleep(1500)
log('R13.48 co1 billing:', await mainText(p, 900))
const T2 = new Date().toISOString()
log('R13.48 co1 as=CO2', await get(p, `/api/portal/dashboard?as=${CO2}`))
log('R13.48 co1 as=CO1', await get(p, `/api/portal/billing-batches?as=${CO1}`))
await c.browser.close()
{ const f = await openAs('uat.finance'); log('R13.48 finance as=CO1', await get(f.page, `/api/portal/dashboard?as=${CO1}`)); await f.browser.close() }
{ const s = await openAs('uat.admin')
  log('R13.48 admin as=0000', await get(s.page, `/api/portal/dashboard?as=00000000-0000-0000-0000-000000000000`))
  log('R13.48 admin POST', await post(s.page, `/api/portal/billing-batches?as=${CO1}`, {}))
  log('R13.48 admin GET as=CO1 dashboard', (await get(s.page, `/api/portal/dashboard?as=${CO1}`)).slice(0, 600))
  await s.browser.close() }
log('R13.48 audit', q(`select action,target_type,actor_role,left(after_data::text,220) after from audit_logs where created_at > '${T2}' order by created_at`))
// R13.49 มือถือ
const m = await openAs('uat.co1.mgr', { mobile: true }); p = m.page
await p.goto(`${BASE}/portal`); await settle(p); await sleep(2500)
await shot(p, R, '49-portal-mobile-home', { fullPage: true })
const ticks = await p.locator('.recharts-xAxis .recharts-cartesian-axis-tick text').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: Math.round(r.left), w: Math.round(r.width) } }))
log('R13.49 x ticks', ticks)
const reds = await p.locator('main *').evaluateAll(els => els.filter(e => e.children.length === 0 && /฿\s?0(\.00)?$|^0$/.test(e.textContent.trim()) && /red|rose/.test(e.className)).map(e => `${e.textContent.trim()}:${e.className}`))
log('R13.49 zero-red home', reds)
await p.goto(`${BASE}/portal/billing`); await settle(p); await sleep(2000)
await shot(p, R, '49-portal-mobile-billing', { fullPage: true })
const reds2 = await p.locator('main *').evaluateAll(els => els.filter(e => e.children.length === 0 && /0(\.00)?$/.test(e.textContent.trim()) && /red|rose/.test(String(e.className))).map(e => `${e.textContent.trim()}:${e.className}`))
log('R13.49 zero-red billing', reds2)
log('R13.49 scrollX', await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
log('5xx', m.serverErrors)
await m.browser.close()
