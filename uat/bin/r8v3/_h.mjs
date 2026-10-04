// ตัวช่วยของ R8 v3 role agent (รันจากรากโปรเจกต์)
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
export { openAs, shot, BASE } from '../lib.mjs'
export { sleep, settle } from '../r1/_h.mjs'
export { waitToast, flat, mainText, dlgText } from '../r5v2/_h.mjs'
import { BASE } from '../lib.mjs'
export const R = 'R8v3'
export const T0 = '2026-10-04 05:51:54+00'
export const ID = {
  PERIOD: '879302b0-bb29-4bae-9f9a-1e16aba8bb31',
  C1REV: 'ebc5ad7c-6fa4-446f-a130-a374845b6a92',
  OUT2: '1353dcad-84a4-4480-8ac2-fb0b9159173a',
  UATL: '50690166-51df-4027-8ec7-1fca0d8424c1', CO1: 'e27e79bf-2344-4f52-8979-c58be09a9de6',
  C1EXP: '0a5ae538-3229-4888-b840-b048178c000f', ADV3: '1959af6d-be83-40dd-9f8f-16d537785bbd',
  BANK: 'c30800c4-52c6-431a-a357-b073cf077b89',
  INV1: 'b95fe226-4642-465a-97c7-9a9a85fd5ad9', INV2: 'f802b0cc-5780-4242-a9e7-c9212ea532ea',
  WHT016: '0f1a77ad-f236-4579-8d03-1ba4944cb3c1', ER: '01ebcaf3-1c56-4e3e-9568-479d6614aa4a',
}
export const D = '2026-10-04'
export function q(sql) { try { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).replace(/^SET\n/, '').trim() } catch (e) { return 'SQLERR ' + String(e.stderr).slice(0, 200) } }
export function q1(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).split('\n').map(x => x.trim()).filter(Boolean)[3] ?? '' }
const LOG = 'uat/bin/r8v3/run.log'
export function log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); appendFileSync(LOG, s + '\n') }
const clip = (s, n = 700) => (s.length > n ? s.slice(0, n) + '…' : s)
export async function fmt(r) { let b = ''; try { b = JSON.stringify(await r.json()) } catch { b = (await r.text()).slice(0, 200) } return `${r.status()} ${clip(b)}` }
export async function api(page, method, path, data) { return fmt(await page.request.fetch(`${BASE}${path}`, { method, data })) }
export function guard2xx(label, res) { if (/^2\d\d /.test(res)) { log(`!!! STOP probe ${label} ได้ ${res}`); process.exit(9) } }
export const FP_SQL = `select (select count(*) from advances) adv_n, (select string_agg(status::text,',' order by created_at) from advances) adv_st,
  (select count(*) from expenses) exp_n, (select count(*) from payout_batches) pb_n, (select count(*) from billing_batches) bb_n,
  (select string_agg(status::text,',' order by invoice_number) from tax_invoices) ti_st,
  (select string_agg(status::text,',' order by certificate_number) from wht_certificates) wht_st,
  (select count(*) from bank_transactions) bt_n, (select count(*) from expense_records where cost_center_id is not null) er_cc,
  (select count(*) from adjustments) adj_n, (select count(*) from accounting_periods) per_n,
  (select count(*) from exceptions) exc_n, (select count(*) from export_records) exp_rec,
  (select count(*) from audit_logs where action not in ('login','logout')) audit_n`
export const fp = () => q1(FP_SQL)
export const auditSince = t => `select to_char(a.created_at,'HH24:MI:SS') t,a.actor_role,a.action,a.target_type,left(a.target_id::text,8) tid,left(a.reason,120) reason from audit_logs a where a.created_at > '${t}' and a.action not in ('login','logout') order by a.created_at`
export const notiSince = t => `select to_char(n.created_at,'HH24:MI:SS') t,u.username,n.event_code,n.title,left(n.body,100) body from notifications n join users u on u.id=n.user_id where n.created_at > '${t}' order by n.created_at`
