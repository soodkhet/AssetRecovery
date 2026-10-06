// Flow 7 — สั่ง job ค่าน้ำมัน/เบี้ยเลี้ยงรายวัน วันนี้ (dev trigger · ไม่มีปุ่มบน UI) → รายได้ FINAL7-001 ต้องเกิด
import { openAs, log, q } from './_h.mjs'
const s = await openAs('admin'); const { page } = s
const r = await page.request.post('http://localhost:3000/api/dev/trigger-job', { data: { jobType: 'daily_field_allowance', payload: { date: '2026-10-07' } } })
log('f07', 'trigger', r.status(), (await r.text()).slice(0, 300))
await page.waitForTimeout(5000)
log('f07', q(`select x.expense_type,x.gross_satang,x.status from expenses x join payee_profiles p on p.id=x.payee_id join users u on u.id=p.user_id where u.username='uat.agent.in1' and x.expense_date='2026-10-07' order by 1`))
log('f07', 'revenue:', q(`select r.status,r.gross_satang,r.vat_satang,r.total_satang,r.vat_rate_pct_used,r.vat_mode_snapshot,r.revenue_date from revenues r join cases c on c.id=r.case_id where c.case_ref='FINAL7-001'`))
await s.browser.close()
