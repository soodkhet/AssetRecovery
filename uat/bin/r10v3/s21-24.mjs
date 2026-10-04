// R10.21–R10.24 9 รายการ "✅ only" · seed role
import { sess, call, log, ID, qa } from './_h.mjs'
const ctx = {}; for (const u of ['admin', 'uat.exec', 'uat.admin']) ctx[u] = await sess(u)
const LOCKS = ['manage_companies', 'manage_service_fees', 'manage_tax_profiles', 'manage_period_lock_policy', 'manage_invoice_numbering', 'manage_roles', 'approve_adjustment_locked', 'unlock_period', 'authorize_exception']
log('--- R10.21')
let r = await call(ctx.admin, 'GET', `/api/roles/${ID.R_ADMIN}/permissions`)
const d = r.body?.data; const list = d?.capabilities ?? d?.entries ?? d?.items ?? (Array.isArray(d) ? d : [])
const locked = list.filter((x) => x.locked).map((x) => x.code ?? x.capabilityCode).sort()
log('role ธุรการ perms', r.status, 'n=' + list.length, 'hasLockedKey=' + list.every((x) => 'locked' in x), 'editable=' + (d?.editable ?? d?.role?.editable ?? d?.isEditable ?? d?.role?.isEditable), 'locked=' + locked.join(','), 'match9=' + (JSON.stringify(locked) === JSON.stringify([...LOCKS].sort())))
r = await call(ctx.admin, 'GET', '/api/settings/functional-permissions')
const fd = r.body?.data; const caps = fd?.capabilities ?? fd?.rows ?? fd?.items ?? []
const fl = caps.filter((x) => x.locked || x.lockedTo || x.isLocked).map((x) => x.code ?? x.capabilityCode)
log('functional grid', r.status, 'keys=' + Object.keys(fd ?? {}).join('/'), 'n=' + caps.length, 'locked=' + fl.length + ':' + fl.join(','))
log('--- R10.22')
const ck = (res) => `${res.status} ${res.code} «${res.msg}»`
for (const c of LOCKS) {
  r = await call(ctx.admin, 'PATCH', `/api/roles/${ID.R_ADMIN}/permissions`, { entries: [{ capabilityCode: c, level: 'view' }, { capabilityCode: 'zz_r10_probe', level: 'view' }], reason: 'probe R10 สิทธิ์ล็อก' })
  log('LOCK', c, ck(r), 'specRef=' + /§|ไฟล์ \d|`\d\d`/.test(r.msg ?? ''), 'rawCode=' + (r.msg ?? '').includes(c))
  if (r.status >= 200 && r.status < 300) { log('!!! STOP'); process.exit(9) }
}
log('--- R10.23')
const fe = (c, lv = 'manage') => ({ entries: [{ roleId: ID.R_ADMIN, capabilityCode: c, level: lv }, { roleId: ID.R_ADMIN, capabilityCode: 'zz_r10_probe', level: 'view' }], reason: 'probe R10 สิทธิ์ล็อก' })
for (const c of ['unlock_period', 'manage_roles', 'manage_settings']) { r = await call(ctx.admin, 'PATCH', '/api/settings/functional-permissions', fe(c)); log('FUNC', c, ck(r)); if (r.status < 300) { log('!!! STOP'); process.exit(9) } }
r = await call(ctx.admin, 'PATCH', `/api/roles/${ID.R_EXEC}/permissions`, { entries: [{ capabilityCode: 'unlock_period', level: 'none' }, { capabilityCode: 'zz_r10_probe', level: 'view' }], reason: 'probe R10' }); log('EXEC-downgrade', ck(r))
for (const u of ['uat.exec', 'uat.admin']) { r = await call(ctx[u], 'PATCH', `/api/roles/${ID.R_ADMIN}/permissions`, { entries: [{ capabilityCode: LOCKS[0], level: 'view' }, { capabilityCode: 'zz_r10_probe', level: 'view' }], reason: 'probe R10 สิทธิ์ล็อก' }); log('NONSA', u, ck(r)) }
log('--- R10.24')
r = await call(ctx.admin, 'DELETE', `/api/roles/${ID.R_SUPCO}`, { reason: 'probe R10 ลบ seed role' }); log('DEL seed', ck(r))
log('roles active', qa('select count(*) from roles where deleted_at is null'), 'rc', qa('select count(*) from role_capabilities'))
