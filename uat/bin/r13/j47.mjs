// R13.34 เลขรอบวางบิล (ภายใน+portal CO2) · R13.47 ธุรการ view-as CO1 · R13.48 เทียบ co1.mgr + probe `as` · R13.49 มือถือ
import { openAs, shot, BASE, settle, sleep, log, R, q, mainText, get, post } from './_h.mjs'
import { mkdirSync } from 'node:fs'
log('=== j47', new Date().toISOString())
const T = new Date().toISOString()
const CO1 = 'e27e79bf-2344-4f52-8979-c58be09a9de6', CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
const DL = 'uat/fixtures/downloads-R13'; mkdirSync(DL, { recursive: true })
const writeBtns = async (p) => (await p.locator('main button').allInnerTexts()).map(s => s.trim()).filter(Boolean).join(' / ')
// R13.34 portal CO2
{ const s = await openAs('uat.co2.admin'); const p = s.page
  await p.goto(`${BASE}/portal/billing`); await settle(p); await sleep(1500)
  log('R13.34 co2 portal billing:', await mainText(p, 1200)); await shot(p, R, '34-portal-co2-billing', { fullPage: true })
  await s.browser.close() }
// R13.47 ธุรการ view-as
const a = await openAs('uat.admin'); let p = a.page
await p.goto(`${BASE}/settings/companies`); await settle(p); await sleep(1500)
const link = p.getByRole('link', { name: /เปิด portal ของลูกค้า บริษัท ยูเอที ลิสซิ่ง/ })
log('view-as links', await p.getByRole('link', { name: /เปิด portal ของลูกค้า/ }).count(), 'href', await link.getAttribute('href'))
await shot(p, R, '47-companies-viewas-btn')
const [pop] = await Promise.all([a.context.waitForEvent('page'), link.click()])
await pop.waitForLoadState('networkidle').catch(() => {}); await sleep(2000)
log('R13.47 popup url', pop.url().replace(BASE, ''))
const banner = await pop.locator('body').innerText()
log('R13.47 home:', banner.replace(/\s*\n+\s*/g, ' | ').slice(0, 1500))
await shot(pop, R, '47-viewas-home', { fullPage: true })
const vaHome = banner
for (const sub of ['billing', 'tax-invoices', 'cases', 'handover', 'company']) {
  await pop.goto(`${BASE}/portal/view-as/${CO1}/${sub}`); await pop.waitForLoadState('networkidle').catch(() => {}); await sleep(1500)
  log(`R13.47 ${sub}:`, (await mainText(pop, 900)), '| buttons:', await writeBtns(pop))
  if (sub === 'billing' || sub === 'tax-invoices') await shot(pop, R, `47-viewas-${sub}`, { fullPage: true })
}
// ดาวน์โหลด PDF ใบกำกับ INV-0001
await pop.goto(`${BASE}/portal/view-as/${CO1}/tax-invoices`); await pop.waitForLoadState('networkidle').catch(() => {}); await sleep(1500)
const dlBtn = pop.locator('a,button').filter({ hasText: /PDF|ดาวน์โหลด/ }).first()
log('pdf controls', await pop.locator('a,button').filter({ hasText: /PDF|ดาวน์โหลด/ }).count())
try {
  const [d] = await Promise.all([pop.waitForEvent('download', { timeout: 15000 }), dlBtn.click()])
  const path = `${DL}/viewas-${d.suggestedFilename()}`; await d.saveAs(path); log('R13.47 download', path)
} catch (err) { log('R13.47 download fail', String(err).slice(0, 200)) }
await sleep(1000)
log('R13.47 audit', q(`select action,target_type,actor_role,reason,left(after_data::text,200) after from audit_logs where created_at > '${T}' and action in ('view_as','export','access_denied') order by created_at`))
await a.browser.close()
