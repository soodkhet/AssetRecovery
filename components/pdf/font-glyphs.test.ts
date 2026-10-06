import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildPackCoverDoc,
  PACK_ATTACHMENT_NOTE,
  PACK_COVER_HEADER_NOTE,
  PACK_COVER_TITLE,
  PACK_FILES,
} from '@/lib/exports/pack'

/**
 * UAT BUG-166 — ข้อความบนหน้าปก Export Pack ต้องใช้อักษรที่ฟอนต์ PDF มี glyph จริง
 * (ลูกศร "⇒/→" ไม่มีในฟอนต์ไทย ⇒ พิมพ์เป็นสัญลักษณ์เพี้ยนทับตัวถัดไป)
 * ตรวจกับไฟล์ฟอนต์ตัวจริงผ่าน fontkit ที่ `@react-pdf/renderer` ใช้อยู่
 */

interface FontLike {
  hasGlyphForCodePoint(codePoint: number): boolean
}

function openThaiFont(): FontLike {
  const localRequire = createRequire(import.meta.url)
  const fontkitPath = localRequire.resolve('fontkit', { paths: [localRequire.resolve('@react-pdf/renderer')] })
  const fontkit = localRequire(fontkitPath) as { openSync(path: string): FontLike }
  return fontkit.openSync(join(process.cwd(), 'public/fonts/NotoSansThai.ttf'))
}

/** อักษรที่ฟอนต์ไม่มี (เว้นช่องว่าง/ขึ้นบรรทัด) */
function missingGlyphs(font: FontLike, text: string): string[] {
  return [...new Set([...text])].filter(
    (char) => !/\s/.test(char) && !font.hasGlyphForCodePoint(char.codePointAt(0) ?? 0),
  )
}

describe('BUG-166 — หน้าปก Export Pack ใช้อักษรที่ฟอนต์มีเท่านั้น', () => {
  const font = openThaiFont()

  it('ฟอนต์ไม่มีลูกศร (ยืนยันต้นเหตุ)', () => {
    expect(missingGlyphs(font, '⇒→')).toEqual(['⇒', '→'])
  })

  it('ข้อความคงที่ทุกช่องบนหน้าปกพิมพ์ได้ครบ', () => {
    const doc = buildPackCoverDoc({
      organizationName: 'บริษัททดสอบ',
      periodLabel: 'ตุลาคม 2569',
      version: 5,
      generatedByName: 'บัญชี',
      generatedAt: new Date('2026-10-06T03:30:00Z'),
      contentDigest: 'abc',
      checks: [],
    })
    const texts = [
      PACK_ATTACHMENT_NOTE,
      PACK_COVER_TITLE,
      PACK_COVER_HEADER_NOTE,
      doc.titleEn,
      doc.versionLabel,
      doc.fileRangeLabel,
      ...PACK_FILES.flatMap((file) => [file.fileName, file.description]),
    ]
    expect(missingGlyphs(font, texts.join(' '))).toEqual([])
  })
})
