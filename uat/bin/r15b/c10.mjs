// R15b.10 การเงินบันทึก Manual Claim แทน in1 (เงื่อนไข (3)) 12,345.67 วันที่ พ.ย. + อนุมัติครบขั้น
import { openAs, log, q, post, patch, P_IN1 } from './_h.mjs'
const s = {}; const as = async u => (s[u] ??= await openAs(u))
const f = await as('uat.finance')
const r = await post(f.page, '/api/claims', { claimType: 'manual', grossSatang: 1234567, expenseDate: '2026-11-10', payeeId: P_IN1, receiptFileUrl: null, note: 'UAT R15b ค่าตอบแทนพิเศษ (ทดสอบเงื่อนไข (3) ออกให้ครั้งเดียว)' }, 300); log('claim in1', r)
const id = JSON.parse(r.slice(4)).data.id
for (const u of ['uat.mgr.in', 'uat.finance', 'uat.exec']) log(u, (await patch((await as(u)).page, `/api/claims/${id}/approve`, {}, 120)))
log(q(`select id,payee_id,gross_satang,expense_date,status from expenses where id='${id}'`))
for (const v of Object.values(s)) await v.browser.close()
