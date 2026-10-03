// อ่านอย่างเดียว: mgr.in แท็บ ค่าตอบแทน (คิวขั้น 1) หลัง settle — บล็อก non-GET /api
import { openAs, shot, BASE, settle, sleep, mainText, log } from './_h.mjs'
const m = await openAs('uat.mgr.in')
const blocked = []
await m.page.route('**/api/**', r => { if (r.request().method() !== 'GET') { blocked.push(r.request().url()); return r.abort() } return r.continue() })
await m.page.goto(`${BASE}/finance?tab=comp`); await settle(m.page); await sleep(1500)
const tab = m.page.getByRole('tab', { name: /ค่าตอบแทน/ }).or(m.page.getByRole('button', { name: /^ค่าตอบแทน/ })).first()
if (await tab.count()) { await tab.click(); await sleep(1500) }
log('R4.23b mgr.in comp url:', m.page.url())
log('R4.23b mgr.in comp:', await mainText(m.page, 2500))
await shot(m.page, 'R4v3', '23b-mgr-in-comp-queue', { fullPage: true })
log('blocked', blocked, 'console', m.consoleErrors, 'server', m.serverErrors)
await m.browser.close()
