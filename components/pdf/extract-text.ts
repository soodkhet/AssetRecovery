import { inflateSync } from 'node:zlib'

/**
 * ดึงข้อความจาก PDF ที่ `@react-pdf/renderer` สร้าง — **ใช้ในเทสต์เท่านั้น** (ไม่ใช่ parser ทั่วไป)
 *
 * react-pdf เขียนข้อความเป็น glyph id (hex) ใน `TJ`/`Tj` แล้วแนบ ToUnicode CMap ต่อฟอนต์ ⇒ แตก stream
 * (Flate) → อ่าน CMap → แปลง glyph id กลับเป็นอักษร · ต่อทุกช่วงข้อความเรียงตามลำดับใน content stream
 * · สระอำที่ถูกแยกเป็น นิคหิต + สระอา ตอนเรนเดอร์ จะถูกรวมกลับเป็น "ำ" ให้เทียบข้อความได้ตรง ๆ
 *   (ภาษาไทยไม่มีลำดับ "ำา" ที่ถูกต้องอยู่แล้ว)
 * · CMap อ่าน**แยกต่อฟอนต์** (`/F1` ↔ ToUnicode ของมัน) — ตัวปกติกับตัวหนา (BUG-171) เป็น subset คนละชุด
 *   glyph id ชนกันได้ ถ้ารวมเป็นตารางเดียวข้อความจะเพี้ยน
 */
export function extractPdfText(pdf: Uint8Array): string {
  const buffer = Buffer.from(pdf)
  const source = buffer.toString('latin1')
  const streams: Array<{ objectId: string | null; data: string }> = []
  const marker = /stream\r?\n/g
  let match: RegExpExecArray | null
  while ((match = marker.exec(source)) !== null) {
    const start = match.index + match[0].length
    const end = source.indexOf('endstream', start)
    if (end === -1) break
    const header = source.slice(Math.max(0, match.index - 400), match.index)
    const objectId = [...header.matchAll(/(\d+) 0 obj/g)].at(-1)?.[1] ?? null
    streams.push({ objectId, data: inflateOrRaw(buffer.subarray(start, end)) })
    marker.lastIndex = end + 'endstream'.length
  }

  const cmapByObject = new Map<string, Map<number, string>>()
  for (const stream of streams) {
    if (stream.objectId !== null && stream.data.includes('beginbf')) {
      cmapByObject.set(stream.objectId, parseToUnicode(stream.data))
    }
  }
  const allMaps = [...cmapByObject.values()]

  // ฟอนต์ต่อชื่อ resource: ToUnicode ของตัวเอง · ฟอนต์มาตรฐานในตัว (เช่น Courier ของตัวเลขอ้างอิง/IMEI —
  // มติ PO U100) ไม่มี ToUnicode: 1 ไบต์ = 1 อักษร (WinAnsi)
  const simpleFonts = new Set<string>()
  const fontCmaps = new Map<string, Map<number, string>>()
  for (const ref of source.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const objStart = source.indexOf(`\n${ref[2] ?? ''} 0 obj`)
    if (objStart === -1) continue
    const body = source.slice(objStart, source.indexOf('endobj', objStart))
    if (body.includes('/Type1') && !body.includes('/ToUnicode')) simpleFonts.add(ref[1] ?? '')
    const toUnicode = /\/ToUnicode (\d+) 0 R/.exec(body)?.[1]
    const cmap = toUnicode === undefined ? undefined : cmapByObject.get(toUnicode)
    if (cmap !== undefined) fontCmaps.set(ref[1] ?? '', cmap)
  }

  let current: Map<number, string> | undefined
  const glyph = (id: number): string => {
    const own = current?.get(id)
    if (own !== undefined) return own
    if (current !== undefined) return '�'
    for (const map of allMaps) {
      const value = map.get(id)
      if (value !== undefined) return value
    }
    return '�'
  }

  let text = ''
  for (const { data } of streams) {
    let simple = false
    for (const op of data.matchAll(/\/(F\d+) [\d.]+ Tf|(\[[^\]]*\])\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g)) {
      if (op[1] !== undefined) {
        simple = simpleFonts.has(op[1])
        current = fontCmaps.get(op[1])
        continue
      }
      const hexes = op[2] !== undefined ? [...op[2].matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => m[1] ?? '') : [op[3] ?? '']
      for (const hex of hexes) {
        if (simple) {
          for (let i = 0; i + 2 <= hex.length; i += 2) text += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
        } else {
          for (let i = 0; i + 4 <= hex.length; i += 4) text += glyph(parseInt(hex.slice(i, i + 4), 16))
        }
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
