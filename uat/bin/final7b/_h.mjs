// ตัวช่วยด่าน 7 รอบทวน — reuse final7/_h.mjs แต่ log ลง final7b/out · ภาพ uat/shots/final2 · ไม่พิมพ์รหัสผ่าน
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { shot as shot0 } from '../lib.mjs'
export { openAs, BASE } from '../lib.mjs'
export { q, scanText, checkPage, slug } from '../final7/_h.mjs'
export { collect, trackApi } from '../r2/_h.mjs'
mkdirSync('uat/bin/final7b/out/text', { recursive: true })
export function log(file, ...a) { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync(`uat/bin/final7b/out/${file}.log`, s + '\n') }
export const shot = (page, name, opts) => shot0(page, 'final2', name, opts)
export const text = (file, t) => writeFileSync(`uat/bin/final7b/out/text/${file}.txt`, t)
export const U = 'http://localhost:3000'
export const clean = s => (s ?? '').replace(/\s+/g, ' ').trim()
