// R15c.09b ผู้จัดการทีม in ตีกลับใบเบิกค่าที่พัก ฿500 ของ in1 ที่ค้าง (ใบรับรองยังไม่เซ็น/ถูกยกเลิก)
import { openAs, shot, BASE, settle, sleep, toasts, trackMutations, log, R, q } from './_h.mjs'
const T = new Date().toISOString()
const flat = s => s.replace(/\s+/g, ' ')
const { browser, page, serverErrors } = await openAs('uat.mgr.in')
const fm = trackMutations(page)
await page.goto(`${BASE}/finance?tab=approval`); await settle(page); await sleep(1500)
for (let i = 0; i < 9; i++) {
  const row = page.locator('tbody tr').filter({ hasText: 'อนันต์' }).filter({ hasText: 'ใบรับรองแทนใบเสร็จ' }).filter({ has: page.getByRole('button', { name: 'ตีกลับ' }) }).first()
  if (!(await row.count())) break
  const txt = flat(await row.innerText()).slice(0, 200)
  await row.getByRole('button', { name: 'ตีกลับ' }).click(); await sleep(700)
  const d = page.getByRole('dialog').last()
  await d.locator('textarea').fill('ข้อมูลทดสอบ UAT R15b/R15c — ไม่ต้องจ่ายจริง ปิดรายการค้าง')
  if (i === 0) await shot(page, R, 'c-09-reject-modal', { fullPage: true })
  fm.res.length = 0
  await d.getByRole('button', { name: 'ตีกลับรายการ' }).click(); await sleep(2000)
  log('reject', i, txt.match(/CRT-2569-\d+/)?.[0], fm.res, (await toasts(page, 300)).slice(-1))
}
await shot(page, R, 'c-09-approval-after', { fullPage: true })
log('5xx', serverErrors)
await browser.close()
log(q(`select e.status,e.expense_date,e.rejection_reason,(select string_agg(receipt_number||':'||status,',') from substitute_receipts s where s.expense_id=e.id) crt from expenses e where e.updated_at>'${T}' order by expense_date`))
log(q(`select action,target_type,count(*),max(reason) from audit_logs where created_at>'${T}' and action<>'login' group by 1,2`))
