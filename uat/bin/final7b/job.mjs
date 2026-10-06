// dev trigger job (ไม่มีปุ่มบน UI) · node job.mjs <jobType> '<payload json>'
import { openAs, log } from './_h.mjs'
const [jobType, payload = '{}'] = process.argv.slice(2)
if (jobType === 'device_tac_sync') throw new Error('ห้ามดึง TAC จาก GitHub')
const s = await openAs('admin'); const r = await s.page.request.post('http://localhost:3000/api/dev/trigger-job', { data: { jobType, payload: JSON.parse(payload) } })
log('job', jobType, payload, r.status(), (await r.text()).replace(/"createdById".*/, '').slice(0, 500)); await s.page.waitForTimeout(4000); await s.browser.close()
