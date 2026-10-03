// สร้างไฟล์หลักฐานภาคสนาม R4 ที่ uat/fixtures/files/ — ไม่ติดตั้งแพ็กเกจ ไม่ดาวน์โหลด
// วิธี: เปิด Chrome ในเครื่องผ่าน Playwright (มีอยู่แล้ว — DEC-011) แล้วใช้ <canvas>
//   - รูป: canvas.toBlob('image/jpeg' | 'image/png')
//   - วิดีโอ: canvas.captureStream(15) + MediaRecorder('video/mp4;codecs=avc1') ~2 วินาที → MP4 (H.264) จริง เปิดได้
// รัน: node uat/bin/probe-r4-fixtures.mjs   (รูปได้ไบต์เดิมทุกครั้ง · MP4 ไบต์เปลี่ยนทุกครั้ง ⇒ ดู SHA256SUMS-R4.tsv ล่าสุด)
// ⚠️ ไม่แตะแอป/ฐานข้อมูล — เปิดแค่ about:blank
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const DIR = 'uat/fixtures/files'
mkdirSync(DIR, { recursive: true })

// [ชื่อไฟล์, ชนิด, หัวข้อ, บรรทัดรอง, สีพื้น]
const IMAGES = [
  ['R4-C1-photo.jpg', 'image/jpeg', 'C1 UAT-CO1-001 หน้าบ้านลูกหนี้', 'ลาดพร้าว 15 จตุจักร', '#1e3a5f'],
  ['R4-C1-product.jpg', 'image/jpeg', 'C1 Samsung Galaxy A55', 'IMEI 356789100000011', '#14532d'],
  ['R4-C2-photo.jpg', 'image/jpeg', 'C2 UAT-CO1-002 หน้าอาคาร', 'ถ.พระราม 9 ห้วยขวาง', '#1e3a5f'],
  ['R4-C2-product.jpg', 'image/jpeg', 'C2 iPhone 15 128GB', 'IMEI 356789100000029', '#14532d'],
  ['R4-C3-photo.jpg', 'image/jpeg', 'C3 UAT-CO2-003 บ้านปิด ไม่พบลูกหนี้', 'ถ.บางนา-ตราด บางนา', '#7f1d1d'],
  ['R4-C4-photo.jpg', 'image/jpeg', 'C4 UAT-CO1-004 หน้าบ้าน', 'ถ.รัชดาภิเษก ดินแดง', '#1e3a5f'],
  // v1 = รูปสินค้าที่ "ไม่เห็น IMEI" (ถูกตีกลับ) · v2 = ถ่ายใหม่เห็น IMEI ชัด (ใช้ตอนส่งใหม่)
  ['R4-C4-product-v1.jpg', 'image/jpeg', 'C4 iPad Air M2 (มุมไกล)', 'มองไม่เห็นเลข IMEI', '#4b5563'],
  ['R4-C4-product-v2.jpg', 'image/jpeg', 'C4 iPad Air M2 (ถ่ายใหม่)', 'IMEI 356789100000045', '#14532d'],
  ['R4-C5-photo.jpg', 'image/jpeg', 'C5 UAT-CO2-005 หน้าบ้าน', 'ม.2 ต.คลองหนึ่ง คลองหลวง', '#1e3a5f'],
  ['R4-C5-product.png', 'image/png', 'C5 vivo V30', 'IMEI 356789100000052', '#14532d'],
]
const VIDEOS = [
  ['R4-C1-video.mp4', 'C1 วิดีโอยืนยันการรับคืน'],
  ['R4-C2-video.mp4', 'C2 วิดีโอยืนยันการรับคืน'],
  ['R4-C3-video.mp4', 'C3 วิดีโอบ้านปิด'],
  ['R4-C4-video.mp4', 'C4 วิดีโอยืนยันการรับคืน'],
  ['R4-C5-video.mp4', 'C5 วิดีโอยืนยันการรับคืน'],
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
await page.goto('about:blank')

for (const [name, mime, title, sub, bg] of IMAGES) {
  const b64 = await page.evaluate(async ({ mime, title, sub, bg }) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480
    const g = c.getContext('2d')
    g.fillStyle = bg; g.fillRect(0, 0, 640, 480)
    g.fillStyle = '#ffffff'; g.font = 'bold 30px sans-serif'; g.fillText(title, 24, 200)
    g.font = '26px monospace'; g.fillText(sub, 24, 250)
    g.font = '18px sans-serif'; g.fillText('UAT R4 fixture — ข้อมูลสมมติ', 24, 440)
    const blob = await new Promise(r => c.toBlob(r, mime, 0.9))
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ''; for (const x of buf) s += String.fromCharCode(x)
    return btoa(s)
  }, { mime, title, sub, bg })
  writeFileSync(`${DIR}/${name}`, Buffer.from(b64, 'base64'))
}

for (const [name, title] of VIDEOS) {
  const res = await page.evaluate(async ({ title }) => {
    const type = 'video/mp4;codecs=avc1'
    if (!MediaRecorder.isTypeSupported(type)) return { error: `MediaRecorder ไม่รองรับ ${type}` }
    const c = document.createElement('canvas'); c.width = 320; c.height = 240
    const g = c.getContext('2d')
    const stream = c.captureStream(15)
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 250_000 })
    const parts = []
    rec.ondataavailable = e => { if (e.data.size) parts.push(e.data) }
    const done = new Promise(r => { rec.onstop = r })
    rec.start(250)
    const t0 = performance.now()
    await new Promise(resolve => {
      const tick = () => {
        const t = performance.now() - t0
        g.fillStyle = '#0f172a'; g.fillRect(0, 0, 320, 240)
        g.fillStyle = '#10b981'; g.fillRect((t / 8) % 320, 150, 40, 40)
        g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText(title, 10, 40)
        g.fillText(`${(t / 1000).toFixed(1)} s`, 10, 70)
        if (t < 2000) requestAnimationFrame(tick); else resolve()
      }
      tick()
    })
    rec.stop(); await done
    const blob = new Blob(parts, { type: 'video/mp4' })
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ''; for (const x of buf) s += String.fromCharCode(x)
    return { b64: btoa(s), mime: rec.mimeType }
  }, { title })
  if (res.error) { console.error(res.error); process.exitCode = 1; continue }
  writeFileSync(`${DIR}/${name}`, Buffer.from(res.b64, 'base64'))
}
await browser.close()

// probe: ไฟล์ข้อความที่ตั้งนามสกุล .mp4 (ตรวจว่าแอปเชื่อนามสกุล/MIME อย่างเดียวหรือไม่ — ใช้เฉพาะ probe ห้ามใช้ปิดงานจริง)
writeFileSync(`${DIR}/R4-fake-video.mp4`, 'this is not a video — UAT R4 probe\n')

const rows = ['file\tbytes\tsha256\tmagic']
for (const [name] of [...IMAGES, ...VIDEOS, ['R4-fake-video.mp4']]) {
  const buf = readFileSync(`${DIR}/${name}`)
  const magic = buf.subarray(0, 12).toString('hex')
  rows.push(`${name}\t${buf.length}\t${createHash('sha256').update(buf).digest('hex')}\t${magic}`)
}
writeFileSync(`${DIR}/SHA256SUMS-R4.tsv`, rows.join('\n') + '\n')
console.log(rows.join('\n'))
