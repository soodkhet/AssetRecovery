import { openAs, BASE, A } from './_a.mjs'
import { writeFileSync } from 'node:fs'
const s = await openAs('superadmin')
try {
  for (const k of ['receipt-tax-invoice', 'billing-invoice', 'handover-note']) {
    const r = await s.page.request.get(`${BASE}/api/accounting/document-samples/${k}/pdf`, { failOnStatusCode: false })
    const b = await r.body(); console.log(k, r.status(), r.headers()['content-type'], b.length)
    if (r.status() === 200) writeFileSync(`${A}/A2-sample-${k}.pdf`, b)
  }
} finally { await s.browser.close() }
