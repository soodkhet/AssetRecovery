// ตัวช่วยของ R3 role agent (รันจากรากโปรเจกต์)
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
export { openAs, shot, BASE } from '../lib.mjs'
export { sleep, settle } from '../r1/_h.mjs'
export { collect, trackApi, rowText } from '../r2/_h.mjs'
import { BASE } from '../lib.mjs'

export const TEAM_A = '8dc4fa90-cb6e-425f-9778-3a872b687ff2', TEAM_B = '5074e06b-0925-4571-a1d0-20defad46e70', TEAM_C = 'c89d6982-25f8-4457-aeb6-4c1ab0189c95'
export const C = {
  C1: 'a10492d4-c805-4c7d-9ec4-a63fa730e9ea', C2: '43b69649-b894-4979-b4a3-5feffa67a8fd', C3: '17c96116-0010-4add-ae56-bf9ad946289e',
  C4: 'd4d82f78-7500-4e10-94ae-c703483b7272', C5: '7de5741e-1dfd-4a5b-ad7b-7df4206d5314', C6: 'f6440b98-e061-4ee5-8837-f7771f43277c',
  C7: 'f476e94f-3375-425f-b6a7-0895e93f33a6', C8: '4929bc32-faec-48b0-aa1e-0fe66232c89a',
}
export const U = {
  in1: '88cb577d-32b4-49ff-96fb-06a2e093d339', in2: '0e2d5aaa-f3d4-487a-a4bc-f7779745fb1e', out1: 'f4a2cb38-6896-4b1b-800b-192487ad5748',
  sup: 'e1474497-abaa-437e-a12b-48ea508279dc', mgrIn: '673e5043-f3c2-4938-8491-d588896431a2', mgrOut: '2f500911-0c71-4add-afdd-85d899399dc4',
  admin: 'a880581e-0281-4c90-95ec-2e08354aca90',
}
export const REF = { C1: 'UAT-CO1-001', C2: 'UAT-CO1-002', C3: 'UAT-CO2-003', C4: 'UAT-CO1-004', C5: 'UAT-CO2-005', C6: 'UAT-CO1-006', C7: 'UAT-CO2-007', C8: 'UAT-CO1-008' }
export const T0 = '2026-10-03 08:36:00+00'

export function q(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).replace(/^SET\n/, '').trim() }
const LOG = 'uat/bin/r3/run.log'
export function log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); appendFileSync(LOG, s + '\n') }

const clip = (s, n = 900) => (s.length > n ? s.slice(0, n) + '…' : s)
async function fmt(r) { let b = ''; try { b = JSON.stringify(await r.json()) } catch { b = (await r.text()).slice(0, 200) } return `${r.status()} ${clip(b)}` }
export async function post(page, path, data) { return fmt(await page.request.post(`${BASE}${path}`, { data })) }
export async function get(page, path) { return fmt(await page.request.get(`${BASE}${path}`)) }
export const mainText = async (page, n = 1500) => clip((await page.locator('main').innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | '), n)

export const SQL = {
  asg: `select c.case_ref,u.username agent,a.status,a.tracking_round tr,a.accepted_at is not null acc,a.reassigned_from is not null re,a.reassign_reason,to_char(a.created_at,'HH24:MI:SS') created,cb.username by_user from case_assignments a join cases c on c.id=a.case_id join users u on u.id=a.agent_id left join users cb on cb.id=a.created_by order by c.case_ref,a.created_at`,
  pr: `select c.case_ref,f.username from_a,n.username new_a,p.status,p.requested_at,p.expires_at,p.expires_at-p.requested_at dur,p.resolved_at,p.resolved_by,p.reason from pending_reassignments p join cases c on c.id=p.case_id join users f on f.id=p.from_agent_id join users n on n.id=p.new_agent_id`,
  hist: `select c.case_ref,f.username from_a,t.username to_a,r.username by_user,h.resolution,h.was_accepted_before_reassign wab,h.reason,h.resolved_at from reassignment_history h join cases c on c.id=h.case_id join users f on f.id=h.from_agent_id join users t on t.id=h.to_agent_id join users r on r.id=h.reassigned_by order by h.created_at`,
  audit: `select to_char(a.created_at,'HH24:MI:SS') t,u.username actor,a.actor_role,a.action,a.target_type,left(a.reason,80) reason,a.after_data->'events' ev from audit_logs a left join users u on u.id=a.actor_id where a.target_type in ('case_assignments','pending_reassignments','assignment_policy_settings','jobs') and a.created_at > '${T0}' order by a.created_at`,
  noti: `select to_char(n.created_at,'HH24:MI:SS') t,u.username,n.event_code,n.title,left(n.body,140) body,n.link_path from notifications n join users u on u.id=n.user_id where n.created_at > '${T0}' order by n.created_at`,
  job: `select id,status,result,error_message,to_char(created_at,'HH24:MI:SS') c,to_char(completed_at,'HH24:MI:SS') d from jobs where job_type='reassign_timeout' order by created_at`,
  pol: `select reassign_timeout_hours h,supervisor_can_assign_system sys,supervisor_can_assign_inhouse inh,supervisor_can_assign_outsource outs,accept_deadline_hours adl,updated_at from assignment_policy_settings`,
  active: id => `select count(*) from case_assignments where case_id='${id}' and status in ('pending_accept','accepted_unscheduled','scheduled','needs_revision')`,
}
