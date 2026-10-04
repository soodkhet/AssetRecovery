import { writeFileSync } from 'node:fs'
import { PERSONAS, sess, call, classify, log, rnd } from './_h.mjs'
import { E } from './endpoints.mjs'
const only = process.argv[2]
const ctx = {}
for (const u of PERSONAS) ctx[u] = await sess(u)   // O38 storageState จาก R10.02
const rows = []
await Promise.all(PERSONAS.map(async (u, i) => {
  for (const [id, method, path, grid, opt = {}] of E) {
    if (only && !id.startsWith(only)) continue
    const exp = grid.replaceAll('|', '')[i]
    if (opt.denyOnly && exp !== 'D') continue
    const p = path.replaceAll('{R}', () => rnd())
    const res = await call(ctx[u], method, p, method === 'GET' ? undefined : (opt.body ?? {}))
    const got = classify(res)
    rows.push({ id, u, method, p, exp, got, status: res.status, code: res.code, ok: got === exp || (exp === 'A' && got === 'B') })
    if (method !== 'GET' && res.status >= 200 && res.status < 300) { log(`!!! STOP ${id} ${u} ${method} ${p} → ${res.status}`); process.exit(9) }
  }
}))
writeFileSync(`uat/bin/r10v3/matrix-${only ?? 'all'}.json`, JSON.stringify(rows, null, 1))
const bad = rows.filter((r) => !r.ok)
const by = {}; for (const r of rows) by[r.got] = (by[r.got] ?? 0) + 1
log(`matrix ${only ?? 'all'}: ${rows.length} คำขอ · ตรง ${rows.length - bad.length} · ไม่ตรง ${bad.length} · ชนิด ${JSON.stringify(by)}`)
for (const r of bad) log(`✗ ${r.id} ${r.u} ${r.method} ${r.p} คาด ${r.exp} ได้ ${r.got} (${r.status} ${r.code ?? '-'})`)
