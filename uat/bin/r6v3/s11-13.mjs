// R6.11 C1 ทีละใบ · R6.12 C2×3 + hotel · R6.13 C5 commission → fuel + probe ขั้น 3
import { openAs, shot, BASE, settle, sleep, log, R, X, q, SQL, api, guard2xx, uiApprove, TL, row } from './_h.mjs'
log('=== s11-13', new Date().toISOString())
const s = await openAs('uat.finance'); const p = s.page
await p.goto(`${BASE}/finance?tab=comp`); await settle(p); await sleep(600)
const revN = () => q(`select count(*) from revenues`).match(/\n\s*(\d+)/)?.[1]
const steps = [['R6.11', 'UAT-CO1-001', TL.f], ['R6.11', 'UAT-CO1-001', TL.a], ['R6.11', 'UAT-CO1-001', TL.c],
  ['R6.12', 'UAT-CO1-002', TL.f], ['R6.12', 'UAT-CO1-002', TL.a], ['R6.12', 'UAT-CO1-002', TL.c], ['R6.12', 'ไม่ผูกเคส', TL.h],
  ['R6.13', 'UAT-CO2-005', TL.c], ['R6.13', 'UAT-CO2-005', TL.f]]
for (const [k, ref, t] of steps) {
  const [st, ts] = await uiApprove(p, ref, t, 2)
  const m = st.match(/"status":"(\w+)".*?"approvalStepCurrent":(\d)/)
  log(`${k} ${ref} ${t}: ${st.slice(0, 4)} → ${m?.[1]} cur ${m?.[2]} | toast ${ts.at(-1)} | revenues=${revN()}`)
  if (ref === 'UAT-CO1-001' && t === TL.c) await shot(p, R, 'R6.11-c1-third-approved')
  await sleep(700)
}
log(q(SQL.rev))
await p.reload(); await settle(p); await sleep(600)
log('R6.13 C5 fuel row:', (await row(p, 'UAT-CO2-005', TL.f).innerText()).replace(/\s+/g, ' '))
await shot(p, R, 'R6.13-finance-after-step2', { fullPage: true })
const pr = await api(p, 'PATCH', `/api/compensation/${X.C5f}/approve`, { step: 3 }); log('R6.13 probe finance step3:', pr); guard2xx('fin step3', pr)
log('revenues=', revN())
log(q(`select left(target_id::text,8) tid, after_data->'revenue_ids_created' rev, after_data->'revenue_eligible_case_ids' elig from audit_logs where action='approve' and target_type='expenses' and actor_role='การเงิน' and created_at > '2026-10-03 18:57:52+00' order by created_at`))
log(q(`select u.username,n.event_code,n.title,left(n.body,90) b,n.link_path from notifications n join users u on u.id=n.user_id where n.created_at > '2026-10-03 18:57:52+00' and n.event_code='expense.approved' order by n.created_at`))
log('5xx', s.serverErrors, s.consoleErrors.slice(0, 3))
await s.browser.close()
