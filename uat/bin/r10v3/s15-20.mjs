// R10.15–R10.20 scope ทีม / own / แจ้งเตือน / portal
import { PERSONAS, sess, call, log, rnd, sameDenial, ID, qa } from './_h.mjs'
const ctx = {}; for (const u of PERSONAS) ctx[u] = await sess(u)
const rows = (b) => { const d = b?.data ?? b; if (Array.isArray(d)) return d; for (const k of ['items', 'rows', 'cases', 'users', 'data', 'claims', 'queue']) if (Array.isArray(d?.[k])) return d[k]; return null }
const refs = (b) => { const r = rows(b); if (!r) return 'shape:' + Object.keys(b?.data ?? b ?? {}).join('/'); return r.length + ':' + r.map((x) => x.caseRef ?? x.username ?? x.payeeName ?? x.id?.slice(0, 6)).join(',') }
const pair = async (u, real, fakeTpl) => { const a = await call(ctx[u], 'GET', real), b = await call(ctx[u], 'GET', fakeTpl.replace('{R}', rnd())); log('PAIR', u, real.replace(/[0-9a-f-]{36}/, (m) => Object.entries(ID).find(([, v]) => v === m)?.[0] ?? m), a.status, a.code, '| rnd', b.status, b.code, '| same=' + sameDenial(a, b)) }
log('--- R10.15 เคสตามทีม')
for (const u of ['uat.mgr.in', 'uat.sup.in', 'uat.mgr.out']) { const r = await call(ctx[u], 'GET', '/api/cases'); log('CASES', u, r.status, refs(r.body)) }
await pair('uat.mgr.in', `/api/cases/${ID.C5}`, '/api/cases/{R}'); await pair('uat.sup.in', `/api/cases/${ID.C5}`, '/api/cases/{R}')
for (const c of ['C1', 'C3', 'C7']) await pair('uat.mgr.out', `/api/cases/${ID[c]}`, '/api/cases/{R}')
let r = await call(ctx['uat.mgr.out'], 'GET', `/api/cases?teamId=${ID.TA}`); log('mgr.out cases?teamId=A', r.status, refs(r.body))
log('--- R10.16 kanban/agents/users')
r = await call(ctx['uat.mgr.in'], 'GET', `/api/teams/${ID.TB}/kanban`); log('mgr.in kanban B', r.status, r.code)
await pair('uat.mgr.in', `/api/teams/${ID.TC}/kanban`, '/api/teams/{R}/kanban'); await pair('uat.mgr.out', `/api/teams/${ID.TA}/kanban`, '/api/teams/{R}/kanban'); await pair('uat.sup.in', `/api/teams/${ID.TB}/kanban`, '/api/teams/{R}/kanban')
await pair('uat.mgr.out', `/api/teams/${ID.TA}/agents`, '/api/teams/{R}/agents')
r = await call(ctx['uat.mgr.out'], 'GET', '/api/assignments'); log('mgr.out assignments', r.status, refs(r.body), 'teamA=' + JSON.stringify(r.body).includes(ID.TA))
for (const [u, p] of [['uat.mgr.in', '/api/users'], ['uat.mgr.in', '/api/users?search=uat'], ['uat.mgr.out', '/api/users?search=uat'], ['uat.mgr.out', `/api/users?teamId=${ID.TA}`]]) { r = await call(ctx[u], 'GET', p); log('USERS', u, p, r.status, refs(r.body)) }
await pair('uat.mgr.out', `/api/users/${ID.U_IN1}`, '/api/users/{R}'); await pair('uat.admin', `/api/users/${ID.U_FIN}`, '/api/users/{R}')
r = await call(ctx['uat.admin'], 'GET', '/api/users?roleGroup=system'); log('uat.admin users?roleGroup=system', r.status, r.code, refs(r.body))
r = await call(ctx['uat.admin'], 'GET', '/api/users'); log('uat.admin users', r.status, refs(r.body))
log('--- R10.17 คิวค่าตอบแทน')
for (const u of ['uat.mgr.out', 'uat.mgr.in', 'uat.finance', 'uat.exec']) for (const p of ['/api/compensation', '/api/claims', '/api/compensation?status=all', '/api/claims?status=all']) { r = await call(ctx[u], 'GET', p); const t = JSON.stringify(r.body); log('COMP', u, p, r.status, r.code ?? '', refs(r.body), 'in1=' + t.includes(ID.PIN1) + ' in2=' + t.includes(ID.PIN2) + ' out1=' + t.includes(ID.POUT1)) }
const outComm = qa(`select e.id from expenses e where e.payee_id='${ID.POUT1}' order by created_at limit 1`)
r = await call(ctx['uat.mgr.out'], 'PATCH', `/api/compensation/${outComm}/approve`, {}); log('mgr.out approve own-team {}', r.status, r.code)
log('--- R10.18 own')
for (const u of ['uat.agent.in1', 'uat.agent.in2', 'uat.agent.out1']) {
  for (const p of ['/api/field/cases', '/api/field/cases?tab=all', '/api/field/cases?status=closed', '/api/advances', '/api/payees', '/api/field/expenses', '/api/field/income-summary', '/api/cases', '/api/payout-batches', '/api/users']) {
    r = await call(ctx[u], 'GET', p); const t = JSON.stringify(r.body)
    log('OWN', u, p, r.status, r.code ?? '', refs(r.body), 'mask=' + /x{3,}|\*{3,}/i.test(t), 'others=' + ['อนันต์', 'บุญมี', 'ประเสริฐ'].filter((n) => t.includes(n)).join('/'))
  }
}
await pair('uat.agent.in1', `/api/field/cases/${ID.C5}`, '/api/field/cases/{R}'); await pair('uat.agent.in2', `/api/field/cases/${ID.C1}`, '/api/field/cases/{R}'); await pair('uat.agent.out1', `/api/field/cases/${ID.C1}`, '/api/field/cases/{R}')
await pair('uat.agent.in1', `/api/payees/${ID.PIN2}`, '/api/payees/{R}'); await pair('uat.agent.in2', `/api/payees/${ID.PIN1}`, '/api/payees/{R}'); await pair('uat.agent.out1', `/api/payees/${ID.PIN1}`, '/api/payees/{R}')
log('expense SQL', qa(`select string_agg(u.username||':'||c, ' ') from (select p.user_id, count(*) c from expenses e join payee_profiles p on p.id=e.payee_id group by 1) x join users u on u.id=x.user_id`))
log('--- R10.19 แจ้งเตือน')
const dbn = Object.fromEntries(qa(`select u.username, count(*) from notifications n join users u on u.id=n.user_id group by 1`).split('\n').filter(Boolean).map((l) => l.split('|')))
for (const u of PERSONAS) {
  r = await call(ctx[u], 'GET', '/api/notifications?limit=100'); const rs = rows(r.body) ?? []
  const uid = r.body?.data?.userId
  log('NOTI', u, r.status, 'api=' + rs.length, 'unread=' + (r.body?.data?.unreadCount ?? r.body?.meta?.unreadCount ?? '?'), 'db=' + (dbn[u] ?? 0), u === 'uat.mgr.out' ? 'leak=' + /UAT-CO1-|UAT-CO2-003|UAT-CO2-007/.test(JSON.stringify(r.body)) : '')
}
const nid = qa(`select n.id from notifications n where n.user_id='${ID.U_IN1}' and n.read_at is not null limit 1`)
const before = qa(`select read_at from notifications where id='${nid}'`)
const a = await call(ctx['uat.mgr.out'], 'PATCH', `/api/notifications/${nid}/read`, {}), b = await call(ctx['uat.mgr.out'], 'PATCH', `/api/notifications/${rnd()}/read`, {})
log('NOTI read other', a.status, a.code, '| rnd', b.status, b.code, 'same=' + sameDenial(a, b), 'read_at same=' + (before === qa(`select read_at from notifications where id='${nid}'`)))
if (a.status >= 200 && a.status < 300 && a.body?.data) log('NOTE: 2xx — ตรวจ read_at เท่าเดิมแล้ว')
log('--- R10.20 portal')
for (const u of ['uat.co1.mgr', 'admin']) { for (const m of ['GET', 'POST']) { r = await call(ctx[u], m, '/api/portal/cases', m === 'POST' ? {} : undefined); log('PORTAL', u, m, r.status, r.code) } }
