import {
  DOCUMENT_NUMBER_ISSUED_WHEN,
  describeDocumentNumberPattern,
  isTaxDocumentType,
  previewNextDocumentNumber,
  type DocumentNumberState,
} from '@/lib/document-numbering/format'
import { fmtDate } from '@/lib/format/datetime'
import type { DocumentNumberType } from '@/lib/generated/prisma/enums'
import { isDebtorDocumentPurgeDue, isValidRetentionYears } from '@/lib/settings/data-retention'
import {
  WHO_READ_ONLY,
  WHO_SETTINGS,
  WHO_SUPERADMIN_EXECUTIVE,
  WHO_SUPERADMIN_ONLY,
  line,
} from '@/lib/settings/help/common'
import type { SettingHelpContent, SettingHelpExample } from '@/lib/settings/help/types'

/**
 * คำอธิบายค่าตั้งเอกสาร (U108) — เลขที่เอกสาร · เทมเพลตเอกสารภาษี · เอกสารภายใน · ไฟล์ส่งบัญชี ·
 * ข้อมูลองค์กร · ระยะเก็บเอกสารลูกหนี้ — ตัวอย่างจาก `previewNextDocumentNumber()` / `isDebtorDocumentPurgeDue()`
 */

const DAY_MS = 86_400_000

/** วันปิดเคสตัวอย่าง 06/10/2569 10:00 น. (เวลาไทย) */
export const SAMPLE_CASE_CLOSED_AT = new Date('2026-10-06T03:00:00Z')

export function documentNumberingHelp(input: {
  docType: DocumentNumberType
  state: DocumentNumberState
  formatLocked: boolean
  at: Date
}): SettingHelpContent {
  const tax = isTaxDocumentType(input.docType)
  const examples: SettingHelpExample[] = []
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric' }).formatToParts(input.at)
    const ceYear = Number(parts.find((part) => part.type === 'year')?.value)
    const nextYearStart = new Date(Date.UTC(ceYear + 1, 0, 1, 3))
    examples.push({
      title: `รูปแบบ ${describeDocumentNumberPattern(input.state)}`,
      lines: [
        line('เลขถัดไป', previewNextDocumentNumber(input.state, input.at), true),
        line(`ถ้าออกวันที่ ${fmtDate(nextYearStart)} (ขึ้นปีใหม่)`, previewNextDocumentNumber(input.state, nextYearStart)),
      ],
      note: `ออกเลขเมื่อ: ${DOCUMENT_NUMBER_ISSUED_WHEN[input.docType]}`,
    })
  } catch {
    // ค่าในฟอร์มยังไม่ครบ/ไม่ถูกต้อง (เช่น จำนวนหลักว่าง) — ไม่แสดงตัวอย่าง
  }
  return {
    title: 'เลขที่เอกสารทำงานอย่างไร',
    what: 'กำหนดหน้าตาเลขที่ของเอกสารแต่ละชนิด ระบบออกเลขต่อเนื่องให้อัตโนมัติ ไม่ข้าม ไม่ซ้ำ',
    options: [
      { label: 'คำนำหน้า', effect: 'ตัวอักษร A–Z/ตัวเลข คั่นด้วย - ได้ (ว่างได้)' },
      { label: 'ใส่ปี พ.ศ.', effect: 'แทรกปี พ.ศ. ของวันที่เอกสารในเลข' },
      { label: 'จำนวนหลัก', effect: 'เติม 0 ข้างหน้าให้ครบ เกินแล้วเลขยาวขึ้นเอง ไม่ตัดทิ้ง' },
      { label: 'เริ่มนับใหม่ทุกปี', effect: 'ขึ้นปี พ.ศ. ใหม่แล้วเริ่มที่ 1 · ไม่เลือก = นับต่อเนื่องตลอด' },
    ],
    examples,
    who: WHO_SUPERADMIN_ONLY,
    when: tax
      ? input.formatLocked
        ? 'ล็อกแล้ว — ออกฉบับแรกไปแล้ว กฎหมายกำหนดให้เลขเอกสารภาษีต่อเนื่อง จึงเปลี่ยนรูปแบบไม่ได้'
        : 'มีผลกับฉบับถัดไป และจะล็อกรูปแบบทันทีหลังออกฉบับแรก (เอกสารภาษี)'
      : 'มีผลกับเอกสารฉบับถัดไป — เอกสารที่ออกแล้วไม่เปลี่ยนเลข',
  }
}

/** วันแรกที่ job ลบไฟล์ของเคสที่ปิดวันนั้น — ไล่ด้วย `isDebtorDocumentPurgeDue()` ตัวเดียวกับ job จริง */
export function debtorDocumentPurgeDate(closedAt: Date, years: number): Date | null {
  if (!isValidRetentionYears(years)) return null
  const row = { status: 'closed_success' as const, closedAt, reviewedAt: null }
  const start = closedAt.getTime() + (years * 365 - 3) * DAY_MS
  for (let step = 0; step < 10; step += 1) {
    const day = new Date(start + step * DAY_MS)
    if (isDebtorDocumentPurgeDue(row, day, years)) return day
  }
  return null
}

