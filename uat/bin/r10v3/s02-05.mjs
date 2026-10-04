// R10.02–R10.05 login ขนาน · failed login · ไม่ leak · audit ตามสิทธิ์
import { request } from '@playwright/test'
import { PERSONAS, login, call, log, pool, qa, BASE } from './_h.mjs'
const T0 = process.argv[2]
const ctx = {}
log('--- R10.02 login ขนาน 15 (pool 5)')
const lt = Date.now()
await pool(PERSONAS, 5, async (u) => { ctx[u] = await login(u) })
log(`login 15 ok ใน ${Date.now() - lt} ms`)
const summary = {}
for (const u of PERSONAS) {
  const r = await call(ctx[u], 'GET', '/api/auth/session')
  const d = r.body?.data ?? r.body
  const user = d?.user ?? d
  summary[u] = { st: r.status, username: user?.username, role: user?.roleName ?? user?.role?.name ?? user?.role, group: user?.roleGroup, scope: user?.scope, mcp: user?.mustChangePassword, caps: user?.capabilities, landing: d?.landing ?? user?.landing }
}
log('R10.02 session keys sample', Object.keys((await call(ctx['uat.finance'], 'GET', '/api/auth/session')).body?.data ?? {}))
for (const [u, s] of Object.entries(summary)) log('S', u, JSON.stringify(s))
log('--- R10.03/04 failed login')
const fresh = async () => request.newContext({ baseURL: BASE })
const tries = [
  ['wrong', { identifier: 'uat.finance', password: 'R10-wrong-pass-01' }],
  ['nobody', { identifier: 'uat.r10.nobody', password: 'R10-wrong-pass-02' }],
  ['malformed', { identifier: 'a b c', password: 'x' }],
  ['empty', {}],
]
const res = {}
for (const [k, body] of tries) {
  const c = await fresh(); const r = await call(c, 'POST', '/api/auth/login', body); res[k] = r
  log(k, r.status, r.code, r.ms + 'ms', JSON.stringify(r.body))
  await c.dispose()
}
log('wrong vs nobody body เหมือนกัน:', JSON.stringify(res.wrong.body) === JSON.stringify(res.nobody.body))
log('audit failed rows', qa(`select a.actor_id is null, a.target_id is null, a.after_data::text, a.ip_address is not null from audit_logs a where a.action='login' and a.created_at > '${T0}' and a.after_data->>'result'<>'success' order by a.created_at`))
log('audit password leak count', qa(`select count(*) from audit_logs where after_data::text like '%R10-wrong%' or coalesce(reason,'') like '%R10-wrong%' or before_data::text like '%R10-wrong%'`))
log('audit success', qa(`select count(*), count(distinct a.actor_id), bool_and(a.ip_address is not null), bool_and(a.user_agent is not null), bool_and(a.target_id=a.actor_id), string_agg(distinct a.target_type::text, ',') from audit_logs a where a.action='login' and a.created_at > '${T0}' and a.after_data->>'result'='success'`))
log('audit success role check', qa(`select count(*) from audit_logs a join users u on u.id=a.actor_id join roles r on r.id=u.role_id where a.action='login' and a.created_at > '${T0}' and a.after_data->>'result'='success' and a.actor_role<>r.name`))
log('--- R10.05 audit-logs ตามสิทธิ์')
const failedId = qa(`select id from audit_logs where action='login' and after_data->>'identifier'='uat.finance' and after_data->>'result'='failed' and created_at > '${T0}' order by created_at desc limit 1`)
for (const u of PERSONAS) {
  const r = await call(ctx[u], 'GET', '/api/audit-logs?action=login')
  const txt = JSON.stringify(r.body ?? '')
  const r2 = await call(ctx[u], 'GET', `/api/audit-logs/${failedId}`)
  log('AUD', u, r.status, r.code ?? '-', 'seesFailed=' + txt.includes(failedId), 'pwLeak=' + txt.includes('R10-wrong'), '| detail', r2.status, r2.code ?? '-')
}
log('triggers', qa(`select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid='audit_logs'::regclass and not tgisinternal`))
