// AG4: ไฟล์ทดสอบ noise สุ่ม (สัญญา/บัตร/รูปเครื่อง/รูปภาคสนาม/รูปรับเข้าคลัง/ใบเซ็นรับ/ใบเสร็จ) — node uat/bin/r7/ag4-mkfiles.mjs <outdir>
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const F = process.argv[2]; mkdirSync(F, { recursive: true })
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 480, height: 640 } })
const noise = () => Array.from({ length: 40 }, () => Math.random().toString(36).slice(2, 6)).join(' ')
const shot = async (html, path) => { await p.setContent(`<body style="margin:0;font-family:sans-serif">${html}<p style="font-size:8px;word-break:break-all;padding:8px">${noise()}</p></body>`); await p.screenshot({ path, type: 'jpeg', quality: 70 }) }
for (let i = 1; i <= 4; i++) {
  await shot(`<div style="margin:40px auto;width:260px;height:480px;border-radius:40px;background:#334155;color:#fbbf24;padding:20px"><h2>รูปเครื่อง MT7-AG4 ${i}</h2></div>`, `${F}/phone${i}.jpg`)
  await shot(`<div style="padding:40px"><h1>สำเนาบัตรประชาชน ${i}</h1><p>MT7-AG4 เอกสารทดสอบ ไม่ใช่เอกสารจริง</p></div>`, `${F}/idcard${i}.jpg`)
  await p.setContent(`<body style="font-family:sans-serif;padding:30px"><h2>สัญญาเช่าซื้อ MT7-AG4-${i}</h2><p>เอกสารทดสอบระบบ</p><p style="font-size:8px;color:#999">${noise()}</p></body>`)
  await p.pdf({ path: `${F}/contract${i}.pdf`, format: 'A4' })
}
const scenes = ['หน้าบ้านลูกหนี้', 'บ้านปิด ไม่พบลูกหนี้', 'ป้ายบ้านเลขที่', 'สอบถามเพื่อนบ้าน', 'ตัวเครื่อง', 'ฉลาก IMEI']
for (let i = 1; i <= 12; i++) await shot(`<div style="padding:40px;background:#${['94a3b8','a3e635','fbbf24','60a5fa','f472b6','34d399'][i % 6]}"><h2>${scenes[i % 6]}</h2><p>MT7 AG4 ภาคสนาม ${i} · 18/10/2569</p></div>`, `${F}/field${i}.jpg`)
const sides = ['ด้านหน้า', 'ด้านหลัง', 'ด้านบน', 'ด้านล่าง', 'ด้านซ้าย', 'ด้านขวา', 'ฉลาก IMEI']
for (let i = 1; i <= 7; i++) await shot(`<div style="padding:40px;background:#e2e8f0"><h2>รับเข้าคลัง ${sides[i - 1]}</h2><p>MT7 AG4</p></div>`, `${F}/w${i}.jpg`)
await shot(`<div style="padding:30px"><h2>ใบส่งมอบทรัพย์ (ลงนามรับแล้ว)</h2><p>MT7 AG4 · 18/10/2569</p></div>`, `${F}/sign1.jpg`)
for (let i = 1; i <= 3; i++) await shot(`<div style="padding:30px"><h2>ใบเสร็จรับเงิน MT7-AG4-${i}</h2><p>ค่าใช้จ่ายสำนักงาน</p></div>`, `${F}/receipt${i}.jpg`)
const S = process.argv[3]
if (S && existsSync(`${S}/audio1.m4a`)) for (let i = 1; i <= 2; i++) writeFileSync(`${F}/audio${i}.m4a`, Buffer.concat([readFileSync(`${S}/audio${i}.m4a`), randomBytes(64)]))
await b.close(); console.log('ok', F)
