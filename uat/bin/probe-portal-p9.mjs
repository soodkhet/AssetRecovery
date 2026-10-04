import { chromium, devices } from '@playwright/test'
import { shot, BASE } from './lib.mjs'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
const R='PORTAL-P9', out={}
async function open(u, mobile){
  const browser = await chromium.launch({ channel:'chrome', headless:true })
  const base = mobile ? devices['iPhone 14'] : { viewport:{width:1440,height:900} }
  const context = await browser.newContext({ ...base, locale:'th-TH', timezoneId:'Asia/Bangkok', storageState:`uat/.auth/${u}.json`, acceptDownloads:true })
  const page = await context.newPage()
  const errs=[], net=[]
  page.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) })
  page.on('pageerror', e=>errs.push('pageerror: '+e.message))
  page.on('response', r=>{ if(r.url().includes('/api/') && r.status()>=400) net.push(`${r.status()} ${r.request().method()} ${r.url()}`) })
  await page.goto(`${BASE}/portal`); await page.waitForLoadState('networkidle')
  if (page.url().includes('/login')) throw new Error('SESSION EXPIRED '+u)
  return {browser,context,page,errs,net}
}
const txt = async p => (await p.locator('main').innerText().catch(()=>p.locator('body').innerText())).slice(0,1500)
const nav = async p => (await p.locator('nav, header').allInnerTexts()).join(' | ').replace(/\s+/g,' ').slice(0,600)

// 1 mgr desktop
{ const s = await open('uat.co1.mgr', false); const p=s.page
  out.mgrNav = await nav(p)
  await p.goto(`${BASE}/portal/billing`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800)
  out.billUrl=p.url(); out.billText = await txt(p); await shot(p,R,'01-billing-desktop',{fullPage:true})
  const api = await p.request.get(`${BASE}/api/portal/billing`).catch(()=>null)
  out.billApi = api ? `${api.status()} `+(await api.text()).slice(0,800) : 'n/a'
  await p.goto(`${BASE}/portal/tax-invoices`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800)
  out.taxUrl=p.url(); out.taxText = await txt(p); await shot(p,R,'02-tax-desktop',{fullPage:true})
  const tapi = await p.request.get(`${BASE}/api/portal/tax-invoices`)
  out.taxApi = `${tapi.status()} `+(await tapi.text()).slice(0,1200)
  try {
    const btn = p.getByRole('button',{name:/ดาวน์โหลด PDF/}).or(p.getByRole('link',{name:/ดาวน์โหลด PDF/})).first()
    const [dl] = await Promise.all([p.waitForEvent('download',{timeout:20000}), btn.click()])
    mkdirSync('uat/fixtures/downloads-PORTAL-P9',{recursive:true})
    const f=`uat/fixtures/downloads-PORTAL-P9/${dl.suggestedFilename()}`; await dl.saveAs(f)
    const b=readFileSync(f); out.pdf = `${f} size=${b.length} head=${b.subarray(0,5).toString()}`
  } catch(e){ out.pdf='ERR '+e.message.slice(0,300) }
  await p.goto(`${BASE}/portal`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1200)
  await shot(p,R,'03-overview-desktop',{fullPage:true})
  out.mgrErrs=s.errs; out.mgrNet=s.net; await s.browser.close() }
// 1 mgr mobile
{ const s = await open('uat.co1.mgr', true); const p=s.page
  await p.waitForTimeout(1200)
  out.ticks = await p.locator('.recharts-cartesian-axis-tick-value, .recharts-xAxis text').allInnerTexts().catch(()=>[])
  // overlap check of x-axis ticks
  out.overlap = await p.evaluate(()=>{ const t=[...document.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')].map(e=>e.getBoundingClientRect()); let o=0; for(let i=1;i<t.length;i++) if(t[i].left < t[i-1].right-1) o++; return {n:t.length,overlaps:o} })
  out.hscroll = await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)
  await shot(p,R,'04-overview-mobile',{fullPage:true})
  await p.goto(`${BASE}/portal/billing`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800)
  out.billMobHscroll = await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)
  out.billMobText = (await txt(p)).slice(0,600); await shot(p,R,'05-billing-mobile',{fullPage:true})
  await p.goto(`${BASE}/portal/tax-invoices`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800)
  out.taxMobHscroll = await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)
  await shot(p,R,'06-tax-mobile',{fullPage:true})
  out.mobErrs=s.errs; out.mobNet=s.net; await s.browser.close() }
// 2 sup
{ const s = await open('uat.co1.sup', false); const p=s.page
  out.supNav = await nav(p); await shot(p,R,'07-sup-overview')
  for (const path of ['/portal/billing','/portal/tax-invoices']) { await p.goto(`${BASE}${path}`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1000); out['sup'+path]=p.url() }
  await shot(p,R,'08-sup-after-redirect')
  const a = await p.request.get(`${BASE}/api/portal/tax-invoices`); out.supTaxApi=a.status()
  out.supErrs=s.errs; out.supNet=s.net; await s.browser.close() }
// 3 co2
{ const s = await open('uat.co2.admin', false); const p=s.page
  out.co2Nav = await nav(p); await shot(p,R,'09-co2-overview')
  for (const path of ['/portal/billing','/portal/tax-invoices']) { await p.goto(`${BASE}${path}`); await p.waitForLoadState('networkidle'); await p.waitForTimeout(1000); out['co2'+path]=p.url() }
  out.co2Errs=s.errs; out.co2Net=s.net; await s.browser.close() }
writeFileSync('/private/tmp/claude-501/-Users-beer-AssetRecovery/994f4e02-c9c5-4494-855d-cedda7c30d43/scratchpad/p9.json', JSON.stringify(out,null,1))
console.log(JSON.stringify(out,null,1))
