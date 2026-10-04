import { openAs, R, ID, log, q, q1, api, guard2xx, sleep, auditSince, notiSince } from './_h.mjs'
log('=== R7.17-21', new Date().toISOString())
const T1 = q1('select now()'); log('T1', T1)
const TJ = '/api/dev/trigger-job'
const body = { jobType: 'advance_overdue', payload: { asOf: '2026-10-05' } }
let x
for (const u of ['uat.finance', 'uat.exec']) { const s = await openAs(u); x = await api(s.page, 'POST', TJ, body); log('17', u, x); guard2xx('17 '+u, x); await s.browser.close() }
log(q(`select (select count(*) from jobs where created_at > '${T1}') jobs, (select status from advances where id='${ID.ADV3}') adv3`))
const ad = await openAs('admin'); const p = ad.page
x = await api(p, 'POST', TJ, { jobType: 'advance_overdue' }); log('18 no asOf', x)
log(q(`select job_type, status, result, to_char(created_at,'HH24:MI:SS') from jobs where created_at > '${T1}' order by created_at`))
log(q(`select status from advances where id='${ID.ADV3}'`))
const T19 = q1('select now()')
for (const b of [
  { jobType: 'advance_overdue', payload: { asOf: '2026-10-03' } },
  { jobType: 'advance_overdue', payload: { asOf: '2026-11-05' } },
  { jobType: 'advance_overdue', payload: { asOf: '05/10/2569' } },
  { jobType: 'reassign_timeout', payload: { asOf: '2026-10-05' } },
  { jobType: 'wht_filing_reminder' },
  { jobType: 'abc' },
]) { x = await api(p, 'POST', TJ, b); log('19', JSON.stringify(b), x); guard2xx('19', x) }
log('19 jobs since', q(`select count(*) from jobs where created_at > '${T19}'`))
// R7.20 — เริ่มต้นนาทีเพื่อให้ 21a อยู่นาทีเดียวกัน
while (new Date().getSeconds() > 35) await sleep(1000)
x = await api(p, 'POST', TJ, body); log('20 asOf', x)
x = await api(p, 'POST', TJ, body); log('21a same minute', x)
log(q(`select status, due_clear_date from advances where id='${ID.ADV3}'`))
log(q(`select action, actor_id, before_data->>'status' b, after_data->>'status' a, after_data->>'auto_marked' am, reason from audit_logs where target_type='advances' and created_at > '${T1}'`))
log(q(notiSince(T1)))
log(q(`select action, left(reason,200) reason from audit_logs where target_type='jobs' and created_at > '${T1}' order by created_at`))
const s0 = new Date().getMinutes(); while (new Date().getMinutes() === s0) await sleep(1000); await sleep(1500)
x = await api(p, 'POST', TJ, body); log('21b next minute', x)
log(q(`select job_type, status, result, idempotency_key, to_char(created_at,'HH24:MI:SS') from jobs where created_at > '${T1}' order by created_at`))
log(q(`select (select count(*) from notifications where event_code='advance.overdue') noti, (select count(*) from audit_logs where target_type='advances' and created_at > '${T1}') adv_aud`))
await ad.browser.close()
