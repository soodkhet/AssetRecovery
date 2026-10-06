// ตัวช่วย R14a role agent (รันจากรากโปรเจกต์) — ห้าม log รหัสผ่าน
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
export { openAs, shot, BASE, credentials } from '../lib.mjs'
export { sleep, settle, toasts, trackMutations } from '../r1/_h.mjs'
export { login, sess, call } from '../r10v3/_h.mjs'
export { pick } from '../r4v3/_h.mjs'
import { BASE } from '../lib.mjs'
mkdirSync('uat/bin/r14', { recursive: true })
mkdirSync('uat/fixtures/downloads-R14', { recursive: true })
export const R = 'R14'
export const DL = 'uat/fixtures/downloads-R14'
export function q(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).replace(/^SET\n/, '').trim() }
export function qa(sql) {
  return execFileSync('psql', ['-h', 'localhost', '-U', 'assetrecovery', '-d', 'assetrecovery_dev', '-XAt', '-F', '|', '-c', 'set default_transaction_read_only = on', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'assetrecovery' } }).replace(/^SET\n/, '').trim()
}
export function log(...a) { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync('uat/bin/r14/run.log', s + '\n') }
const clip = (s, n = 900) => (s.length > n ? s.slice(0, n) + '…' : s)
export async function fmt(r) { let b = ''; try { b = JSON.stringify(await r.json()) } catch { b = (await r.text()).slice(0, 200) } return `${r.status()} ${clip(b)}` }
export const post = async (page, path, data) => fmt(await page.request.post(`${BASE}${path}`, { data, failOnStatusCode: false }))
export const get = async (page, path) => fmt(await page.request.get(`${BASE}${path}`, { failOnStatusCode: false }))
export const mainText = async (page, n = 1500) => clip((await page.locator('main').innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | '), n)
export const F = n => `uat/fixtures/files/${n}`
export const T0 = '2026-10-06 03:45:00+00'
export const CO1 = 'e27e79bf-2344-4f52-8979-c58be09a9de6', CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
export const C006 = 'f6440b98-e061-4ee5-8837-f7771f43277c'
export const PERIOD = '879302b0-bb29-4bae-9f9a-1e16aba8bb31'
export const caseId = ref => qa(`select id from cases where case_ref='${ref}'`)
