// AG5: สร้างไฟล์ทดสอบ (สัญญา/บัตร/รูปเครื่อง) ใส่ noise สุ่ม — node uat/bin/r7/ag5-mkfiles.mjs <outdir> <n>
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const F = process.argv[2]; const N = Number(process.argv[3] ?? 6); mkdirSync(F, { recursive: true })
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage({ viewport: { width: 600, height: 800 } })
const noise = () => Array.from({ length: 40 }, () => Math.random().toString(36).slice(2, 6)).join(' ')
const cols = ['111', '6b21a8', '0ea5e9', '16a34a', 'ec4899', '222']
for (let i = 1; i <= N; i++) {
  await p.setContent(`<body style="margin:0;background:#e2e8f0;font-family:sans-serif"><div style="margin:60px auto;width:260px;height:540px;border-radius:40px;background:#${cols[i % 6]};color:#f59e0b;display:flex;align-items:center;justify-content:center;flex-direction:column"><h2>รูปเครื่อง MT7-AG5 ${i}</h2><p style="font-size:8px;word-break:break-all;padding:8px">${noise()}</p></div></body>`)
  await p.screenshot({ path: `${F}/phone${i}.jpg`, type: 'jpeg', quality: 70 })
  await p.setContent(`<body style="font-family:sans-serif;padding:40px"><h1>สำเนาบัตรประจำตัวประชาชน ${i}</h1><p>MT7-AG5 เอกสารทดสอบ — ไม่ใช่เอกสารจริง</p><p style="font-size:9px">${noise()}</p></body>`)
  await p.screenshot({ path: `${F}/idcard${i}.jpg`, type: 'jpeg', quality: 70 })
  await p.setContent(`<body style="font-family:sans-serif;padding:30px"><h2>สัญญาเช่าซื้อโทรศัพท์เคลื่อนที่ เลขที่ MT7-AG5-${String(i).padStart(2, '0')}</h2><p>ผ่อนชำระ 12 งวด — เอกสารทดสอบระบบ ไม่ใช่เอกสารจริง</p><p style="font-size:8px;color:#999">${noise()}</p></body>`)
  await p.pdf({ path: `${F}/contract${i}.pdf`, format: 'A4' })
}
await b.close(); console.log('ok', F)
// ใบเสร็จเคลียร์เงินทดรอง (noise สุ่ม) — receipt1..3.jpg
{
  const b2 = await chromium.launch({ channel: 'chrome' }); const p2 = await b2.newPage({ viewport: { width: 500, height: 700 } })
  const nz = () => Array.from({ length: 40 }, () => Math.random().toString(36).slice(2, 6)).join(' ')
  for (let i = 1; i <= 3; i++) {
    await p2.setContent(`<body style="font-family:sans-serif;padding:30px"><h2>ใบเสร็จรับเงิน เลขที่ RC-MT7-AG5-${i}</h2><p>ร้านปั๊มน้ำมันบางใหญ่ / ค่าทางด่วน — เอกสารทดสอบระบบ</p><p style="font-size:8px;color:#999">${nz()}</p></body>`)
    await p2.screenshot({ path: `${F}/receipt${i}.jpg`, type: 'jpeg', quality: 70 })
  }
  await b2.close()
}
