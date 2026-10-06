import { openAs, BASE, settle, sleep, log } from './_h.mjs'
const f = await openAs('uat.finance')
await f.page.goto(`${BASE}/finance?tab=approval`); await settle(f.page); await sleep(1500)
log('approval text:', (await f.page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 900))
await f.page.goto(`${BASE}/settings/finance?tab=whtpolicy`); await settle(f.page); await sleep(1200)
const t = (await f.page.locator('main').innerText()).replace(/\s+/g, ' '); log('2026 ctx:', [...t.matchAll(/.{0,120}2026.{0,80}/g)].map(m => m[0]))
await f.browser.close()
