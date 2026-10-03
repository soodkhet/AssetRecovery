// ตัวช่วยของ R6a v3 role agent (รันจากรากโปรเจกต์)
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
export { openAs, shot, BASE } from '../lib.mjs'
export { sleep, settle } from '../r1/_h.mjs'
export { waitToast, flat, mainText, dlgText } from '../r5v2/_h.mjs'
import { BASE } from '../lib.mjs'
export const R = 'R6v3'
export const T0 = '2026-10-03 18:57:52+00'
export const X = {
  hotel: '5e527e99-5d0b-4e21-8dbd-db50e919ab6c',
  C1f: '19418b58-aa96-49d6-960c-5c9bb4c282f5', C1a: '276fe274-4427-4570-9fe7-b21317c4f613', C1c: '0a5ae538-3229-4888-b840-b048178c000f',
  C2f: '985a4f35-38cf-4221-984e-e0c6e350dedd', C2a: 'a83f83a0-1dca-43d1-bc1b-cb3bc389d28a', C2c: '7a80d26b-35f2-4fa3-bcfa-477a77e94220',
  C4f: 'b6ea275a-6f4a-4e4b-8bd5-93deaf505b42', C4a: 'c7b25cb3-f97b-4b3d-b0c6-8e9485f93587', C4c: '2b46fa31-1e42-414d-9a65-ecb17b44695f',
  C3f: '662fb17a-f4c4-4ed8-b194-0b148655e75e', C3a: '145b4f54-51d4-490c-8a7e-fbad195834b0', C3n: '0fa5486a-a6b3-45ea-938a-427f57d7170a',
  C5f: '7938f17c-2628-46f7-bed7-c0e1398e3bc6', C5c: '3f45089d-c432-45fb-875b-182c4bda8f98',
}
export const ADV = { A1: '3bde18d7-1fe8-4e40-846a-af9c38b2c587', A2: 'c9c2df60-262e-43f7-a0a7-bec2336b71be', A3: '1959af6d-be83-40dd-9f8f-16d537785bbd', A4: 'e49ca2eb-288e-48e2-8579-724178946b8a' }
export const TL = { f: 'ค่าน้ำมัน', a: 'เบี้ยเลี้ยง', c: 'คอมมิชชั่น', n: 'เบี้ยเสี่ยง', h: 'ค่าที่พัก' }
export function q(sql) { try { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).replace(/^SET\n/, '').trim() } catch (e) { return 'SQLERR ' + String(e.stderr).slice(0, 200) } }
const LOG = 'uat/bin/r6v3/run.log'
export function log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); appendFileSync(LOG, s + '\n') }
const clip = (s, n = 900) => (s.length > n ? s.slice(0, n) + '…' : s)
export async function fmt(r) { let b = ''; try { b = JSON.stringify(await r.json()) } catch { b = (await r.text()).slice(0, 200) } return `${r.status()} ${clip(b)}` }
export async function api(page, method, path, data) { return fmt(await page.request.fetch(`${BASE}${path}`, { method, data })) }
export function guard2xx(label, res) { if (/^2\d\d /.test(res)) { log(`!!! STOP probe ${label} ได้ ${res}`); process.exit(9) } }
export const SQL = {
  queue: `select coalesce(c.case_ref,'—') ref, e.expense_type t, e.field_day_settlement_id is not null daily, e.status, e.gross_satang g, e.approval_step_current cur, e.approval_step_total tot, m.condition mx, e.manager_approved_by is not null m, e.finance_approved_by is not null f, e.executive_approved_by is not null x, jsonb_array_length(e.approval_history) h, to_char(e.updated_at,'HH24:MI:SS') upd from expenses e left join cases c on c.id=e.case_id left join approval_matrices m on m.id=e.approval_matrix_id where e.status<>'superseded' order by 1,2`,
  rev: `select c.case_ref, r.gross_satang, r.vat_satang, r.total_satang, r.vat_rate_pct_used, r.fee_model_snapshot, r.vat_mode_snapshot, r.status, r.revenue_date, u.username created_by, r.tracking_round from revenues r join cases c on c.id=r.case_id join users u on u.id=r.created_by order by 1`,
  audit: `select to_char(a.created_at,'HH24:MI:SS') t,a.actor_role,a.action,a.target_type,left(a.target_id::text,8) tid,a.reason from audit_logs a where a.created_at > '${T0}' and a.action not in ('login','logout') order by a.created_at`,
  auditN: `select a.target_type,a.action,count(*) from audit_logs a where a.created_at > '${T0}' and a.action not in ('login','logout') group by 1,2 order by 1,2`,
  noti: `select to_char(n.created_at,'HH24:MI:SS') t,u.username,n.event_code,n.title,left(n.body,90) body,n.link_path from notifications n join users u on u.id=n.user_id where n.created_at > '${T0}' order by n.created_at`,
  adv: `select left(id::text,8) id,status,requested_satang,approved_satang,(select username from users where id=approved_by) appr_by,rejection_reason,due_clear_date from advances order by created_at`,
}
/** หาแถวในแท็บค่าตอบแทน: ref = case_ref หรือ 'ไม่ผูกเคส' · type = label ในคอลัมน์ประเภท */
export function row(page, ref, type) {
  return page.locator('tbody tr').filter({ hasText: ref }).filter({ has: page.locator('td:nth-child(2)', { hasText: type }) })
}
/** กด 'อนุมัติขั้น n' ผ่าน UI แล้วคืน [response, toast] */
export async function uiApprove(page, ref, type, step) {
  const r = row(page, ref, type)
  const n = await r.count()
  if (n !== 1) return [`ROW COUNT ${n}`, []]
  const btn = r.getByRole('button', { name: `อนุมัติขั้น ${step}` })
  if (!(await btn.count())) return [`NO BUTTON อนุมัติขั้น ${step} (row: ${clip((await r.innerText()).replace(/\s+/g, ' '), 300)})`, []]
  const [resp] = await Promise.all([
    page.waitForResponse(x => x.url().includes('/api/compensation/') && x.url().endsWith('/approve'), { timeout: 20000 }),
    btn.click(),
  ])
  const st = `${resp.status()} ${clip(await resp.text(), 260)}`
  const { waitToast } = await import('../r5v2/_h.mjs')
  const t = await waitToast(page, 6000)
  return [st, t]
}
