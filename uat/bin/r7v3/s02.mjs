import { readFileSync } from 'node:fs'
import { openAs, shot, R, ID, CSV, api, guard2xx, log, q, settle, mainText, BASE, T0 } from './_h.mjs'
log('=== R7.02', new Date().toISOString())
const s = await openAs('uat.finance')
await s.page.goto(`${BASE}/accounting?tab=bank`); await settle(s.page)
log('url', s.page.url()); log('main', await mainText(s.page, 800))
log('import btn', await s.page.getByRole('button', { name: /Import Statement/ }).count())
await shot(s.page, R, '02-finance-bank-tab')
log('GET tx', await api(s.page, 'GET', '/api/bank-reconciliation/transactions'))
const r = await api(s.page, 'POST', '/api/bank-reconciliation/import', { bankAccountId: ID.BANK, csv: readFileSync(CSV, 'utf8'), fileName: 'bank-R7-filled.csv' })
log('POST import', r); guard2xx('finance import', r)
log(q(`select (select count(*) from bank_transactions) bt, (select count(*) from audit_logs where created_at>'${T0}' and action not in ('login','logout')) aud`))
log('errs', s.consoleErrors.slice(0,3), s.serverErrors)
await s.browser.close()
