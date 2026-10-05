// R13c R13.36 probe — บริหารเปิดแท็บกระทบยอด (U52) ดูว่าเห็นอะไร
import { openAs, shot, BASE, settle, sleep, log, R, mainText } from './_h.mjs'
log('=== c36b', new Date().toISOString())
const e = await openAs('uat.exec'); const ep = e.page
await ep.goto(`${BASE}/accounting?tab=bank`); await settle(ep); await sleep(1500)
log('exec url', ep.url()); log('exec main', await mainText(ep, 2500))
log('exec tabs', await ep.getByRole('tab').allInnerTexts().catch(() => []))
await shot(ep, R, 'c36-exec-bank-probe')
await e.browser.close()
