// ตัวช่วย R10 v3 — API ขนาน (ไม่เปิด browser) · ห้าม log รหัสผ่าน/ body ของ login
import { request } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { BASE, credentials } from '../lib.mjs'
export { BASE }
mkdirSync('uat/bin/r10v3', { recursive: true })
const LOG = 'uat/bin/r10v3/run.log'
export const rnd = () => randomUUID()
export function log(...a) { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync(LOG, s + '\n') }
export function q(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).replace(/^SET\n/, '').trim() }
export function qa(sql) { // ค่าเดียว/แถวแบบ unaligned
  return execFileSync('psql', ['-h', 'localhost', '-U', 'assetrecovery', '-d', 'assetrecovery_dev', '-XAt', '-F', '|', '-c', 'set default_transaction_read_only = on', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'assetrecovery' } }).replace(/^SET\n/, '').trim()
}
export async function login(u, { save = true } = {}) {
  const c = credentials(u)
  const ctx = await request.newContext({ baseURL: BASE })
  const r = await ctx.post('/api/auth/login', { data: { identifier: c.username, password: c.password }, failOnStatusCode: false })
  if (r.status() !== 200) throw new Error(`login ${u} → ${r.status()}`)
  if (save) await ctx.storageState({ path: `uat/.auth/${u}.json` })
  return ctx
}
/** ใช้ session ที่เก็บไว้ (O38) */
export async function sess(u) {
  const p = `uat/.auth/${u}.json`
  if (!existsSync(p)) throw new Error('no state ' + u)
  return request.newContext({ baseURL: BASE, storageState: p })
}
export async function call(ctx, method, path, data) {
  const t = Date.now()
  const r = await ctx.fetch(path, { method, ...(data === undefined ? {} : { data }), failOnStatusCode: false, maxRedirects: 0 })
  let body = null
  try { body = await r.json() } catch {}
  return { status: r.status(), code: body?.error?.code ?? null, msg: body?.error?.message ?? null, body, ms: Date.now() - t }
}
export function classify(res) {
  if (res.status === 401) return 'AUTH'
  if (res.status >= 500) return 'ERR'
  if (res.status === 403) return res.code === 'PERMISSION_DENIED' ? 'D' : 'B'
  if ((res.status === 404 || res.status === 405) && res.code === null) return 'N'
  return 'A'
}
export function sameDenial(a, b) {
  const keys = (x) => Object.keys(x.body?.error ?? {}).sort().join(',')
  return a.status === b.status && a.code === b.code && a.msg === b.msg && keys(a) === keys(b)
}
export async function pool(items, n, fn) { const qu = [...items]; await Promise.all(Array.from({ length: n }, async () => { while (qu.length) await fn(qu.shift()) })) }
export const PERSONAS = ['admin', 'uat.admin', 'uat.approver', 'uat.finance', 'uat.account', 'uat.exec', 'uat.mgr.in', 'uat.sup.in',
  'uat.agent.in1', 'uat.agent.in2', 'uat.mgr.out', 'uat.agent.out1', 'uat.co1.mgr', 'uat.co1.sup', 'uat.co2.admin']
export const ID = {
  C1: 'a10492d4-c805-4c7d-9ec4-a63fa730e9ea', C2: '43b69649-b894-4979-b4a3-5feffa67a8fd', C3: '17c96116-0010-4add-ae56-bf9ad946289e',
  C4: 'd4d82f78-7500-4e10-94ae-c703483b7272', C5: '7de5741e-1dfd-4a5b-ad7b-7df4206d5314', C6: 'f6440b98-e061-4ee5-8837-f7771f43277c',
  C7: 'f476e94f-3375-425f-b6a7-0895e93f33a6', C8: '4929bc32-faec-48b0-aa1e-0fe66232c89a',
  TA: '8dc4fa90-cb6e-425f-9778-3a872b687ff2', TB: '5074e06b-0925-4571-a1d0-20defad46e70', TC: 'c89d6982-25f8-4457-aeb6-4c1ab0189c95',
  CO1: 'e27e79bf-2344-4f52-8979-c58be09a9de6', CO2: 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56',
  AS1: '2666a107-4e89-44f9-8212-31232a8c05af', AS5: '5cad8233-fbe1-4ba6-ab92-f886e4434689',
  LOT3: '15db3c66-d183-4a3a-bbb0-2d9decee40af', LOT4: '469803a8-82b7-4d51-8dc7-e07a10e0d004',
  BB1: '50690166-51df-4027-8ec7-1fca0d8424c1', BB2: '202f0d2b-fc5a-4114-94d6-13e56e46284f',
  PIN1: '9df4509f-c201-4dcf-8939-e02e08df748f', PIN2: '7ec92197-6d90-488f-8eba-e249b59a1372', POUT1: 'bf36b3bb-4508-4c3a-984e-9b78eaa9f8ca',
  ADV_IN1: '3bde18d7-1fe8-4e40-846a-af9c38b2c587', U_IN1: '88cb577d-32b4-49ff-96fb-06a2e093d339', U_FIN: '17eae992-b9da-48cb-83e8-b6c9ad1c0e6c',
  R_ADMIN: '4a2b4a02-8b68-485c-bd18-995455219228', R_EXEC: '01b91aa6-da28-4519-9e3f-1676193469cc', R_SUPCO: 'e4779ff8-e699-4962-8db8-397984c95e0e',
  PER: '879302b0-bb29-4bae-9f9a-1e16aba8bb31',
}
