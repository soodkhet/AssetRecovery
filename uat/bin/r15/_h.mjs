// ตัวช่วย R15a role agent (รันจากรากโปรเจกต์) — ห้าม log รหัสผ่าน
import { appendFileSync, mkdirSync } from 'node:fs'
export { openAs, shot, BASE, credentials } from '../lib.mjs'
export { sleep, settle, toasts, trackMutations, fields } from '../r1/_h.mjs'
export { login, sess, call } from '../r10v3/_h.mjs'
export { q, qa, fmt, post, get, mainText } from '../r14/_h.mjs'
mkdirSync('uat/fixtures/downloads-R15', { recursive: true })
export const R = 'R15'
export const DL = 'uat/fixtures/downloads-R15'
export function log(...a) { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync('uat/bin/r15/run.log', s + '\n') }
export const yearCE = t => (t.match(/\b20[0-9]{2}\b/g) ?? []).filter(y => +y >= 2020 && +y <= 2030)
