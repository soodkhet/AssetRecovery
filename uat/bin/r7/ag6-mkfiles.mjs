// mytester รอบ 7 กลุ่ม AG6 (S6) — ไฟล์เอกสารชุด (สแกนรวมเล่ม) ต่อเคส 40 ไฟล์ จากไฟล์สัญญารอบ 6 + noise สุ่ม (กันไฟล์ซ้ำทุกไบต์)
//   R7_SP=<SP> node uat/bin/r7/ag6-mkfiles.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const OUT = `${process.env.R7_SP}/AG6/files/bundle`
const R6 = '/private/tmp/claude-501/-Users-beer-AssetRecovery/21ace236-7fe2-4d4d-a2aa-230db94fb870/scratchpad/mytester6'
mkdirSync(OUT, { recursive: true })
const src = readdirSync(`${R6}/B/files`).filter(f => /^contract\d+\.pdf$/.test(f)).sort()
for (let i = 1; i <= 40; i++) writeFileSync(`${OUT}/bundle${i}.pdf`, Buffer.concat([readFileSync(`${R6}/B/files/${src[i % src.length]}`), randomBytes(64 + Math.floor(Math.random() * 512))]))
console.log('ok', readdirSync(OUT).length, OUT)
