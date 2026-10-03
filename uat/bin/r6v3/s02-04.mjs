// R6.02 scope · R6.03 ข้ามขั้น · R6.04 race ขั้น 1 C1 fuel
import { openAs, shot, BASE, settle, sleep, log, R, X, q, SQL, api, guard2xx, uiApprove, waitToast, row, TL } from './_h.mjs'
log('=== s02-04', new Date().toISOString())
const P = id => `/api/compensation/${id}/approve`
const before = q(`select id,to_char(updated_at,'HH24:MI:SS.MS') from expenses where id in ('${X.C1f}','${X.C5c}','${X.hotel}','${X.C5f}') order by 1`)
const mOut = await openAs('uat.mgr.out'), mIn = await openAs('uat.mgr.in'), fin = await openAs('uat.finance'), ex = await openAs('uat.exec')
const probes = [
  ['R6.02-1 mgr.out→C1 fuel', mOut, X.C1f, { step: 1 }], ['R6.02-2 mgr.in→C5 commission', mIn, X.C5c, { step: 1 }], ['R6.02-3 mgr.out→hotel', mOut, X.hotel, { step: 1 }],
  ['R6.03-1 finance→C1 fuel step1', fin, X.C1f, { step: 1 }], ['R6.03-2 exec→C5 fuel step1', ex, X.C5f, { step: 1 }], ['R6.03-3 mgr.in→C1 fuel step2', mIn, X.C1f, { step: 2 }],
]
for (const [l, s, id, body] of probes) { const r = await api(s.page, 'PATCH', P(id), body); log(l, r); guard2xx(l, r) }
const after = q(`select id,to_char(updated_at,'HH24:MI:SS.MS') from expenses where id in ('${X.C1f}','${X.C5c}','${X.hotel}','${X.C5f}') order by 1`)
log('R6.02/03 updated_at unchanged =', before === after, '| audit since T0:', q(`select count(*) from audit_logs where created_at > '2026-10-03 18:57:52+00' and action not in ('login','logout')`))
for (const s of [mOut, fin, ex]) await s.browser.close()
// R6.04 race: 2 browser แยกของ mgr.in
const mIn2 = await openAs('uat.mgr.in')
// แท็บค้างใน mIn2 ก่อนยิง race
await mIn2.page.goto(`${BASE}/finance?tab=comp`); await settle(mIn2.page); await sleep(500)
const rs = await Promise.all([api(mIn.page, 'PATCH', P(X.C1f), { step: 1 }), api(mIn2.page, 'PATCH', P(X.C1f), { step: 1 })])
log('R6.04 race:', rs)
// ดับเบิลคลิกบนแท็บที่ค้าง
const r = row(mIn2.page, 'UAT-CO1-001', TL.f)
const resps = []; mIn2.page.on('response', x => { if (x.url().includes('/approve')) resps.push(x.status()) })
await r.getByRole('button', { name: 'อนุมัติขั้น 1' }).dblclick()
log('R6.04 stale-tab dblclick toast:', await waitToast(mIn2.page, 8000))
await sleep(1500); log('R6.04 stale-tab responses:', resps)
await shot(mIn2.page, R, 'R6.04-stale-tab-error')
log('R6.04 C1 fuel:', q(`select status,approval_step_current cur,approval_step_total tot,(select condition from approval_matrices m where m.id=approval_matrix_id) mx,manager_approved_by is not null m,jsonb_array_length(approval_history) h from expenses where id='${X.C1f}'`))
log('R6.04 audit:', q(`select action,actor_role,after_data->>'step_role' sr,after_data->>'approval_step_total' tot,after_data->'revenue_ids_created' rev from audit_logs where target_id='${X.C1f}' and created_at > '2026-10-03 18:57:52+00'`))
log('R6.04 noti since T0:', q(`select count(*) from notifications where created_at > '2026-10-03 18:57:52+00'`))
await mIn.browser.close(); await mIn2.browser.close()
