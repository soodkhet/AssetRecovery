// R13.50 เวลาตอบ login ผิด (BUG-140) — สลับ (ก) uat.co2.admin + รหัสผิด / (ข) uat.nobody.r13 + รหัสผิด 5 รอบ · ห้าม log รหัส
import { request } from '@playwright/test'
import { BASE, log, q } from './_h.mjs'
import { login } from '../r10v3/_h.mjs'
log('=== k50', new Date().toISOString())
const T = new Date().toISOString()
const ctx = await request.newContext({ baseURL: BASE })
const res = { a: [], b: [] }, msgs = new Set()
for (let i = 0; i < 5; i++) for (const [k, id] of [['a', 'uat.co2.admin'], ['b', 'uat.nobody.r13']]) {
  const t = Date.now()
  const r = await ctx.post('/api/auth/login', { data: { identifier: id, password: 'wrong-pass-R13' }, failOnStatusCode: false })
  const ms = Date.now() - t; const b = await r.json().catch(() => ({}))
  res[k].push(ms); msgs.add(`${r.status()} ${b?.error?.code} ${b?.error?.message}`)
}
const med = a => [...a].sort((x, y) => x - y)[2]
log('R13.50 ms a', res.a, 'median', med(res.a)); log('R13.50 ms b', res.b, 'median', med(res.b)); log('ratio', (Math.max(med(res.a), med(res.b)) / Math.min(med(res.a), med(res.b))).toFixed(2))
log('responses', [...msgs])
log('audit', q(`select action, count(*), string_agg(distinct coalesce(after_data->>'identifier', after_data->>'username', ''), ',') from audit_logs where created_at > '${T}' group by action`))
const ok = await login('uat.co2.admin'); log('co2.admin login ปกติ: 200'); await ok.dispose()
