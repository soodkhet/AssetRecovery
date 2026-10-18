// AG3 — ไฟล์ใบส่งมอบที่เซ็นแล้ว (PDF ล็อตที่ AG1 ดาวน์โหลด + noise สุ่ม) : R7_SP=<SP> node uat/bin/r7/ag3-mkfiles.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const SP = process.env.R7_SP
const OUT = `${SP}/AG3/files`
mkdirSync(OUT, { recursive: true })
const src = readdirSync(`${SP}/AG1/files/out`).filter(f => f.endsWith('.pdf'))
for (const lot of ['007', '010', '011']) {
  const f = src.find(s => s.includes(lot)) ?? src[0]
  for (let i = 1; i <= 3; i++) writeFileSync(`${OUT}/signed-LOT-${lot}-${i}.pdf`, Buffer.concat([readFileSync(`${SP}/AG1/files/out/${f}`), randomBytes(64 + Math.floor(Math.random() * 512))]))
}
console.log('ok', readdirSync(OUT))
