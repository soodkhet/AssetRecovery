// ตัวช่วย R13a role agent (รันจากรากโปรเจกต์) — ห้าม log รหัสผ่าน
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
export { openAs, shot, BASE, credentials } from '../lib.mjs'
export { sleep, settle, toasts, trackMutations } from '../r1/_h.mjs'
export { login, sess, call, ID } from '../r10v3/_h.mjs'
import { BASE } from '../lib.mjs'
mkdirSync('uat/bin/r13', { recursive: true })
export const R = 'R13'
export function q(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).replace(/^SET\n/, '').trim() }
export function qa(sql) {
  return execFileSync('psql', ['-h', 'localhost', '-U', 'assetrecovery', '-d', 'assetrecovery_dev', '-XAt', '-F', '|', '-c', 'set default_transaction_read_only = on', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'assetrecovery' } }).replace(/^SET\n/, '').trim()
}
export function log(...a) { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync('uat/bin/r13/run.log', s + '\n') }
const clip = (s, n = 900) => (s.length > n ? s.slice(0, n) + '…' : s)
export async function fmt(r) { let b = ''; try { b = JSON.stringify(await r.json()) } catch { b = (await r.text()).slice(0, 200) } return `${r.status()} ${clip(b)}` }
export const post = async (page, path, data) => fmt(await page.request.post(`${BASE}${path}`, { data, failOnStatusCode: false }))
export const get = async (page, path) => fmt(await page.request.get(`${BASE}${path}`, { failOnStatusCode: false }))
export const mainText = async (page, n = 1500) => clip((await page.locator('main').innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | '), n)
export const F = n => `uat/fixtures/files/${n}`
export const T0 = '2026-10-05 16:10:00+00'
