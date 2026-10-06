import { openAs, log, post } from './_h.mjs'
const { browser, page } = await openAs('uat.finance')
log('API create inhouse (OFF):', await post(page, '/api/payout-batches', { side: 'inhouse', cutoffDate: process.env.CUT ?? '2026-11-30', name: 'UAT R15b probe OFF' }, 900))
await browser.close()
