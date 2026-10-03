// R5 fixture — สร้างรูปรับเข้าคลัง (PNG จริง) + ใบเซ็นรับ/หลักฐานจัดส่ง (PDF/PNG จริง) + ไฟล์ปลอมสำหรับ probe
// ไม่ติดตั้งแพ็กเกจ (node:zlib + node:crypto เท่านั้น) · รันซ้ำได้ (เนื้อไฟล์ deterministic ⇒ hash เดิม)
// รัน: node uat/bin/probe-r5-fixtures.mjs  → uat/fixtures/files/R5-* + SHA256SUMS-R5.tsv
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'

const DIR = 'uat/fixtures/files'
mkdirSync(DIR, { recursive: true })

// ── PNG ──────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
/** PNG 96x96 สีพื้น + แถบเฉียง + tEXt label (ทำให้ทุกไฟล์ hash ไม่ซ้ำกัน) */
function png(label, [r, g, b]) {
  const W = 96
  const H = 96
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0
    for (let x = 0; x < W; x++) {
      const o = y * (W * 3 + 1) + 1 + x * 3
      const stripe = (x + y) % 24 < 4
      raw[o] = stripe ? 255 - r : r
      raw[o + 1] = stripe ? 255 - g : g
      raw[o + 2] = stripe ? 255 - b : b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from(`Comment\0UAT R5 ${label}`, 'latin1')),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── PDF 1 หน้า (ข้อความ ASCII — ฟอนต์ Helvetica มาตรฐาน) ────────────────────
function pdf(lines) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const text = lines.map((l, i) => `BT /F1 14 Tf 60 ${760 - i * 24} Td (${esc(l)}) Tj ET`).join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out))
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

const files = {}
const ANGLES = ['front', 'back', 'top', 'bottom', 'left', 'right', 'imei']
const COLORS = { C1: [30, 120, 200], C2: [200, 90, 40], C4: [60, 160, 90], C5: [140, 60, 170] }
// C1 ครบ 7 มุม · C2/C4/C5 = 2 มุม (front + imei) เพื่อดูคำเตือน "ยังไม่ได้ถ่ายอีก 5 มุม" ที่ไม่ block
for (const [c, color] of Object.entries(COLORS)) {
  const angles = c === 'C1' ? ANGLES : ['front', 'imei']
  for (const a of angles) files[`R5-${c}-intake-${a}.png`] = png(`${c} intake ${a}`, color)
}
// ไฟล์ปลอม: นามสกุลรูป/PDF แต่เนื้อเป็นข้อความ ⇒ browser ผ่าน (เดาจากนามสกุล) แต่ server ต้องปัด UPLOAD_FILE_TYPE_INVALID
files['R5-fake-photo.jpg'] = Buffer.from('this is not a jpeg - UAT R5 probe\n', 'utf8')
files['R5-fake-signed.pdf'] = Buffer.from('this is not a pdf - UAT R5 probe\n', 'utf8')
// เอกสารล็อต
files['R5-LOT-CO1-signed-v1.pdf'] = pdf(['UAT R5 - Handover signed document v1', 'LOT CO1 (UAT-CO1-001, UAT-CO1-002, UAT-CO1-004)', 'Received by: (signature)'])
files['R5-LOT-CO1-signed-v2.pdf'] = pdf(['UAT R5 - Handover signed document v2 (rescan)', 'LOT CO1 (UAT-CO1-001, UAT-CO1-002, UAT-CO1-004)', 'Received by: (signature, clearer scan)'])
files['R5-LOT-CO2-signed.pdf'] = pdf(['UAT R5 - Handover signed document', 'LOT CO2 (UAT-CO2-005)', 'Received by: (signature)'])
files['R5-LOT-CO2-delivery-proof.png'] = png('LOT CO2 delivery proof (Delivered)', [20, 20, 20])

const sums = []
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(`${DIR}/${name}`, buf)
  sums.push(`${createHash('sha256').update(buf).digest('hex')}\t${buf.length}\t${name}`)
}
writeFileSync(`${DIR}/SHA256SUMS-R5.tsv`, `${sums.join('\n')}\n`)
console.log(sums.join('\n'))
