// O74 — job advance_overdue (dev trigger จำลองวัน 25/10/2569) : ADV-8 approved ยังไม่จ่าย ต้องไม่กลายเป็น overdue
import { openAs, log, q } from './_h.mjs'
const s = await openAs('admin'); const { page } = s
log('o74', 'before', q(`select advance_number,status,due_clear_date,payout_batch_item_id is not null paid from advances where advance_number in ('ADV-2569-0005','ADV-2569-0008')`))
const r = await page.request.post('http://localhost:3000/api/dev/trigger-job', { data: { jobType: 'advance_overdue', payload: { asOf: process.argv[2] ?? '2026-10-25' } } })
log('o74', 'trigger', r.status(), (await r.text()).slice(0, 400))
await page.waitForTimeout(5000)
log('o74', 'after', q(`select advance_number,status,due_clear_date,payout_batch_item_id is not null paid from advances where advance_number in ('ADV-2569-0005','ADV-2569-0008')`))
log('o74', 'job', q(`select job_type,status,result::text from job_runs order by created_at desc limit 1`).slice(0, 400))
await s.browser.close()
