// ตัวช่วย R15c role agent (รันจากรากโปรเจกต์) — ห้าม log รหัสผ่าน
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
export { openAs, shot, BASE, credentials } from '../lib.mjs'
export { sleep, settle, toasts, trackMutations } from '../r1/_h.mjs'
import { BASE } from '../lib.mjs'
mkdirSync('uat/fixtures/downloads-R15c', { recursive: true })
export const R = 'R15'
export const DL = 'uat/fixtures/downloads-R15c'
export function q(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).replace(/^SET\n/, '').trim() }
export function qa(sql) {
  return execFileSync('psql', ['-h', 'localhost', '-U', 'assetrecovery', '-d', 'assetrecovery_dev', '-XAt', '-F', '|', '-c', 'set default_transaction_read_only = on', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'assetrecovery' } }).replace(/^SET\n/, '').trim()
}
export function log(...a) { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync('uat/bin/r15c/run.log', s + '\n') }
const clip = (s, n = 900) => (s.length > n ? s.slice(0, n) + '…' : s)
export async function fmt(r, n = 900) { let b = ''; try { b = JSON.stringify(await r.json()) } catch { b = (await r.text()).slice(0, 200) } return `${r.status()} ${clip(b, n)}` }
export const post = async (page, path, data, n) => fmt(await page.request.post(`${BASE}${path}`, { data, failOnStatusCode: false }), n)
export const patch = async (page, path, data, n) => fmt(await page.request.patch(`${BASE}${path}`, { data, failOnStatusCode: false }), n)
export const get = async (page, path, n) => fmt(await page.request.get(`${BASE}${path}`, { failOnStatusCode: false }), n)
export const mainText = async (page, n = 1500) => clip((await page.locator('main').innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | '), n)
export const IN1 = '88cb577d-32b4-49ff-96fb-06a2e093d339'
export const P_IN1 = '9df4509f-c201-4dcf-8939-e02e08df748f', P_IN2 = '7ec92197-6d90-488f-8eba-e249b59a1372', P_OUT1 = 'bf36b3bb-4508-4c3a-984e-9b78eaa9f8ca'
