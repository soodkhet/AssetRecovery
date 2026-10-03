// ตัวช่วยของ R1 role agent (รันจากรากโปรเจกต์)
import { readFileSync } from 'node:fs'
export { openAs, shot, BASE } from '../lib.mjs'
export const P = JSON.parse(readFileSync('uat/personas.json', 'utf8'))
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const log = (...a) => console.log(...a)

/** อ่าน toast ทั้งหมดที่โผล่ (รอสูงสุด ms) */
export async function toasts(page, ms = 1800) {
  // รอให้ toast ใหม่โผล่ แล้วคืนทุกข้อความที่เห็น (toast เก่าอาจยังค้างอยู่ — ดูตัวท้าย)
  await sleep(ms)
  const out = await page.getByRole('status').allInnerTexts().catch(() => [])
  const alerts = await page.getByRole('alert').allInnerTexts().catch(() => [])
  return [...out, ...alerts].map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
}
/** inline error ใน dialog */
export async function inlineErrors(scope) {
  return (await scope.locator('.text-red-600').allInnerTexts()).map(s => s.trim()).filter(Boolean)
}
/** รายการช่องใน dialog: id type label */
export async function fields(dlg) {
  return (await dlg.locator('input,select,textarea').evaluateAll(els => els.map(e => {
    const l = e.id ? document.querySelector(`label[for="${e.id}"]`)?.innerText.trim() : (e.closest('label')?.innerText.trim() ?? e.getAttribute('aria-label'))
    return `#${e.id} ${e.type} «${(l ?? '').replace(/\s+/g, ' ').slice(0, 60)}»`
  }))).join('\n  ')
}
/** นับคำขอ non-GET ไปยัง /api */
export function trackMutations(page) {
  const reqs = []
  page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/api/')) reqs.push(`${r.method()} ${new URL(r.url()).pathname}`) })
  const res = []
  page.on('response', async r => { if (r.request().method() !== 'GET' && r.url().includes('/api/')) res.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`) })
  return { reqs, res }
}
export async function settle(page) { await page.waitForLoadState('networkidle').catch(() => {}); await sleep(300) }
