// R13c R13.30 / R13.33 — ตั้ง/คืนสาขา CO1 ผ่านหน้าจอ (admin) · probe finance แก้บริษัทไม่ได้
// ใช้: node uat/bin/r13/c30.mjs set | reset
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, get } from './_h.mjs'
const mode = process.argv[2] ?? 'set'
const CO1 = 'e27e79bf-2344-4f52-8979-c58be09a9de6'
log('=== c30', mode, new Date().toISOString())
const a = await openAs('admin'); const p = a.page
const res = []; p.on('response', async r => { if (r.url().includes('/api/') && r.request().method() !== 'GET') res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${(await r.text().catch(() => '')).slice(0, 400)}`) })
await p.goto(`${BASE}/settings/companies`); await settle(p); await sleep(1000)
const card = p.locator('div').filter({ hasText: 'บริษัท ยูเอที ลิสซิ่ง จำกัด' }).filter({ has: p.getByRole('button', { name: '⚙️ แก้ไขบริษัท' }) }).last()
await card.getByRole('button', { name: '⚙️ แก้ไขบริษัท' }).click(); await sleep(800)
const d = p.locator('[role="dialog"]').last()
if (mode === 'set') {
  await d.locator('#co-branch-kind').selectOption('branch'); await sleep(300)
  await d.locator('#co-branch-no').fill('00001')
  await d.locator('#co-reason').fill('UAT R13c ทดสอบใบกำกับสาขาผู้ซื้อ (ชั่วคราว)')
} else {
  await d.locator('#co-branch-kind').selectOption('head_office'); await sleep(300)
  await d.locator('#co-reason').fill('UAT R13c คืนค่าเป็นสำนักงานใหญ่')
}
await shot(p, R, `c${mode === 'set' ? '30' : '33'}-company-branch-form`)
await d.getByRole('button', { name: 'บันทึกการแก้ไข' }).click(); await sleep(2500)
log('toast', await toasts(p, 500)); log('res', res)
await settle(p); await sleep(600)
await shot(p, R, `c${mode === 'set' ? '30' : '33'}-company-branch-after`)
await a.browser.close()
log(q(`select name, branch_code from finance_companies order by name`))
log(q(`select action, reason, before_data->>'branchCode' b, after_data->>'branchCode' a, before_data->>'branch_code' b2, after_data->>'branch_code' a2 from audit_logs where target_id='${CO1}' order by created_at desc limit 1`))
if (mode === 'set') {
  const f = await openAs('uat.finance'); const fp = f.page
  await fp.goto(`${BASE}/settings/companies`); await settle(fp); await sleep(800)
  log('finance url', fp.url(), 'edit btn count', await fp.getByRole('button', { name: '⚙️ แก้ไขบริษัท' }).count())
  const r = await fp.request.patch(`${BASE}/api/finance-companies/${CO1}`, { data: { branchCode: '00002', reason: 'probe' }, failOnStatusCode: false })
  log('finance PATCH', r.status(), (await r.text()).slice(0, 300))
  await f.browser.close()
  log(q(`select name, branch_code from finance_companies order by name`))
}
