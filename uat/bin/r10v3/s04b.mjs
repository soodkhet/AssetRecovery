// R10.04 ซ้ำเรื่องเวลา (รหัสผิดครั้งที่ 2 ของ uat.finance — ไม่เกินเพดาน)
import { request } from '@playwright/test'
import { call, log, BASE } from './_h.mjs'
const one = async (b) => { const c = await request.newContext({ baseURL: BASE }); const r = await call(c, 'POST', '/api/auth/login', b); await c.dispose(); return r }
const a = await one({ identifier: 'uat.r10.nobody2', password: 'R10-wrong-pass-03' })
const b = await one({ identifier: 'uat.finance', password: 'R10-wrong-pass-04' })
const c = await one({ identifier: 'uat.r10.nobody3', password: 'R10-wrong-pass-05' })
log('R10.04 timing รอบ 2 nobody2', a.status, a.ms + 'ms · finance-wrong', b.status, b.ms + 'ms · nobody3', c.status, c.ms + 'ms')
