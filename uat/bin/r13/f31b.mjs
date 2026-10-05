// R13.31 probe: วันตัดรอบเดือนถัดไป → รายได้ ต.ค. ที่ตกค้างถูกดึงหรือไม่ (คาดว่าไม่ได้ — พิสูจน์ว่ารายได้ค้างถาวร)
import { openAs, log, post, q } from './_h.mjs'
const CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
const f = await openAs('uat.finance'); const p = f.page
for (const d of ['2026-11-01', '2026-11-30']) log('cutoff', d, await post(p, '/api/billing-batches', { companyId: CO2, cutoffDate: d, cycleId: null, reason: 'UAT R13 probe วันตัดรอบเดือนถัดไป' }))
log(q(`select batch_number,period,status from billing_batches order by created_at`))
await f.browser.close()
