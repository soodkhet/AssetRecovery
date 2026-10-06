import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Font } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'
import { ensureThaiFont, THAI_FONT, THAI_FONT_FILES } from '@/components/pdf/thai-font'
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
  characterSet: number[]
  postscriptName: string
  'OS/2': { usWeightClass: number }
}

function openFont(file: string): FontLike {
  const localRequire = createRequire(import.meta.url)
  const fontkitPath = localRequire.resolve('fontkit', { paths: [localRequire.resolve('@react-pdf/renderer')] })
  const fontkit = localRequire(fontkitPath) as { openSync(path: string): FontLike }
  return fontkit.openSync(join(process.cwd(), file))
}

function openThaiFont(): FontLike {
  return openFont(THAI_FONT_FILES.regular)
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

/**
 * UAT BUG-171 — เอกสารต้องมีตัวหนาจริง (ชื่อเอกสาร/หัวตาราง/แถวรวม/จำนวนเงินตัวอักษร/หัวข้อกล่องสองฝ่าย)
 * ไม่มีไฟล์ตัวหนา = `fontWeight: 700` ถูกวาดด้วยตัวปกติเงียบ ๆ
 */
describe('BUG-171 — ฟอนต์ตัวหนา', () => {
  const regular = openThaiFont()
  const bold = openFont(THAI_FONT_FILES.bold)

  it('ไฟล์ตัวหนาเป็นน้ำหนัก 700 ของ family เดียวกัน', () => {
    expect(bold['OS/2'].usWeightClass).toBe(700)
    expect(bold.postscriptName).toBe('NotoSansThai-Bold')
  })

  it('ตัวหนามี glyph ครบทุกอักษรที่ตัวปกติมี (ไทย + ละติน + ตัวเลข)', () => {
    const missing = regular.characterSet.filter((codePoint) => codePoint < 0xfff0 && !bold.hasGlyphForCodePoint(codePoint))
    expect(missing).toEqual([])
  })

  it('ข้อความคงที่บนหน้าปก Export Pack พิมพ์ตัวหนาได้ครบ', () => {
    expect(missingGlyphs(bold, `${PACK_COVER_TITLE} ${PACK_ATTACHMENT_NOTE} ${PACK_COVER_HEADER_NOTE}`)).toEqual([])
  })

  it('ลงทะเบียนทั้งตัวปกติและตัวหนา — ขอ 700 ได้ไฟล์ตัวหนา', () => {
    ensureThaiFont()
    const boldSource = Font.getFont({ fontFamily: THAI_FONT, fontWeight: 700 })
    const regularSource = Font.getFont({ fontFamily: THAI_FONT, fontWeight: 400 })
    expect(boldSource?.src).toContain('NotoSansThai-Bold.ttf')
    expect(regularSource?.src).toContain('NotoSansThai.ttf')
    expect(regularSource?.src).not.toContain('Bold')
  })
})

describe('ตำแหน่งไฟล์ฟอนต์ (มติ O77 — build warning)', () => {
  it('ensureThaiFont() ใช้ path literal ใต้ public/fonts ที่ตรงกับ THAI_FONT_FILES', () => {
    const source = readFileSync(join(process.cwd(), 'components/pdf/thai-font.ts'), 'utf8')
    for (const file of Object.values(THAI_FONT_FILES)) {
      const literal = file
        .split('/')
        .map((segment) => `'${segment}'`)
        .join(', ')
      expect(source).toContain(`join(process.cwd(), ${literal})`)
    }
  })
})
