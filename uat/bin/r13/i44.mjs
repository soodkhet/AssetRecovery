// R13.43 แท็บ WHT (บัญชี) · R13.44–46 รายงาน F2/F4/F3/E2/F1 (บริหาร) — ช่วง 01–31/10/2569
import { openAs, shot, BASE, settle, sleep, log, R, mainText, get } from './_h.mjs'
log('=== i44', new Date().toISOString())
const click = async (p, name) => { const b = p.getByRole('button', { name, exact: true }); if (await b.count()) { await b.first().click(); await sleep(1500); return true } return false }
const a = await openAs('uat.account'); let p = a.page
await p.goto(`${BASE}/accounting?tab=wht`); await settle(p); await sleep(1500)
log('R13.43 wht:', await mainText(p, 2500))
await shot(p, R, '43-wht-tab', { fullPage: true })
await a.browser.close()
const e = await openAs('uat.exec'); p = e.page
const RANGE = 'preset=custom&from=2026-10-01&to=2026-10-31'
for (const [slug, g, label] of [['revenue-summary', 'company', 'รายบริษัทไฟแนนซ์'], ['compensation', 'employee', 'รายพนักงาน'], ['ar-aging', null, null], ['company-scorecard', null, null], ['finance', null, null]]) {
  const api = await get(p, `/api/reports/${slug}?${RANGE}${g ? `&groupBy=${g}` : ''}&refresh=true`)
  log(`API ${slug}:`, api.slice(0, 3000))
  await p.goto(`${BASE}/reports/${slug}?${RANGE}`); await settle(p); await sleep(3000)
  if (label) await click(p, label)
  await click(p, 'รีเฟรชตอนนี้'); await sleep(1500)
  log(`UI ${slug}:`, await mainText(p, 2200))
  await shot(p, R, `44-${slug}`, { fullPage: true })
}
log('5xx', e.serverErrors, e.consoleErrors.filter(x => !/same key/.test(x)).slice(0, 3))
await e.browser.close()
