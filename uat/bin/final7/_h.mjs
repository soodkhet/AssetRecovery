// ตัวช่วยด่าน 7 — ตรวจหน้าจอ (ค.ศ./เลขอ้างอิงสเปค/หน้าขาว/5xx/console) · ไม่พิมพ์รหัสผ่าน
import { appendFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
export { openAs, shot, BASE } from '../lib.mjs'
mkdirSync('uat/bin/final7/out', { recursive: true })
export function log(file, ...a) { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync(`uat/bin/final7/out/${file}.log`, s + '\n') }
export function q(sql) {
  return execFileSync('psql', ['-h', 'localhost', '-U', 'assetrecovery', '-d', 'assetrecovery_dev', '-XAt', '-F', '|', '-c', 'set default_transaction_read_only = on', '-c', sql], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'assetrecovery' } }).replace(/^SET\n/, '').trim()
}
const CE = [
  /\b\d{1,2}\/\d{1,2}\/20[0-4]\d\b/g, // 07/10/2026
  /\b20[0-4]\d-\d{2}-\d{2}\b/g,         // ISO
  /(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s*20[0-4]\d\b/g,
  /\b(LOT|DLV|BL|INV|PB|RAV|CRT|WHT|ADJ|CN|DN)-20[0-4]\d\b/g,
]
const SPEC = [/§\s*\d/g, /(?<!\d\s)ไฟล์\s*\d{2}\b(?![,.]\d)/g, /\bDEC-\d{3}\b/g, /\b[UO]\d{2,3}\b(?![\w-])/g, /มติ\s*PO/g, /\bBUG-\d{3}\b/g, /\[\[NEEDS_DECISION/g]
export function scanText(t) {
  const hits = { ce: [], spec: [] }
  for (const r of CE) for (const m of t.matchAll(r)) hits.ce.push(t.slice(Math.max(0, m.index - 25), m.index + m[0].length + 10).replace(/\s+/g, ' '))
  for (const r of SPEC) for (const m of t.matchAll(r)) hits.spec.push(t.slice(Math.max(0, m.index - 25), m.index + m[0].length + 15).replace(/\s+/g, ' '))
  return hits
}
/** ตรวจหน้าปัจจุบัน — คืน {issues[], textLen} */
export async function checkPage(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(400)
  const t = await page.locator('body').innerText().catch(() => '')
  const h = scanText(t)
  const issues = []
  if (t.trim().length < 40) issues.push('WHITE?')
  if (/กำลังโหลด/.test(t) && t.length < 400) issues.push('STUCK_LOADING?')
  if (/Application error|Unhandled Runtime Error|Internal Server Error|This page could not be found/i.test(t)) issues.push('ERRPAGE')
  if (/เกิดข้อผิดพลาด|โหลดข้อมูลไม่สำเร็จ/.test(t)) issues.push('ERRSTATE:' + (t.match(/.{0,40}(เกิดข้อผิดพลาด|โหลดข้อมูลไม่สำเร็จ).{0,60}/)?.[0] ?? '').replace(/\s+/g, ' '))
  if (h.ce.length) issues.push('CE:' + [...new Set(h.ce)].slice(0, 3).join(' ‖ '))
  if (h.spec.length) issues.push('SPEC:' + [...new Set(h.spec)].slice(0, 3).join(' ‖ '))
  if (/undefined|NaN|\[object Object\]|Invalid Date/.test(t)) issues.push('RAW:' + (t.match(/.{0,30}(undefined|NaN|\[object Object\]|Invalid Date).{0,20}/)?.[0] ?? '').replace(/\s+/g, ' '))
  return { issues, textLen: t.length, text: t }
}
export const slug = s => s.replace(/^\//, '').replace(/[/?=&]+/g, '_').replace(/[^\w.-]/g, '').slice(0, 60) || 'root'
