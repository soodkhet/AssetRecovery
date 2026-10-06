import { openAs, log, post } from './_h.mjs'
for (const u of ['uat.finance', 'uat.account']) { const { browser, page } = await openAs(u)
  log(u, 'POST wht-policy:', await post(page, '/api/settings/wht-policy', { effectiveFrom: '2026-10-06', baseExpenseTypes: ['commission'], certificateMode: 'per_payee_batch', incomeTypeMode: 'all_40_8', allowGrossUpConditions: true, reason: 'UAT R15b probe สิทธิ์' }, 200)); await browser.close() }
const { browser, page } = await openAs('uat.exec')
log('exec no reason:', await post(page, '/api/settings/wht-policy', { effectiveFrom: '2026-10-06', baseExpenseTypes: ['commission','no_success_fee','fuel','allowance'], certificateMode: 'per_payee_batch', incomeTypeMode: 'all_40_8', allowGrossUpConditions: true }, 300))
await browser.close()
