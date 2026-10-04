import { inflateSync } from 'node:zlib'

/**
 * ดึงข้อความจาก PDF ที่ `@react-pdf/renderer` สร้าง — **ใช้ในเทสต์เท่านั้น** (ไม่ใช่ parser ทั่วไป)
 *
 * react-pdf เขียนข้อความเป็น glyph id (hex) ใน `TJ`/`Tj` แล้วแนบ ToUnicode CMap ต่อฟอนต์ ⇒ แตก stream
 * (Flate) → อ่าน CMap → แปลง glyph id กลับเป็นอักษร · ต่อทุกช่วงข้อความเรียงตามลำดับใน content stream
 * · สระอำที่ถูกแยกเป็น นิคหิต + สระอา ตอนเรนเดอร์ จะถูกรวมกลับเป็น "ำ" ให้เทียบข้อความได้ตรง ๆ
 *   (ภาษาไทยไม่มีลำดับ "ำา" ที่ถูกต้องอยู่แล้ว)
 */
export function extractPdfText(pdf: Uint8Array): string {
  const buffer = Buffer.from(pdf)
  const source = buffer.toString('latin1')
  const streams: string[] = []
  const marker = /stream\r?\n/g
  let match: RegExpExecArray | null
  while ((match = marker.exec(source)) !== null) {
    const start = match.index + match[0].length
    const end = source.indexOf('endstream', start)
    if (end === -1) break
    streams.push(inflateOrRaw(buffer.subarray(start, end)))
  }

  const maps = streams.filter((data) => data.includes('beginbf')).map(parseToUnicode)
  const glyph = (id: number): string => {
    for (const map of maps) {
      const value = map.get(id)
      if (value !== undefined) return value
    }
    return '�'
  }

  let text = ''
  for (const data of streams) {
    for (const op of data.matchAll(/(\[[^\]]*\])\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g)) {
      const hexes = op[1] !== undefined ? [...op[1].matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => m[1] ?? '') : [op[2] ?? '']
      for (const hex of hexes) {
        for (let i = 0; i + 4 <= hex.length; i += 4) text += glyph(parseInt(hex.slice(i, i + 4), 16))
      }
      text += '\n'
    }
  }
  // glyph นิคหิตของฟอนต์ถูก map กลับเป็น "ำ" ใน ToUnicode ⇒ ได้ "ำา" / "ํา" — รวมกลับเป็น "ำ" ตัวเดียว
  return text.replace(/[\u0E33\u0E4D](\n?)\u0E32/g, '\u0E33$1')
}

function inflateOrRaw(raw: Buffer): string {
  for (const candidate of [raw, raw.subarray(0, raw.length - 1), raw.subarray(0, raw.length - 2)]) {
    try {
      return inflateSync(candidate).toString('latin1')
    } catch {
      // ไม่ใช่ Flate (หรือมี EOL ท้าย stream) — ลองตัวถัดไป
    }
  }
  return raw.toString('latin1')
}

function utf16(hex: string): string {
  let out = ''
  for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
  return out
}

function parseToUnicode(data: string): Map<number, string> {
  const map = new Map<number, string>()
  for (const block of data.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of (block[1] ?? '').matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      map.set(parseInt(pair[1] ?? '0', 16), utf16(pair[2] ?? ''))
    }
  }
  for (const block of data.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of (block[1] ?? '').matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
      const low = parseInt(range[1] ?? '0', 16)
      const high = parseInt(range[2] ?? '0', 16)
      const target = range[3] ?? ''
      if (target.startsWith('[')) {
        const values = [...target.matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => utf16(m[1] ?? ''))
        for (let id = low; id <= high; id += 1) map.set(id, values[id - low] ?? '�')
      } else {
        const base = parseInt(target.slice(1, -1), 16)
        for (let id = low; id <= high; id += 1) map.set(id, String.fromCodePoint(base + id - low))
      }
    }
  }
  return map
}
