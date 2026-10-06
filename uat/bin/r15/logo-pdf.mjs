import { openAs, BASE } from '../lib.mjs'
import { writeFileSync } from 'node:fs'
const { browser, page } = await openAs('uat.finance')
const r = await page.request.get(BASE + '/api/payout-batches/4b234a2e-5c73-4504-8cbe-fc5611166a77/summary-pdf')
const buf = await r.body(); writeFileSync('uat/fixtures/downloads-R15/logo-check-summary.pdf', buf)
console.log(r.status(), buf.length, 'images:', (buf.toString('latin1').match(/\/Subtype\s*\/Image/g) || []).length)
await browser.close()
