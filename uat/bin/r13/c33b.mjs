// R13c R13.33 — หลังคืนสาขา CO1 ดาวน์โหลด INV-0003 ใหม่ (ต้องยังเป็นสาขาที่ 00001 — snapshot)
import { writeFileSync } from 'node:fs'
import { openAs, BASE, log, q } from './_h.mjs'
log('=== c33b', new Date().toISOString())
const a = await openAs('uat.account')
const r = await a.page.request.get(`${BASE}/api/accounting/tax-invoices/861203b3-e32f-42d8-97f1-e81239047a9b/pdf`, { failOnStatusCode: false })
writeFileSync('uat/fixtures/downloads-R13/c-INV-0003-after-reset.pdf', await r.body()); log('pdf INV-0003 after reset', r.status())
await a.browser.close()
log(q(`select invoice_number, buyer_branch_code from tax_invoices where invoice_number='INV-0003'`))
log(q(`select name, branch_code from finance_companies order by name`))