export function dataRetentionHelp(years: number | null, closedAt: Date = SAMPLE_CASE_CLOSED_AT): SettingHelpContent {
  const purgeDate = years === null ? null : debtorDocumentPurgeDate(closedAt, years)
  return {
    title: 'ระยะเก็บเอกสารลูกหนี้คืออะไร',
    what:
      'ตามกฎหมายคุ้มครองข้อมูลส่วนบุคคล (PDPA) ไม่ควรเก็บสำเนาบัตร/สัญญา/เอกสารลูกหนี้นานเกินจำเป็น ระบบลบเฉพาะไฟล์เอกสารลูกหนี้ของเคสที่จบไปครบระยะนี้ทุกวันอัตโนมัติ — ไม่แตะเอกสารบัญชี (ใบกำกับ/50 ทวิ/ใบเสร็จ)',
    examples:
      purgeDate === null || years === null
        ? []
        : [
            {
              title: `ปิดเคส ${fmtDate(closedAt)} + เก็บ ${years} ปี`,
              lines: [line('ระบบลบไฟล์เอกสารลูกหนี้วันที่', fmtDate(purgeDate), true)],
              note: 'วันครบรอบพอดียังเก็บอยู่ — ลบตั้งแต่วันถัดไป · กู้คืนไม่ได้',
            },
          ],
    who: WHO_SUPERADMIN_EXECUTIVE,
    when: 'มีผลกับรอบลบอัตโนมัติรอบถัดไป (ทุกวัน) — ลดจำนวนปีแล้วไฟล์ที่ครบระยะใหม่จะถูกลบทันทีในรอบนั้น',
  }
}

export function taxDocTemplateHelp(): SettingHelpContent {
  return {
    title: 'เทมเพลตเอกสารภาษีกำหนดอะไร',
    what:
      'หน้าตาของใบกำกับภาษีและหนังสือรับรอง 50 ทวิ ที่ระบบสร้าง — โลโก้ ลายเซ็น ขนาดกระดาษ ภาษา และข้อความท้ายเอกสาร ข้อมูลที่กฎหมายบังคับ (เลขผู้เสียภาษี ที่อยู่ ยอดภาษี ฯลฯ) ซ่อนหรือปิดไม่ได้',
    options: [
      { label: 'ภาษาไทย', effect: 'พิมพ์หัวข้อภาษาไทยอย่างเดียว' },
      { label: 'ไทย-อังกฤษ', effect: 'พิมพ์หัวข้อสองภาษา เหมาะกับลูกค้าที่ต้องส่งต่างประเทศ' },
    ],
    who: WHO_SETTINGS,
    when: 'มีผลกับเอกสารที่ออกหลังบันทึก — เอกสารที่ออกแล้วไม่เปลี่ยน',
  }
}

export function internalDocumentsHelp(): SettingHelpContent {
  return {
    title: 'เอกสารภายในคืออะไร',
    what:
      'เอกสารที่ใช้ภายในบริษัท เช่น ใบสำคัญจ่าย สลิปค่าตอบแทน สรุปรอบจ่าย — ไม่ใช่เอกสารภาษีที่ส่งกรมสรรพากร ใช้หัวเอกสารจากข้อมูลองค์กร',
    who: WHO_READ_ONLY,
    when: 'ไม่มีค่าให้แก้ — เปลี่ยนข้อมูลองค์กรแล้วมีผลกับเอกสารที่ออกหลังจากนั้น',
  }
}

export function exportFormatsHelp(): SettingHelpContent {
  return {
    title: 'ไฟล์ส่งสำนักงานบัญชีคืออะไร',
    what:
      'ชุดไฟล์ประจำงวด (ยอดขาย ยอดจ่าย ภาษีหัก ณ ที่จ่าย หลักฐาน) ที่ส่งให้สำนักงานบัญชีลงบัญชีและยื่นภาษี ระบบเก็บทุกเวอร์ชันพร้อมรหัสตรวจสอบไฟล์ ส่งซ้ำได้แต่ไม่เขียนทับของเดิม',
    who: WHO_READ_ONLY,
    when: 'ใช้ทุกครั้งที่สร้างไฟล์ส่งบัญชี — ส่งไม่ได้ถ้างวดยังมีปัญหาร้ายแรงค้าง',
  }
}

export function organizationProfileHelp(): SettingHelpContent {
  return {
    title: 'ข้อมูลองค์กรใช้ที่ไหน',
    what:
      'ชื่อ เลขประจำตัวผู้เสียภาษี สาขา ที่อยู่ และโลโก้ พิมพ์บนหัวเอกสารทุกฉบับ ทั้งใบกำกับภาษี ใบแจ้งหนี้ หนังสือรับรอง 50 ทวิ และเอกสารภายใน — ต้องตรงกับที่จดทะเบียนไว้กับกรมสรรพากร',
    options: [
      { label: 'สำนักงานใหญ่ / สาขา', effect: 'พิมพ์ต่อจากเลขผู้เสียภาษีบนใบกำกับ' },
      { label: 'ไม่ได้จดทะเบียน VAT', effect: 'ออกใบกำกับภาษีไม่ได้' },
    ],
    who: WHO_SUPERADMIN_ONLY,
    when: 'มีผลกับเอกสารที่ออกหลังบันทึก — เอกสารที่ออกแล้วเก็บข้อมูล ณ วันที่ออกไว้ ไม่เปลี่ยน',
  }
}
