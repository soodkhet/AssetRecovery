// ตัวช่วยของ R9 v3 role agent (รันจากรากโปรเจกต์) — รอบอ่านอย่างเดียว
import { execFileSync } from 'node:child_process'
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs'
export { openAs, shot, BASE } from '../lib.mjs'
export { sleep } from '../r1/_h.mjs'
import { BASE } from '../lib.mjs'
export const R = 'R9v3'
export const T0 = '2026-10-04 06:15:54+00'
export const DL = 'uat/fixtures/downloads-R9v3'
mkdirSync(DL, { recursive: true })
export function q(sql) { try { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).replace(/^SET\n/, '').trim() } catch (e) { return 'SQLERR ' + String(e.stderr).slice(0, 200) } }
export function q1(sql) { return execFileSync('uat/bin/q.sh', [sql], { encoding: 'utf8' }).split('\n').map(x => x.trim()).filter(Boolean)[3] ?? '' }
const LOG = 'uat/bin/r9v3/run.log'
export function log(...a) { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log(s); appendFileSync(LOG, s + '\n') }
export const FP_SQL = `select (select count(*) from revenues) rev_n, (select count(*) from expenses) exp_n,
  (select count(*) from payout_batches) pb_n, (select count(*) from billing_batches) bb_n, (select count(*) from advances) adv_n,
  (select string_agg(status::text,',' order by created_at) from advances) adv_st,
  (select count(*) from tax_invoices) ti_n, (select count(*) from wht_certificates) wht_n,
  (select count(*) from adjustments) adj_n, (select count(*) from exceptions) exc_n, (select count(*) from export_records) xr_n,
  (select count(*) from accounting_periods) per_n, (select count(*) from jobs) job_n,
  (select count(*) from audit_logs where action not in ('login','logout','export')) audit_n,
  (select count(*) from audit_logs where action='export' and created_at > '${T0}') audit_export`
export const fp = () => q1(FP_SQL)
/** GET JSON ของรายงาน → { status, body } */
export async function getJ(page, path) {
  const r = await page.request.get(`${BASE}${path}`)
  let body; try { body = await r.json() } catch { body = (await r.text()).slice(0, 300) }
  return { status: r.status(), body }
}
export async function postJ(page, path, data) {
  const r = await page.request.post(`${BASE}${path}`, { data })
  const ct = r.headers()['content-type'] ?? ''
  let body; if (ct.includes('json')) { try { body = await r.json() } catch { body = '' } } else body = `<${ct}> ${(await r.body()).length}B cd=${r.headers()['content-disposition'] ?? ''}`
  return { status: r.status(), body }
}
/** สรุป payload รายงาน: kpis / columns / rows / totalRow / cache */
export function summ(p) {
  const d = p?.data ?? p
  if (!d || typeof d !== 'object') return JSON.stringify(p).slice(0, 400)
  const fmtv = v => (v && typeof v === 'object' ? (v.display ?? v.text ?? v.label ?? JSON.stringify(v)) : v)
  const out = []
  out.push(`range=${d.range?.label} cache=${JSON.stringify(d.cache ?? {})}`)
  out[0] = `range=${d.range?.label} cache=fromCache:${d.cache?.fromCache} computedAt:${d.cache?.computedAt} thr:${d.cache?.refreshThrottled} mode:${d.cache?.mode} exp:${d.cache?.expiresAt}`
  for (const k of d.kpis ?? []) out.push(`  KPI ${k.label}: ${k.value}${k.hint ? ' (' + k.hint + ')' : ''} mom=${k.mom ? k.mom.previous + '→' + k.mom.changePct : '-'}`)
  const cols = (d.columns ?? []).map(c => c.key)
  out.push(`  COLS ${(d.columns ?? []).map(c => `${c.key}:${c.header}`).join(' | ')}`)
  for (const r of d.rows ?? []) out.push('  ROW ' + cols.map(c => fmtv(r[c])).join(' | '))
  if (d.totalRow) out.push('  TOT ' + cols.map(c => fmtv(d.totalRow[c])).join(' | '))
  if (d.notes || d.note) out.push('  NOTE ' + JSON.stringify(d.notes ?? d.note))
  return out.join('\n')
}
export function dump(name, obj) { writeFileSync(`uat/bin/r9v3/${name}.json`, JSON.stringify(obj, null, 1)) }
/** คลิกปุ่มส่งออกบนหน้า แล้วเก็บไฟล์ */
export async function exportUI(page, label, prefix) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: label }).click()])
  const name = dl.suggestedFilename()
  const path = `${DL}/${prefix ? prefix + '__' : ''}${name}`
  await dl.saveAs(path)
  return { name, path }
}
export async function btns(page) { return (await page.locator('button').allInnerTexts()).map(s => s.trim()).filter(Boolean).join(' · ') }
export async function clickBtn(page, name) { await page.getByRole('button', { name, exact: true }).first().click(); await new Promise(r => setTimeout(r, 2500)) }
export async function openReport(page, slug, ms = 3500) { await page.goto(`${BASE}/reports/${slug}`); await new Promise(r => setTimeout(r, ms)) }
export async function screenText(page) { return (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 1500) }
