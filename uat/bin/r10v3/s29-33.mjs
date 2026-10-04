// R10.29 เช็คซ้ำ · R10.30 race session · R10.31 login ซ้อน · R10.32 logout+replay · R10.33 settle ของคนอื่น
import { request } from '@playwright/test'
import { PERSONAS, sess, login, call, log, ID, qa, BASE } from './_h.mjs'
const ctx = {}; for (const u of PERSONAS) ctx[u] = await sess(u)
log('--- R10.29')
let r = await call(ctx['uat.account'], 'PATCH', '/api/bank-reconciliation/transactions/not-a-uuid/match', {}); log('BUG-111 account', r.status, r.code)
r = await call(ctx['uat.co1.mgr'], 'PATCH', '/api/bank-reconciliation/transactions/not-a-uuid/match', {}); log('BUG-111 co1.mgr', r.status, r.code)
const pg = await ctx['uat.finance'].get('/finance?tab=payee', { failOnStatusCode: false }); log('BUG-087 finance /finance?tab=payee', pg.status(), new URL(pg.url()).pathname + new URL(pg.url()).search)
for (const [u, p] of [['uat.exec', '/api/payout-batches'], ['uat.exec', '/api/advances'], ['uat.approver', '/api/finance-companies']]) { r = await call(ctx[u], 'GET', p); log('RECHK', u, p, r.status, r.code ?? '') }
log('--- R10.30 race 300 คำขอ')
const exp = {}; for (const u of PERSONAS) { const s = await call(ctx[u], 'GET', '/api/meta/menu'); exp[u] = s.body.data.audience }
const jobs = []
for (const u of PERSONAS) for (let i = 0; i < 20; i++) jobs.push((async () => {
  if (i % 2) { const s = await call(ctx[u], 'GET', '/api/auth/session'); return { u, ok: s.status === 200 && s.body?.data?.user?.username === u, st: s.status } }
  const m = await call(ctx[u], 'GET', '/api/meta/menu'); return { u, ok: m.status === 200 && m.body?.data?.audience === exp[u], st: m.status }
})())
const t0 = Date.now(); const res = await Promise.all(jobs)
const bad = res.filter((x) => !x.ok); const st = {}; for (const x of res) st[x.st] = (st[x.st] ?? 0) + 1
log('R10.30', res.length, 'คำขอ', (Date.now() - t0) + 'ms', 'status=' + JSON.stringify(st), 'mismatch=' + bad.length, bad.slice(0, 5).map((x) => x.u + ':' + x.st).join(','))
log('--- R10.31 login ซ้อน co2.admin')
const L0 = qa(`select count(*) from audit_logs where action in ('login','logout')`)
const [S1, S2] = await Promise.all([login('uat.co2.admin', { save: false }), login('uat.co2.admin', { save: false })])
const a1 = await call(S1, 'GET', '/api/auth/session'), a2 = await call(S2, 'GET', '/api/auth/session')
log('S1/S2 session', a1.status, a2.status, 'audit +' + (qa(`select count(*) from audit_logs where action in ('login','logout')`) - L0))
log('--- R10.32 logout + replay')
const st1 = await S1.storageState()
r = await call(S1, 'POST', '/api/auth/logout', {}); log('logout S1', r.status, r.code ?? '')
log('audit logout', qa(`select a.actor_role||'|'||u.username from audit_logs a join users u on u.id=a.actor_id where a.action='logout' order by a.created_at desc limit 1`))
const replay = await request.newContext({ baseURL: BASE, storageState: st1 })
r = await call(replay, 'GET', '/api/auth/session'); log('replay S1 cookie', r.status, r.code)
r = await call(replay, 'GET', '/api/cases'); log('replay S1 /api/cases', r.status, r.code)
r = await call(S2, 'GET', '/api/auth/session'); log('S2 หลัง S1 logout', r.status, r.code)
r = await call(ctx['uat.co2.admin'], 'GET', '/api/auth/session'); log('co2 storageState เดิม (R10.02) หลัง logout', r.status, r.code)
await login('uat.co2.admin'); log('co2.admin login ใหม่ เก็บ storageState แล้ว')
log('--- R10.33 settle advance in1 โดย in2')
const adv0 = qa(`select status||'|'||coalesce(used_satang::text,'') from advances where id='${ID.ADV_IN1}'`)
r = await call(ctx['uat.agent.in2'], 'PATCH', `/api/advances/${ID.ADV_IN1}/settle`, { usedSatang: 10000, note: 'probe R10 scope' }); log('in2 settle in1-adv', r.status, r.code)
if (r.status < 300) { log('!!! STOP'); process.exit(9) }
r = await call(ctx['uat.agent.in2'], 'PATCH', `/api/advances/00000000-0000-4000-8000-000000000000/settle`, { usedSatang: 10000, note: 'probe R10 scope' }); log('in2 settle rnd', r.status, r.code)
log('adv ก่อน/หลัง', adv0, qa(`select status||'|'||coalesce(used_satang::text,'') from advances where id='${ID.ADV_IN1}'`))
