// R6.05 mgr.in ขั้น1 11 ใบ · R6.06 hotel · R6.07 mgr.out C5 commission → fuel (UI)
import { openAs, shot, BASE, settle, sleep, log, R, X, q, SQL, uiApprove, TL } from './_h.mjs'
log('=== s05-07', new Date().toISOString())
const s = await openAs('uat.mgr.in'); const p = s.page
await p.goto(`${BASE}/finance?tab=comp`); await settle(p); await sleep(500)
const list = [['UAT-CO1-001', TL.a], ['UAT-CO1-001', TL.c], ['UAT-CO1-002', TL.f], ['UAT-CO1-002', TL.a], ['UAT-CO1-002', TL.c],
  ['UAT-CO2-003', TL.f], ['UAT-CO2-003', TL.a], ['UAT-CO2-003', TL.n], ['UAT-CO1-004', TL.f], ['UAT-CO1-004', TL.a], ['UAT-CO1-004', TL.c]]
for (const [ref, t] of list) { const [st, ts] = await uiApprove(p, ref, t, 1); log(`R6.05 ${ref} ${t}:`, st.slice(0, 60), ts.at(-1)); await sleep(700) }
await shot(p, R, 'R6.05-mgr-in-after-step1', { fullPage: true })
const [hs, ht] = await uiApprove(p, 'ไม่ผูกเคส', TL.h, 1); log('R6.06 hotel:', hs.slice(0, 60), ht.at(-1)); await sleep(800)
await p.reload(); await settle(p); await sleep(600)
log('R6.06 approve buttons left:', await p.getByRole('button', { name: /อนุมัติขั้น/ }).count(), 'reject buttons:', await p.getByRole('button', { name: 'ตีกลับ' }).count())
log('R6.05 labels:', JSON.stringify([...new Set((await p.locator('tbody tr td:nth-child(5)').allInnerTexts()).map(x => x.replace(/\s+/g, ' ')))]))
await shot(p, R, 'R6.06-mgr-in-all-step2', { fullPage: true })
await s.browser.close()
const o = await openAs('uat.mgr.out'); const po = o.page
await po.goto(`${BASE}/finance?tab=comp`); await settle(po); await sleep(500)
for (const t of [TL.c, TL.f]) { const [st, ts] = await uiApprove(po, 'UAT-CO2-005', t, 1); log(`R6.07 C5 ${t}:`, st.slice(0, 60), ts.at(-1)); await sleep(800) }
await po.reload(); await settle(po); await sleep(500)
log('R6.07 labels:', JSON.stringify((await po.locator('tbody tr td:nth-child(5)').allInnerTexts()).map(x => x.replace(/\s+/g, ' '))))
await shot(po, R, 'R6.07-mgr-out-after-step1')
await o.browser.close()
log(q(SQL.queue))
log('hotel:', q(`select (select username from users where id=manager_approved_by) mgr, approval_history from expenses where id='${X.hotel}'`))
log(q(`select actor_role,after_data->>'step_role' sr,count(*) from audit_logs where created_at > '2026-10-03 18:57:52+00' and target_type='expenses' and action='approve' group by 1,2`))
log('noti:', q(`select count(*) from notifications where created_at > '2026-10-03 18:57:52+00'`))
log('5xx:', s.serverErrors, o.serverErrors, 'console:', s.consoleErrors.slice(0, 3), o.consoleErrors.slice(0, 3))
