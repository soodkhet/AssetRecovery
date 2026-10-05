// R13c R13.44 F2 สรุปรายได้ตามบริษัท (บริหาร) — หลังออก INV-0003/0004 · บรรทัดกระทบยอด
import { openAs, shot, BASE, settle, sleep, log, R, mainText, get } from './_h.mjs'
log('=== c44', new Date().toISOString())
const click = async (p, name) => { const b = p.getByRole('button', { name, exact: true }); if (await b.count()) { await b.first().click(); await sleep(1500); return true } return false }
const e = await openAs('uat.exec'); const p = e.page
const RANGE = 'preset=custom&from=2026-10-01&to=2026-10-31'
const api = await get(p, `/api/reports/revenue-summary?${RANGE}&groupBy=company&refresh=true`)
log('API revenue-summary:', api.slice(0, 3500))
await p.goto(`${BASE}/reports/revenue-summary?${RANGE}`); await settle(p); await sleep(3000)
await click(p, 'รายบริษัทไฟแนนซ์'); await click(p, 'รีเฟรชตอนนี้'); await sleep(1500)
log('UI revenue-summary:', await mainText(p, 3000))
log('red zero', await p.locator('main [class*="red"], main [class*="rose"]').allInnerTexts())
await shot(p, R, 'c44-revenue-summary', { fullPage: true })
log('5xx', e.serverErrors, e.consoleErrors.filter(x => !/same key/.test(x)).slice(0, 3))
await e.browser.close()
