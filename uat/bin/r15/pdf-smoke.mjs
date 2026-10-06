import { openAs, BASE } from '../lib.mjs'
const { browser, context, page } = await openAs('uat.finance')
const urls = ['/api/substitute-receipts/b10beffe-b151-4828-ac31-b0e4888106be/pdf', '/api/payout-batches/4b234a2e-5c73-4504-8cbe-fc5611166a77/summary-pdf', '/api/notifications', '/dashboard']
for (const u of urls) { const r = await page.request.get(BASE + u); console.log(u.replace(/[0-9a-f-]{36}/,'<id>'), r.status(), r.headers()['content-type']) }
await browser.close()
