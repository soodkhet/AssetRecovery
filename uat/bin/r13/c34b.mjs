// R13c R13.34 ต่อ — อ่านแถวตารางรอบวางบิลใน portal (co1.mgr + view-as CO2)
import { openAs, BASE, settle, sleep, log } from './_h.mjs'
const CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
for (const [who, path] of [['uat.co1.mgr', '/portal/billing'], ['uat.admin', `/portal/view-as/${CO2}/billing`]]) {
  const s = await openAs(who); await s.page.goto(`${BASE}${path}`); await settle(s.page); await sleep(1500)
  log('c34b', who, (await s.page.locator('tbody').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600))
  await s.browser.close()
}
