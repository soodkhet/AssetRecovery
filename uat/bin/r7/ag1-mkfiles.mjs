// mytester รอบ 7 กลุ่ม AG1 — คัดลอกไฟล์ทดสอบรอบ 6 แล้วเติม noise สุ่มท้ายไฟล์ (ระบบกันไฟล์ซ้ำทุกไบต์)
//   R7_SP=<SP> R7_PHASE=AG1 node uat/bin/r7/ag1-mkfiles.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const SP = process.env.R7_SP
const OUT = `${SP}/${process.env.R7_PHASE ?? 'AG1'}/files`
const R6 = '/private/tmp/claude-501/-Users-beer-AssetRecovery/21ace236-7fe2-4d4d-a2aa-230db94fb870/scratchpad/mytester6'
mkdirSync(OUT, { recursive: true })
const noisy = (src, dst) => writeFileSync(`${OUT}/${dst}`, Buffer.concat([readFileSync(src), randomBytes(64 + Math.floor(Math.random() * 512))]))
const pick = (dir, re) => readdirSync(dir).filter(f => re.test(f)).sort()
const contracts = pick(`${R6}/B/files`, /^contract\d+\.pdf$/)
const ids = pick(`${R6}/B/files`, /^idcard\d+\.jpg$/)
const phones = pick(`${R6}/B/files`, /^phone\d+\.jpg$/)
for (let i = 1; i <= 12; i++) {
  noisy(`${R6}/B/files/${contracts[i % contracts.length]}`, `contract${i}.pdf`)
  noisy(`${R6}/B/files/${ids[i % ids.length]}`, `idcard${i}.jpg`)
  noisy(`${R6}/B/files/${phones[i % phones.length]}`, `phone${i}.jpg`)
}
for (let i = 1; i <= 30; i++) noisy(`${R6}/D-IN/files/photo${(i % 18) + 1}.jpg`, `photo${i}.jpg`)
for (let i = 1; i <= 8; i++) noisy(`${R6}/D-IN/files/video${(i % 8) + 1}.mp4`, `video${i}.mp4`)
for (let i = 1; i <= 6; i++) noisy(`${R6}/D-IN/files/audio${(i % 4) + 1}.m4a`, `audio${i}.m4a`)
for (let i = 1; i <= 8; i++) noisy(`${R6}/D-IN/files/receipt${(i % 3) + 1}.jpg`, `receipt${i}.jpg`)
for (let i = 1; i <= 50; i++) noisy(`${R6}/E/files/w${(i % 19) + 1}.jpg`, `w${i}.jpg`)
console.log('ok', readdirSync(OUT).length, OUT)
