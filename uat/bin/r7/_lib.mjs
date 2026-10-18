// ตัวช่วยรอบ mytester 7 (รันจาก repo root) — DB อ่านอย่างเดียว · ตั้ง R7_SP=<scratchpad>/mytester7 และ R7_PHASE=<S8|S1|…>
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
export { openAs, BASE } from '../lib.mjs'
export { raceClick, openTabs, lockPersona } from './race.mjs'
export const SP = process.env.R7_SP ?? (() => { throw new Error('ตั้ง R7_SP') })()
export const PHASE = process.env.R7_PHASE ?? 'misc'
export const A = `${SP}/${PHASE}`
mkdirSync(A, { recursive: true })
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export function log(...a) { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync(`${A}/run.log`, s + '\n') }
export function q(sql) {
  let out = ''
  try { out = execFileSync('uat/bin/staging-prep.sh', ['q', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { return [{ err: String(e.stderr || e.message).slice(0, 200) }] }
  return out.split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l))
}
export async function settle(page, ms = 400) { await page.waitForLoadState('networkidle').catch(() => {}); await sleep(ms) }
export async function shot(page, name, full = false) { const p = `${A}/${name}.png`; await page.screenshot({ path: p, fullPage: full }); return p }
export async function toasts(page, ms = 1500) {
  await sleep(ms)
  const a = await page.locator('[role=status],[role=alert],[data-sonner-toast]').allInnerTexts().catch(() => [])
  return [...new Set(a.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean))]
}
export function track(page) {
  const res = []
  page.on('response', async r => {
    const m = r.request().method()
    if (m !== 'GET' && r.url().includes('/api/')) {
      let b = ''; try { b = (await r.text()).slice(0, 400) } catch {}
      res.push(`${r.status()} ${m} ${new URL(r.url()).pathname} ${b}`)
    }
  })
  return res
}
export async function fieldsOf(scope) {
  return scope.locator('input,select,textarea').evaluateAll(els => els.filter(e => e.type !== 'hidden').map(e => {
    const l = (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)?.innerText) || e.closest('label')?.innerText || e.getAttribute('aria-label') || e.placeholder || ''
    const v = e.type === 'checkbox' || e.type === 'radio' ? (e.checked ? '[x]' : '[ ]') : (e.tagName === 'SELECT' ? `=${e.options[e.selectedIndex]?.text}` : `=${e.value}`)
    return `${e.tagName.toLowerCase()}#${e.id}[${e.type}${e.name ? ' n=' + e.name : ''}] «${l.replace(/\s+/g, ' ').trim().slice(0, 70)}» ${v.slice(0, 40)}${e.disabled ? ' (disabled)' : ''}`
  }))
}
export async function buttons(scope) { return (await scope.locator('button:visible').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean) }
export const txt = async (loc, n = 3000) => ((await loc.innerText().catch(() => '')).replace(/\s*\n+\s*/g, ' | ')).slice(0, n)
const STEPS = `${A}/steps.json`
export function step(o) {
  const arr = existsSync(STEPS) ? JSON.parse(readFileSync(STEPS, 'utf8')) : []
  const i = arr.findIndex(x => x.step === o.step)
  const rec = { phase: PHASE, persona: 'superadmin', evidence: [], ...o }
  if (i >= 0) arr[i] = rec; else arr.push(rec)
  writeFileSync(STEPS, JSON.stringify(arr, null, 2))
  log(`[STEP] ${o.step} ${o.status} :: ${String(o.actual).slice(0, 300)}`)
}
export async function errText(scope) { return (await scope.locator('.text-red-600,.text-red-700,[role=alert],[aria-invalid=true] ~ p').allInnerTexts().catch(() => [])).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean) }
