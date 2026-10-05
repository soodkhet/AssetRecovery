// R13c R13.34 เลขรอบวางบิลภายใน + portal (co1.mgr + ธุรการ view-as CO2 — co2.admin ไม่มีแท็บการเงินตาม R12.04)
import { openAs, shot, BASE, settle, sleep, log, R, mainText } from './_h.mjs'
const CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
log('=== c34', new Date().toISOString())
const f = await openAs('uat.finance'); const fp = f.page
await fp.goto(`${BASE}/finance?tab=revenue`); await settle(fp); await sleep(1200)
log('internal rows', (await fp.locator('tbody').first().innerText()).replace(/\s+/g, ' ').slice(0, 900))
await shot(fp, R, 'c34-internal-batches')
await f.browser.close()
const c = await openAs('uat.co1.mgr'); const cp = c.page
for (const sub of ['billing', 'tax-invoices']) {
  await cp.goto(`${BASE}/portal/${sub}`); await settle(cp); await sleep(1500)
  log(`co1.mgr /portal/${sub}`, cp.url(), await mainText(cp, 900))
  await shot(cp, R, `c34-co1mgr-portal-${sub}`)
}
await c.browser.close()
const u = await openAs('uat.admin'); const up = u.page
for (const sub of ['billing', 'tax-invoices']) {
  await up.goto(`${BASE}/portal/view-as/${CO2}/${sub}`); await settle(up); await sleep(1500)
  log(`view-as CO2 ${sub}`, up.url(), await mainText(up, 900))
  await shot(up, R, `c34-viewas-co2-${sub}`)
}
const co2a = await openAs('uat.co2.admin')
await co2a.page.goto(`${BASE}/portal/billing`); await settle(co2a.page); await sleep(1000)
log('co2.admin /portal/billing url', co2a.page.url())
await co2a.browser.close()
await u.browser.close()
