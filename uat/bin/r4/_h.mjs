// ตัวช่วยของ R4a role agent (รันจากรากโปรเจกต์)
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
export { openAs, shot, BASE } from '../lib.mjs'
export { sleep, settle, toasts, trackMutations } from '../r1/_h.mjs'
export { collect, trackApi } from '../r2/_h.mjs'
export { C, U, REF } from '../r3/_h.mjs'
import { BASE } from '../lib.mjs'
import { sleep } from '../r1/_h.mjs'
export const T0 = '2026-10-03 09:49:00+00'
export const F = n => `uat/fixtures/files/${n}`
export const GPS = {
  C1: { latitude: 13.8166, longitude: 100.5612 }, C2: { latitude: 13.7563, longitude: 100.5653 },
  C3: { latitude: 13.6681, longitude: 100.634 }, C4: { latitude: 13.77, longitude: 100.5737 },
  C5: { latitude: 14.064, longitude: 100.646 },
}
export function q(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).replace(/^SET\n/, '').trim() }
const LOG = 'uat/bin/r4/run.log'
export function log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); appendFileSync(LOG, s + '\n') }
const clip = (s, n = 900) => (s.length > n ? s.slice(0, n) + '…' : s)
export async function fmt(r) { let b = ''; try { b = JSON.stringify(await r.json()) } catch { b = (await r.text()).slice(0, 200) } return `${r.status()} ${clip(b)}` }
export async function post(page, path, data) { return fmt(await page.request.post(`${BASE}${path}`, { data })) }
export async function get(page, path) { return fmt(await page.request.get(`${BASE}${path}`)) }
export const mainText = async (page, n = 1500) => clip((await page.locator('main').innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | '), n)
export async function geo(context, key) {
  await context.grantPermissions(['geolocation'], { origin: BASE })
  await context.setGeolocation({ ...GPS[key], accuracy: 15 })
}
/** การ์ดที่มี REF และปุ่มชื่อ btn */
export const card = (page, ref, btn) => page.locator('div', { hasText: ref }).filter({ has: page.getByRole('button', { name: btn, exact: true }) }).last()
/** เลือกไฟล์ให้หมวด title (รูปถ่าย/วิดีโอ/รูปสินค้ายืนยัน) ผ่านปุ่ม 'เลือกไฟล์' */
export async function pick(page, dlg, title, file) {
  const sec = dlg.locator('div', { has: page.locator(`text=${title} (`) }).filter({ has: page.getByRole('button', { name: 'เลือกไฟล์' }) }).last()
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), sec.getByRole('button', { name: 'เลือกไฟล์' }).click()])
  await ch.setFiles(file)
  await sleep(500)
  await dlg.getByText('กำลังทำงาน...').waitFor({ state: 'detached', timeout: 30000 }).catch(() => {})
  await sleep(800)
}
export const SQL = {
  asg: `select c.case_ref,u.username,a.status,a.accepted_at is not null acc,a.scheduled_date,a.schedule_order ord,a.completed_at is not null done,c.status case_status from case_assignments a join cases c on c.id=a.case_id join users u on u.id=a.agent_id where a.status<>'reassigned_away' order by 1`,
  ci: `select c.case_ref,u.username,k.latitude,k.longitude,k.checkin_type,k.address_note,k.checked_in_at from check_ins k join cases c on c.id=k.case_id join users u on u.id=k.created_by order by k.checked_in_at`,
  ev: `select c.case_ref,e.outcome,e.status,cardinality(e.photos) p,cardinality(e.videos) v,cardinality(e.product_photos) pp,e.product_photos,e.submitted_at from case_evidences e join cases c on c.id=e.case_id order by 1,e.submitted_at`,
  dr: `select c.case_ref,d.outcome,d.photos,d.videos,d.product_photos,d.note from close_case_drafts d join cases c on c.id=d.case_id`,
  ex: `select c.case_ref,u.username,x.expense_type,x.gross_satang,x.status,x.expense_date,x.comp_plan_version,x.approval_step_total,x.superseded_by_expense_id is not null sup_link from expenses x left join cases c on c.id=x.case_id join payee_profiles p on p.id=x.payee_id join users u on u.id=p.user_id order by 1,x.created_at,3`,
  as: `select c.case_ref,a.asset_status,a.imei_contract from assets a join cases c on c.id=a.case_id order by 1`,
  audit: `select to_char(a.created_at,'HH24:MI:SS') t,u.username actor,a.actor_role,a.action,a.target_type,a.after_data->'events' ev from audit_logs a left join users u on u.id=a.actor_id where a.created_at > '${T0}' and a.action<>'login' order by a.created_at`,
}
