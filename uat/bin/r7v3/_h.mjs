// ตัวช่วยของ R7ab v3 role agent (รันจากรากโปรเจกต์)
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
export { openAs, shot, BASE } from '../lib.mjs'
export { sleep, settle } from '../r1/_h.mjs'
export { waitToast, flat, mainText, dlgText } from '../r5v2/_h.mjs'
import { BASE } from '../lib.mjs'
export const R = 'R7v3'
export const T0 = '2026-10-04 04:43:16+00'
export const ID = {
  IN1: '7c63c709-0dbb-4a25-8b45-fdc29000d431',
  UATL: '50690166-51df-4027-8ec7-1fca0d8424c1', UATC: '202f0d2b-fc5a-4114-94d6-13e56e46284f',
  SL: 'b48b8d1b-2dd1-4aca-a4ec-c5ff45801417', SC: 'f1086d87-de27-496a-8e50-0af79da7cc7f',
  BANK: 'c30800c4-52c6-431a-a357-b073cf077b89', ADV3: '1959af6d-be83-40dd-9f8f-16d537785bbd',
  PERIOD: '879302b0-bb29-4bae-9f9a-1e16aba8bb31',
}
export const CSV = 'uat/fixtures/bank-R7-filled.csv'
export function q(sql) { try { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).replace(/^SET\n/, '').trim() } catch (e) { return 'SQLERR ' + String(e.stderr).slice(0, 200) } }
export function q1(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).split('\n').map(x => x.trim()).filter(Boolean)[3] ?? '' }
const LOG = 'uat/bin/r7v3/run.log'
export function log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); appendFileSync(LOG, s + '\n') }
const clip = (s, n = 900) => (s.length > n ? s.slice(0, n) + '…' : s)
export async function fmt(r) { let b = ''; try { b = JSON.stringify(await r.json()) } catch { b = (await r.text()).slice(0, 200) } return `${r.status()} ${clip(b)}` }
export async function api(page, method, path, data) { return fmt(await page.request.fetch(`${BASE}${path}`, { method, data })) }
export function guard2xx(label, res) { if (/^2\d\d /.test(res)) { log(`!!! STOP probe ${label} ได้ ${res}`); process.exit(9) } }
export const auditSince = t => `select to_char(a.created_at,'HH24:MI:SS') t,a.actor_role,a.action,a.target_type,left(a.target_id::text,8) tid,left(a.reason,140) reason from audit_logs a where a.created_at > '${t}' and a.action not in ('login','logout') order by a.created_at`
export const notiSince = t => `select to_char(n.created_at,'HH24:MI:SS') t,u.username,n.event_code,n.title,left(n.body,100) body,n.link_path from notifications n join users u on u.id=n.user_id where n.created_at > '${t}' order by n.created_at`
