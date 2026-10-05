// R13c R13.53 ส่ง + ล็อกงวด ต.ค. 2569 ด้วย dev asOf 2026-11-01 (มติ U85) · probe in1 ส่งค่าที่พักวันที่ ต.ค. หลังล็อก
import { openAs, shot, BASE, settle, sleep, toasts, log, R, q, mainText, post, trackMutations, F } from './_h.mjs'
const PID = '879302b0-bb29-4bae-9f9a-1e16aba8bb31'
log('=== c53', new Date().toISOString())
const a = await openAs('uat.account'); const p = a.page
log('send', await post(p, `/api/dev/accounting-periods/${PID}/send`, { reason: 'UAT R13 ปิดงวดจำลอง', asOf: '2026-11-01' }))
log(q(`select period_label,status from accounting_periods`))
log('lock', await post(p, `/api/dev/accounting-periods/${PID}/lock`, { reason: 'UAT R13 ล็อกงวดจำลอง', asOf: '2026-11-01' }))
log(q(`select period_label,status from accounting_periods`))
log(q(`select action, actor_role, reason from audit_logs where target_id='${PID}' order by created_at desc limit 3`))
await p.goto(`${BASE}/accounting?tab=closing`); await settle(p); await sleep(1500)
log('closing', await mainText(p, 900)); await shot(p, R, 'c53-closing-locked', { fullPage: true })
await a.browser.close()
// probe in1 ค่าที่พักวันที่ 06/10/2569 (งวดล็อกแล้ว)
const T = new Date().toISOString()
const s = await openAs('uat.agent.in1', { mobile: true }); const page = s.page
const m = trackMutations(page)
await page.goto(`${BASE}/field/expenses`); await settle(page); await sleep(1200)
await page.getByRole('button', { name: 'เบิกแยก', exact: true }).click(); await sleep(1000)
await page.getByRole('button', { name: /เบิกที่พัก/ }).click(); await sleep(1000)
const dlg = page.getByRole('dialog').filter({ hasText: 'เบิกค่าที่พัก' }).last(); await dlg.waitFor()
await dlg.locator('input[type=date]').fill('2026-10-06')
const [ch] = await Promise.all([page.waitForEvent('filechooser'), dlg.getByText(/แตะเพื่อแนบใบเสร็จ/).click()])
await ch.setFiles(F('R4-C1-photo.jpg')); await sleep(1500)
await dlg.locator('textarea').fill('UAT R13c probe หลังล็อกงวด')
await dlg.locator('input[inputmode=decimal]').fill('100')
m.res.length = 0
await dlg.getByRole('button', { name: 'ส่งคำขอเบิก' }).click(); await sleep(2500)
log('probe locked toasts', await toasts(page, 1500)); log('res', m.res.splice(0))
await shot(page, R, 'c53-in1-hotel-locked-probe')
log(q(`select id, status, gross_satang, expense_date, receipt_file_url from expenses where created_at>'${T}'`))
log('5xx', s.serverErrors)
await s.browser.close()
