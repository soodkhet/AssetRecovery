// R4.23b v3 settle รายวัน: probe การเงิน 403 / วันอนาคต-วันผิด 400 → admin สั่ง daily_field_allowance 2026-10-04 → สั่งซ้ำ (นาทีเดียวกัน / นาทีใหม่)
// → หน้าเบิกของ in1/in2/out1 หลัง settle + income/แดชบอร์ดไม่เปลี่ยน + mgr.in คิวอนุมัติ (อ่านอย่างเดียว)
import { openAs, shot, BASE, settle, sleep, mainText, q, log, SQL, fmt } from './_h.mjs'
const R = 'R4v3'
const DATE = process.env.SETTLE_DATE ?? '2026-10-04'
const JT = 'daily_field_allowance'
const trig = (page, date) => page.request.post(`${BASE}/api/dev/trigger-job`, { data: { jobType: JT, payload: { date } } })
const counts = () => q(`select (select count(*) from jobs where job_type='${JT}') jobs,(select count(*) from field_day_settlements) fds,(select count(*) from expenses) ex,(select count(*) from revenues) rev,(select count(*) from notifications) noti`)
log('=== s11b v3', new Date().toISOString(), 'DATE', DATE)
log('R4.23b before:', counts())

// probe 1 — การเงิน (manage_jobs = view) → 403
let s = await openAs('uat.finance')
log('R4.23b finance 403:', await fmt(await trig(s.page, DATE)))
await s.browser.close()

// probe 2 — admin วันอนาคต / วันผิด → 400
s = await openAs('admin')
const { page } = s
log('R4.23b admin 2026-10-05:', await fmt(await trig(page, '2026-10-05')))
log('R4.23b admin 2026-02-30:', await fmt(await trig(page, '2026-02-30')))
log('R4.23b after probes:', counts())

// ทำจริง + สั่งซ้ำนาทีเดียวกัน
const t1 = new Date()
const r1 = await trig(page, DATE)
const j1 = await r1.json()
log('R4.23b REAL', t1.toISOString(), r1.status(), JSON.stringify(j1).slice(0, 1500))
const t2 = new Date()
const r2 = await trig(page, DATE)
log('R4.23b same-minute', t2.toISOString(), 'sameMinute=', t1.toISOString().slice(0, 16) === t2.toISOString().slice(0, 16), await fmt(r2))
log('R4.23b after real:', counts())
log(q(SQL.fds)); log(q(SQL.job)); log(q(SQL.ex))
log(q(`select u.username, x.expense_type, sum(x.gross_satang) from expenses x join payee_profiles p on p.id=x.payee_id join users u on u.id=p.user_id where x.field_day_settlement_id is not null group by 1,2 order by 1,2`))
log(q(`select assignment_id, expense_type, count(*) from expenses where status<>'superseded' and field_day_settlement_id is null group by 1,2 having count(*)>1`))
log(q(`select x.expense_type,x.case_id is not null has_case,u.username created_by,x.expense_date,count(*) from expenses x left join users u on u.id=x.created_by where x.field_day_settlement_id is not null group by 1,2,3,4 order by 3,1`))
log(q(`select a.action,a.target_type,a.actor_id is null sys,left(a.reason,120) reason,a.after_data->'events' ev,count(*) from audit_logs a where a.created_at >= '${t1.toISOString()}' group by 1,2,3,4,5 order by 2,1`))

// สั่งซ้ำนาทีใหม่
const wait = 61000 - (Date.now() % 60000)
log('R4.23b wait ms', wait); await sleep(wait)
const r3 = await trig(page, DATE)
log('R4.23b next-minute', new Date().toISOString(), await fmt(r3))
log('R4.23b after rerun:', counts())
log(q(SQL.job))
log('admin console', s.consoleErrors, 'server', s.serverErrors)
await s.browser.close()

// หน้าจอพนักงานหลัง settle
for (const [u, tag] of [['uat.agent.in1', 'in1'], ['uat.agent.in2', 'in2'], ['uat.agent.out1', 'out1']]) {
  const a = await openAs(u, { mobile: true })
  await a.page.goto(`${BASE}/field/expenses`); await settle(a.page); await sleep(1200)
  // กางทุกกลุ่มเคส
  for (const h of await a.page.locator('main button:has-text("UAT-CO")').all()) { await h.click().catch(() => {}); await sleep(300) }
  log(`R4.23b ${tag} expenses:`, await mainText(a.page, 2200))
  log(`R4.23b ${tag} box count:`, await a.page.getByText('รอคำนวณหลังจบวัน').count())
  const j = await (await a.page.request.get(`${BASE}/api/field/expenses?type=caseBound`)).json()
  log(`R4.23b ${tag} API:`, JSON.stringify(j.data.pendingFieldDates), j.data.pendingSatang, j.data.items.map(i => `${i.caseRef}:${i.expenseType}:${i.grossSatang}:${i.status}`).join(','))
  await shot(a.page, R, `23b-${tag}-expenses-settled`, { fullPage: true })
  await a.page.goto(`${BASE}/field/income`); await settle(a.page); await sleep(1000)
  log(`R4.23b ${tag} income:`, await mainText(a.page, 600))
  await a.page.goto(`${BASE}/field`); await settle(a.page); await sleep(1000)
  log(`R4.23b ${tag} dashboard:`, (await mainText(a.page, 900)).replace(/.*สรุปภาพรวม/, ''))
  log(`${tag} console`, a.consoleErrors, 'server', a.serverErrors)
  await a.browser.close()
}

// mgr.in คิวอนุมัติ (อ่านอย่างเดียว — บล็อก non-GET /api)
const m = await openAs('uat.mgr.in')
const blocked = []
await m.page.route('**/api/**', r => { if (r.request().method() !== 'GET') { blocked.push(`${r.request().method()} ${r.request().url()}`); return r.abort() } return r.continue() })
await m.page.goto(`${BASE}/finance/approvals`); await settle(m.page); await sleep(1500)
log('R4.23b mgr.in approvals url:', m.page.url())
log('R4.23b mgr.in approvals:', await mainText(m.page, 2000))
await shot(m.page, R, '23b-mgr-in-approvals', { fullPage: true })
log('R4.23b mgr.in blocked:', blocked, 'console', m.consoleErrors, 'server', m.serverErrors)
await m.browser.close()
