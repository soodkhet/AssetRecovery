// AG2: รูปภาคสนาม + วิดีโอ/เสียง (คัดลอกต้นแบบ MT6 แล้วต่อ noise สุ่มท้ายไฟล์) — node uat/bin/r7/ag2-mkmedia.mjs <srcdir> <outdir>
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const [S, F] = process.argv.slice(2)
for (let i = 1; i <= 6; i++) {
  writeFileSync(`${F}/video${i}.mp4`, Buffer.concat([readFileSync(`${S}/video${i}.mp4`), randomBytes(64)]))
  writeFileSync(`${F}/audio${i}.m4a`, Buffer.concat([readFileSync(`${S}/audio${i}.m4a`), randomBytes(64)]))
}
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 480, height: 640 } })
const noise = () => Array.from({ length: 40 }, () => Math.random().toString(36).slice(2, 6)).join(' ')
const scenes = ['หน้าบ้านลูกหนี้', 'ลูกหนี้ส่งมอบเครื่อง', 'ป้ายบ้านเลขที่', 'บ้านว่าง ไม่มีคนอยู่', 'ตัวเครื่องพร้อมกล่อง', 'ฉลาก IMEI ด้านหลังเครื่อง']
for (let i = 1; i <= 18; i++) {
  await p.setContent(`<body style="margin:0;font-family:sans-serif;background:#${['94a3b8', 'a3e635', 'fbbf24', '60a5fa', 'f472b6', '34d399'][i % 6]}"><div style="padding:40px"><h2>${scenes[i % 6]}</h2><p>MT7 AG2 รูปภาคสนาม ${i} · 18/10/2569</p><p style="font-size:8px;word-break:break-all">${noise()}</p></div></body>`)
  await p.screenshot({ path: `${F}/field${i}.jpg`, type: 'jpeg', quality: 70 })
}
await b.close(); console.log('ok')
