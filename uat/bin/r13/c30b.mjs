// R13c R13.30 ต่อ — audit + probe finance (แยกเพราะรอบแรกสคริปต์หยุดที่ query audit)
import { openAs, BASE, settle, sleep, log, q } from './_h.mjs'
const CO1 = 'e27e79bf-2344-4f52-8979-c58be09a9de6'
log('=== c30b', new Date().toISOString())
log(q(`select action, actor_role, reason, before_data->>'branchCode' b, after_data->>'branchCode' a, before_data->>'branch_code' b2, after_data->>'branch_code' a2 from audit_logs where target_id='${CO1}' order by created_at desc limit 1`))
const f = await openAs('uat.finance'); const fp = f.page
await fp.goto(`${BASE}/settings/companies`); await settle(fp); await sleep(800)
log('finance url', fp.url(), 'edit btn count', await fp.getByRole('button', { name: '⚙️ แก้ไขบริษัท' }).count())
const r = await fp.request.patch(`${BASE}/api/finance-companies/${CO1}`, { data: { branchCode: '00002', reason: 'probe' }, failOnStatusCode: false })
log('finance PATCH', r.status(), (await r.text()).slice(0, 300))
await f.browser.close()
log(q(`select name, branch_code from finance_companies order by name`))
