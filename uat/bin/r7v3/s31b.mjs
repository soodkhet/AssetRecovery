import { openAs, log, api } from '/Users/beer/AssetRecovery/uat/bin/r7v3/_h.mjs'
const s = await openAs('uat.account')
log('periods api', (await api(s.page, 'GET', '/api/accounting/periods')).slice(0, 900))
await s.browser.close()
