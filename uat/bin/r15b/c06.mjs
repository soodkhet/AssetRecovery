// R15b.06 การเงินบันทึก Manual Claim แทน in2 (ฐาน (2)) + out1 (ฐาน (3)) วันที่ พ.ย. แล้วอนุมัติครบขั้น
import { openAs, BASE, log, q, post, patch, P_IN2, P_OUT1 } from './_h.mjs'
const s = {}
const as = async u => (s[u] ??= await openAs(u))
const f = await as('uat.finance')
const mk = (payeeId, amt, d, note) => post(f.page, '/api/claims', { claimType: 'manual', grossSatang: amt, expenseDate: d, payeeId, receiptFileUrl: null, note }, 400)
const r1 = await mk(P_IN2, 1000000, '2026-11-10', 'UAT R15b ค่าตอบแทนพิเศษ (ทดสอบเงื่อนไข (2) ออกให้ตลอดไป)'); log('claim in2', r1)
const r2 = await mk(P_OUT1, 1234567, '2026-11-10', 'UAT R15b ค่าตอบแทนพิเศษ (ทดสอบเงื่อนไข (3) ออกให้ครั้งเดียว)'); log('claim out1', r2)
const id1 = JSON.parse(r1.slice(4)).data?.id, id2 = JSON.parse(r2.slice(4)).data?.id
log('ids', id1, id2)
const ap = async (u, id) => log(u, 'approve', id, await patch((await as(u)).page, `/api/claims/${id}/approve`, {}, 300))
await ap('uat.mgr.in', id1); await ap('uat.mgr.out', id2)
await ap('uat.finance', id1); await ap('uat.finance', id2)
await ap('uat.exec', id1); await ap('uat.exec', id2)
log(q(`select id,payee_id,expense_type,gross_satang,expense_date,status from expenses where id in ('${id1}','${id2}')`))
for (const v of Object.values(s)) await v.browser.close()
