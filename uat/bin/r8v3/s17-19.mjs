// R8.17 (ทาง ก BUG-093) · R8.18 targets 4 ชนิด · R8.19 validation
import { openAs, R, ID, log, q, q1, BASE, api, guard2xx, fp, auditSince } from './_h.mjs'
log('=== R8.17-19', new Date().toISOString())
const T = q1('select now()'); const FPa = fp(); log('T', T, 'FP', FPa)
let r
// R8.17
const ad = await openAs('admin')
const jobsBefore = q1('select count(*) from jobs')
r = await api(ad.page, 'POST', '/api/dev/trigger-job', { jobType: 'daily_field_allowance', payload: { date: '2026-10-04' } }); log('17 trigger daily_field_allowance', r)
log('17 jobs before/after', jobsBefore, q1('select count(*) from jobs'))
log('17 last job', q(`select job_type, status, left(result::text,300) result, left(error_message,120) err from jobs order by created_at desc limit 1`))
log('17 FP', fp() === FPa ? 'FP same' : 'FP DIFF ' + fp())
await ad.browser.close()
// R8.18
const f = await openAs('uat.finance'); const a = await openAs('uat.account'); const e = await openAs('uat.exec')
for (const t of ['revenue', 'expense', 'billing_batch', 'payout_batch']) {
  const res = await f.page.request.get(`${BASE}/api/adjustments/targets?targetType=${t}`)
  const j = await res.json(); const items = j.data?.items ?? j.data ?? []
  const arr = Array.isArray(items) ? items : []
  const uniq = k => [...new Set(arr.map(x => JSON.stringify(x[k])))].join(' ')
  log(`18 ${t}`, res.status(), 'n=', arr.length, '| period:', uniq('periodStatusAtTarget'), '| roles:', uniq('requiredApproverRoles'), '| label:', uniq('approvalPolicyLabel'), '| blocked:', uniq('directEditBlocked'))
  if (arr[0]) log(`18 ${t} first`, JSON.stringify(arr[0]).slice(0, 500))
  if (!Array.isArray(items)) log(`18 ${t} raw`, JSON.stringify(j).slice(0, 500))
}
for (const [t, qq] of [['revenue', 'UAT-CO1-001'], ['billing_batch', 'ตุลาคม 2569'], ['payout_batch', 'OUT-2']]) {
  const res = await f.page.request.get(`${BASE}/api/adjustments/targets?targetType=${t}&q=${encodeURIComponent(qq)}`)
  const j = await res.json(); const items = j.data?.items ?? j.data ?? []
  log(`18 search ${t} "${qq}"`, res.status(), Array.isArray(items) ? items.length + ' ' + items.map(x => x.reference ?? x.label ?? x.ref ?? x.id).join(', ') : JSON.stringify(j).slice(0, 300))
}
r = await api(a.page, 'GET', '/api/adjustments/targets?targetType=revenue'); log('18 account targets', r)
log('18 constraint', q(`select conname, pg_get_constraintdef(oid) from pg_constraint where conname='adjustments_one_target'`))
// R8.19
const base = { targetType: 'revenue', targetId: ID.C1REV, adjustmentType: 'decrease', amountSatang: 10000, reason: 'probe validation R8 ห้ามสร้าง' }
for (const [lab, patch] of [['reason ว่าง', { reason: '' }], ['reason ลด', { reason: 'ลด' }], ['amount 0', { amountSatang: 0 }], ['amount -10000', { amountSatang: -10000 }], ['amount 100.5', { amountSatang: 100.5 }], ['targetId สุ่ม', { targetId: '00000000-0000-4000-8000-0000000000aa' }], ['targetType ผิด', { targetType: 'tax_invoice' }]]) {
  r = await api(f.page, 'POST', '/api/adjustments', { ...base, ...patch }); log(`19 finance ${lab}`, r); guard2xx(lab, r)
}
r = await api(a.page, 'POST', '/api/adjustments', base); log('19 account POST', r); guard2xx('acc', r)
r = await api(e.page, 'POST', '/api/adjustments', base); log('19 exec POST', r); guard2xx('exec', r)
log('19 adjustments', q1('select count(*) from adjustments'))
log('19 audit since T', q(auditSince(T)))
log('errs', f.serverErrors, a.serverErrors, e.serverErrors)
await Promise.all([f, a, e].map(s => s.browser.close()))
