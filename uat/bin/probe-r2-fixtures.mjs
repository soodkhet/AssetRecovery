// สร้างไฟล์แนบ fixture ของ R2 ที่ uat/fixtures/files/ — ไม่ต้องติดตั้งแพ็กเกจ (node:zlib + เขียน PDF เอง)
// รัน: node uat/bin/probe-r2-fixtures.mjs   (รันซ้ำได้ ผลเหมือนเดิมทุกไบต์ ⇒ SHA-256 คงที่)
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const DIR = 'uat/fixtures/files'
mkdirSync(DIR, { recursive: true })

// ── CRC32 สำหรับ PNG chunk
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
/** PNG RGB 8-bit ขนาด w×h — พื้นสี bg + แถบทแยงสี fg + tEXt ระบุชื่อ */
function png(w, h, bg, fg, label) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1)
    raw[row] = 0 // filter none
    for (let x = 0; x < w; x++) {
      const stripe = Math.floor((x + y) / 16) % 2 === 0
      const frame = x < 6 || y < 6 || x >= w - 6 || y >= h - 6
      const [r, g, b] = frame || stripe ? fg : bg
      const i = row + 1 + x * 3
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from(`Comment\0${label}`, 'latin1')),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** PDF 1.4 หน้าเดียว ข้อความ ASCII (Helvetica) — xref offset คำนวณจริง เปิดได้ทุก viewer */
function pdf(lines) {
  const esc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const stream = ['BT', '/F1 18 Tf', '72 760 Td', '24 TL',
    ...lines.map((l, i) => (i === 0 ? `(${esc(l)}) Tj` : `T* (${esc(l)}) Tj`)), 'ET'].join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets = []
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  out += offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

const CASES = [
  ['C1', 'UAT-CO1-001', 'Samsung Galaxy A55'],
  ['C2', 'UAT-CO1-002', 'iPhone 15 128GB'],
  ['C3', 'UAT-CO2-003', 'OPPO Reno 11'],
  ['C4', 'UAT-CO1-004', 'iPad Air M2'],
  ['C5', 'UAT-CO2-005', 'vivo V30'],
  ['C6', 'UAT-CO1-006', 'Redmi Note 13'],
  ['C7', 'UAT-CO2-007', 'Samsung Galaxy A35'],
  ['C8', 'UAT-CO1-008', 'iPhone 13'],
]
const written = []
function save(name, buf) { writeFileSync(`${DIR}/${name}`, buf); written.push(`${name}\t${buf.length}\t${createHash('sha256').update(buf).digest('hex')}`) }

for (const [key, ref, model] of CASES) {
  save(`${key}-contract.pdf`, pdf([`UAT FIXTURE - HIRE PURCHASE CONTRACT`, `Case ref: ${ref}`, `Asset: ${model}`, 'Test data only - not a real contract']))
  save(`${key}-idcard.png`, png(340, 214, [226, 232, 240], [30, 64, 175], `UAT fixture national ID ${ref}`))
  save(`${key}-product.png`, png(320, 320, [236, 253, 245], [4, 120, 87], `UAT fixture product photo ${ref} ${model}`))
}
// ไฟล์ผิดชนิด — ใช้ probe UX guard ของช่องรูปสินค้า (ต้องถูกปัดที่ฟอร์ม ไม่ถึง API)
save('not-an-image.txt', Buffer.from('UAT fixture: plain text, must be rejected by product_photo slot\n'))
writeFileSync(`${DIR}/SHA256SUMS.tsv`, `file\tbytes\tsha256\n${written.join('\n')}\n`)
console.log(written.length, 'files →', DIR)
