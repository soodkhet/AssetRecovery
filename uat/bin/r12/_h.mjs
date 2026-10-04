// ตัวช่วย R12 — ใช้ helper ของ R10 v3 (API ต่อ persona) + เขียน log ของ R12
export { BASE, rnd, q, qa, login, sess, call, sameDenial, ID } from '../r10v3/_h.mjs'
import { appendFileSync } from 'node:fs'
export function log(...a) { const s = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log(s); appendFileSync('uat/bin/r12/run.log', s + '\n') }
export const INV1 = 'b95fe226-4642-465a-97c7-9a9a85fd5ad9', INV2 = 'f802b0cc-5780-4242-a9e7-c9212ea532ea'
export const AS2 = '98a74df2-dc68-43b9-9877-3d5ea2186c59'
