// AG2: รูปรับเข้าคลัง w1..w28 + ใบเซ็นรับ sign1..3 (noise สุ่ม) — node uat/bin/r7/ag2-mkwh.mjs <outdir>
import { chromium } from '@playwright/test'
const F = process.argv[2]
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 480, height: 640 } })
const noise = () => Array.from({ length: 40 }, () => Math.random().toString(36).slice(2, 6)).join(' ')
const sides = ['ด้านหน้า', 'ด้านหลัง', 'ด้านบน', 'ด้านล่าง', 'ด้านซ้าย', 'ด้านขวา', 'ฉลาก IMEI']
for (let i = 1; i <= 28; i++) {
  await p.setContent(`<body style="margin:0;font-family:sans-serif;background:#${['cbd5e1', 'fde68a', 'bbf7d0', 'bfdbfe', 'fbcfe8', 'ddd6fe', 'fed7aa'][i % 7]}"><div style="padding:40px"><h2>รับเข้าคลัง ${sides[(i - 1) % 7]}</h2><p>MT7 AG2 รูปที่ ${i}</p><p style="font-size:8px;word-break:break-all">${noise()}</p></div></body>`)
  await p.screenshot({ path: `${F}/w${i}.jpg`, type: 'jpeg', quality: 70 })
}
for (let i = 1; i <= 3; i++) {
  await p.setContent(`<body style="font-family:sans-serif;padding:30px;background:#fff"><h2>ใบส่งมอบทรัพย์ (ลงนามรับแล้ว) ${i}</h2><p>ผู้รับมอบลงนาม ______ MT7 AG2 · 18/10/2569</p><p style="font-size:8px">${noise()}</p></body>`)
  await p.screenshot({ path: `${F}/sign${i}.jpg`, type: 'jpeg', quality: 70 })
}
await b.close(); console.log('ok')
