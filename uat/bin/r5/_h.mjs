// ตัวช่วยของ R5 role agent (รันจากรากโปรเจกต์)
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
export { openAs, shot, BASE } from '../lib.mjs'
export { sleep, settle, toasts, trackMutations } from '../r1/_h.mjs'
import { BASE } from '../lib.mjs'
export const R = 'R5'
export const T0 = '2026-10-03 13:10:00+00'
export const F = n => `uat/fixtures/files/${n}`
export const A = { C1: 'c7d95a2c-d7be-4f94-b3f0-d2369b61772f', C2: '09ceddf8-3e90-4979-bdbc-6ae7fd3642f1', C4: 'aed32462-4a4a-4429-bd48-fe636161b4ca', C5: 'e23d8891-cc73-4a06-b8bb-4a5cf9bc3582' }
export const CASE = { C1: 'a10492d4-c805-4c7d-9ec4-a63fa730e9ea', C2: '43b69649-b894-4979-b4a3-5feffa67a8fd', C4: 'd4d82f78-7500-4e10-94ae-c703483b7272', C5: '7de5741e-1dfd-4a5b-ad7b-7df4206d5314' }
export const CO1 = 'e27e79bf-2344-4f52-8979-c58be09a9de6', CO2 = 'dd5c5017-775f-4e5f-8d5d-4735cc88ad56'
export const RND = '00000000-0000-4000-8000-000000000000'
export const LOT1 = 'dc03dc55-7511-4e52-adc7-59760971d5e0'
export const LOT2 = '2a5843ba-dbd1-4f75-b438-4c6c83b726fc'
export function q(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).replace(/^SET\n/, '').trim() }
const LOG = 'uat/bin/r5/run.log'
export function log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); appendFileSync(LOG, s + '\n') }
const clip = (s, n = 900) => (s.length > n ? s.slice(0, n) + '…' : s)
export async function fmt(r) { let b = ''; try { b = JSON.stringify(await r.json()) } catch { b = (await r.text()).slice(0, 200) } return `${r.status()} ${clip(b)}` }
export async function api(page, method, path, data) { return fmt(await page.request.fetch(`${BASE}${path}`, { method, data })) }
export const flat = s => s.replace(/\s*\n+\s*/g, ' | ')
export const mainText = async (page, n = 1500) => clip(flat(await page.locator('main').innerText().catch(() => '')), n)
export const dlgText = async (page, n = 1500) => { const d = page.locator('[role="dialog"]').last(); return (await d.count()) ? clip(flat(await d.innerText()), n) : '(no dialog)' }
/** ยืนยันว่า probe ไม่ได้ 2xx — ถ้าได้ ให้หยุดทันที */
export function guard2xx(label, res) { if (/^2\d\d /.test(res)) { log(`!!! STOP probe ${label} ได้ ${res}`); process.exit(9) } }
export const SQL = {
  asset: `select a.case_ref,a.asset_status,a.imei_actual,a.condition,a.condition_note,cardinality(a.photos) photos,(select count(*) from jsonb_object_keys(a.photo_hashes)) hashed,to_char(a.received_at,'HH24:MI:SS') rcv,a.reject_reason,to_char(a.rejected_at,'HH24:MI:SS') rej_at,a.rejected_by is not null rej_by,l.lot_number from assets a left join handover_lots l on l.id=a.lot_id order by 1`,
  hash: `select a.case_ref,regexp_replace(k.key,'^.*/','') f,k.value->>'sha256' sha from assets a, jsonb_each(a.photo_hashes) k order by 1,2`,
  lot: `select lot_number,doc_ref,type,status,company_id=E'${CO1}' co1,scheduled_at,contact_person,delivery_addr,tracking_no,delivered_at,confirmed_at,confirmed_by is not null cby,signed_doc_url,signed_doc_hash,delivery_proof_url,delivery_proof_hash,id from handover_lots order by created_at`,
  seq: `select (select current_seq from document_number_series where doc_type='handover_lot') lot_seq,(select current_seq from document_number_series where doc_type='delivery_note') dlv_seq`,
  ev: `select c.case_ref,e.outcome,e.status,e.reviewed_by is not null rby,to_char(e.reviewed_at,'HH24:MI:SS') rat,e.submitted_at from case_evidences e join cases c on c.id=e.case_id order by 1,e.submitted_at`,
  ex: `select c.case_ref,x.expense_type,x.gross_satang,x.status,x.approval_step_current from expenses x left join cases c on c.id=x.case_id order by 1 nulls last,2,4`,
  rev: `select count(*) revenues from revenues`,
  audit: `select to_char(a.created_at,'HH24:MI:SS') t,a.actor_role,a.action,a.target_type,a.target_id,a.reason,a.after_data->'events' ev from audit_logs a where a.created_at > '${T0}' and a.action not in ('login','logout') order by a.created_at`,
  noti: `select to_char(n.created_at,'HH24:MI:SS') t,u.username,n.event_code,n.title,n.body,n.link_path from notifications n join users u on u.id=n.user_id where n.created_at > '${T0}' order by n.created_at`,
}
/** รอ toast ใน viewport มุมขวาล่าง แล้วคืน "tone: title / desc" */
export async function waitToast(page, ms = 15000) {
  const loc = page.locator('div.fixed.right-4.bottom-4 [role="status"]')
  try { await loc.first().waitFor({ timeout: ms }) } catch { return ['(no toast)'] }
  await new Promise(r => setTimeout(r, 300))
  return loc.evaluateAll(els => els.map(e => {
    const c = e.className; const tone = c.includes('emerald') ? 'success' : c.includes('red-') ? 'error' : c.includes('orange') ? 'warning' : 'info'
    return `${tone}: ${e.innerText.replace(/\s*\n+\s*/g, ' / ')}`
  }))
}
