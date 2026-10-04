// R10.11–R10.14 scope บริษัท
import { sess, call, log, rnd, sameDenial, ID } from './_h.mjs'
const U = ['uat.co1.mgr', 'uat.co1.sup', 'uat.co2.admin']
const ctx = {}; for (const u of [...U, 'uat.exec']) ctx[u] = await sess(u)
export const rows = (b) => { const d = b?.data ?? b; if (Array.isArray(d)) return d; for (const k of ['items', 'rows', 'cases', 'assets', 'lots', 'batches', 'revenues', 'buckets', 'data']) if (Array.isArray(d?.[k])) return d[k]; return null }
const refs = (b) => { const r = rows(b); if (!r) return 'shape:' + Object.keys(b?.data ?? b ?? {}).join('/'); return r.length + ':' + r.map((x) => x.caseRef ?? x.lotNo ?? x.lotNumber ?? x.batchNo ?? x.batchNumber ?? x.caseId?.slice(0, 4) ?? x.companyShortName ?? x.id?.slice(0, 6)).join(',') }
log('--- R10.11 รายการ')
for (const u of U) {
  const other = u === 'uat.co2.admin' ? ID.CO1 : ID.CO2
  const out = []
  for (const p of ['/api/cases', `/api/cases?companyId=${other}`, '/api/assets', `/api/assets?companyId=${other}`, '/api/handover-lots', '/api/billing-batches', '/api/revenues', `/api/revenues?companyId=${other}`, '/api/ar-aging', `/api/ar-aging?companyId=${other}`]) {
    const r = await call(ctx[u], 'GET', p); const t = JSON.stringify(r.body)
    out.push(`${p.replace(/companyId=.*/, 'companyId=อื่น')} ${r.status} ${refs(r.body)} leakOther=${t.includes(u === 'uat.co2.admin' ? 'UAT-CO1' : 'UAT-CO2') || t.includes(other)}`)
  }
  log('CO', u, '\n  ' + out.join('\n  '))
}
log('--- R10.12 detail ข้ามบริษัท vs สุ่ม')
const pairs = [
  ['uat.co1.mgr', `/api/cases/${ID.C3}`, '/api/cases/{R}'], ['uat.co1.mgr', `/api/cases/${ID.C5}`, '/api/cases/{R}'], ['uat.co1.mgr', `/api/cases/${ID.C7}`, '/api/cases/{R}'],
  ['uat.co1.mgr', `/api/assets/${ID.AS5}`, '/api/assets/{R}'], ['uat.co1.mgr', `/api/handover-lots/${ID.LOT4}`, '/api/handover-lots/{R}'], ['uat.co1.mgr', `/api/billing-batches/${ID.BB2}`, '/api/billing-batches/{R}'],
  ['uat.co2.admin', `/api/cases/${ID.C1}`, '/api/cases/{R}'], ['uat.co2.admin', `/api/billing-batches/${ID.BB1}`, '/api/billing-batches/{R}'], ['uat.co2.admin', `/api/handover-lots/${ID.LOT3}`, '/api/handover-lots/{R}'], ['uat.co2.admin', `/api/assets/${ID.AS1}`, '/api/assets/{R}'],
  ['uat.co1.sup', `/api/cases/${ID.C5}`, '/api/cases/{R}'],
]
for (const [u, real, fake] of pairs) {
  const a = await call(ctx[u], 'GET', real), b = await call(ctx[u], 'GET', fake.replace('{R}', rnd()))
  log('PAIR', u, real, a.status, a.code, '| rnd', b.status, b.code, '| same=' + sameDenial(a, b))
}
let r = await call(ctx['uat.co1.mgr'], 'GET', `/api/handover-lots/${ID.LOT3}/pdf`); log('co1.mgr lot3 pdf', r.status, r.code)
log('--- R10.13 ฟิลด์ภายใน')
const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o?.[k] === undefined ? 'undef' : (Array.isArray(o[k]) ? `[${o[k].length}]` : o[k])]))
const KC = ['assignedTeamId', 'assignedTeamName', 'suggestedTeamName', 'createdByName', 'reviewNote', 'editHistory', 'serviceFeeTemplateId', 'projectedRevenueSource']
for (const u of ['uat.co1.mgr', 'uat.exec']) { const r = await call(ctx[u], 'GET', `/api/cases/${ID.C1}`); log('C1', u, r.status, JSON.stringify(pick(r.body?.data, KC))) }
const KA = ['imeiActual', 'serialActual', 'teamId', 'teamName', 'agentId', 'agentName', 'rejectReason']
for (const u of ['uat.co1.mgr', 'uat.exec']) { const r = await call(ctx[u], 'GET', '/api/assets'); const rs = rows(r.body) ?? []; log('AST', u, r.status, rs.length, JSON.stringify(rs.map((x) => pick(x, KA)))) }
log('--- R10.14 ปลายทางภายใน')
for (const p of [`/api/teams/${ID.TA}/kanban`, '/api/compensation', `/api/payees/${ID.PIN1}`, '/api/accounting/periods', '/api/adjustments', '/api/jobs', '/api/audit-logs', '/api/users']) {
  const r = await call(ctx['uat.co1.mgr'], 'GET', p); log('INT co1.mgr', p, r.status, r.code)
}
r = await call(ctx['uat.co1.mgr'], 'GET', '/api/auth/session'); log('co1 landing', JSON.stringify(r.body?.data?.landing ?? r.body?.data?.redirectTo ?? Object.keys(r.body?.data?.user ?? {})))
