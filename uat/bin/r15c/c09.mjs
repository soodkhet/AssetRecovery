// R15c.09 เคลียร์ใบเบิกค่าที่พักค้างของ in1: probe ด่านอนุมัติ (ใบรับรองยังไม่เซ็น/ถูกยกเลิก) → อนุมัติใบ ฿1,500 (มีใบเสร็จจริง) → ตีกลับ 7 ใบที่เหลือ
import { openAs, shot, BASE, settle, sleep, toasts, trackMutations, log, R, q, patch } from './_h.mjs'
const T = new Date().toISOString()
const flat = s => s.replace(/\s+/g, ' ')
log('== c09', T)
const REAL = '0b3477d2-c1f6-4552-a194-05d68e019a7e'
const m = await openAs('uat.mgr.in')
log('probe approve unsigned CRT-0001 claim:', await patch(m.page, '/api/claims/985ac554-af45-4ac1-8724-1eab898a7657/approve', {}, 400))
log('probe approve cancelled-only CRT-0005 claim:', await patch(m.page, '/api/claims/144457bd-eb74-41f3-a069-2153e6100108/approve', {}, 400))
const mm = trackMutations(m.page)
await m.page.goto(`${BASE}/finance?tab=approval`); await settle(m.page); await sleep(1500)
log('mgr page', m.page.url(), flat(await m.page.locator('main').innerText()).slice(0, 300))
const rowOf = (p, s) => p.locator('tbody tr').filter({ hasText: s })
let r = rowOf(m.page, '฿1,500.00').filter({ hasText: 'อนันต์' }).first()
log('mgr row', flat(await r.innerText()).slice(0, 300))
await r.getByRole('button', { name: /อนุมัติขั้น 1/ }).click(); await sleep(2500)
log('mgr approve', mm.res, await toasts(m.page, 800))
await m.browser.close()
const f = await openAs('uat.finance'); const page = f.page
const fm = trackMutations(page)
await page.goto(`${BASE}/finance?tab=approval`); await settle(page); await sleep(1500)
r = rowOf(page, '฿1,500.00').filter({ hasText: 'อนันต์' }).first()
log('fin row', flat(await r.innerText()).slice(0, 300))
await r.getByRole('button', { name: /อนุมัติขั้น 2/ }).click(); await sleep(2500)
log('fin approve', fm.res, await toasts(page, 800))
await page.reload(); await settle(page); await sleep(1500)
for (let i = 0; i < 8; i++) {
  const row = page.locator('tbody tr').filter({ hasText: 'อนันต์' }).filter({ hasText: '฿500.00' }).filter({ has: page.getByRole('button', { name: 'ตีกลับ' }) }).first()
  if (!(await row.count())) break
  const txt = flat(await row.innerText()).slice(0, 160)
  await row.getByRole('button', { name: 'ตีกลับ' }).click(); await sleep(700)
  const d = page.getByRole('dialog').last()
  await d.locator('textarea').fill('ข้อมูลทดสอบ UAT R15b/R15c — ไม่ต้องจ่ายจริง ปิดรายการค้าง')
  if (i === 0) await shot(page, R, 'c-09-reject-modal', { fullPage: true })
  fm.res.length = 0
  await d.getByRole('button', { name: 'ตีกลับรายการ' }).click(); await sleep(2000)
  log('reject', i, txt, fm.res)
}
await shot(page, R, 'c-09-approval-after', { fullPage: true })
log('5xx', f.serverErrors)
await f.browser.close()
log(q(`select id,status,expense_date,gross_satang,rejection_reason from expenses where payee_id='9df4509f-c201-4dcf-8939-e02e08df748f' and expense_type='hotel' and updated_at>'${T}' order by expense_date`))
log(q(`select status,count(*) from expenses group by 1`))
