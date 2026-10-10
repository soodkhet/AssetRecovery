import { z } from 'zod'

/**
 * ทะเบียน "ค่าตั้งที่เป็นสมมติฐาน รอนักบัญชียืนยัน" (มติ PO 07/10/2569 U140) — pure
 *
 * ระบบใช้ค่าแนะนำไปก่อนสำหรับเรื่องที่ยังรอคำตอบนักบัญชี (คำถาม Q1–Q18 · ข้อมูลตั้งต้น A/C/F ·
 * มติเชิงบัญชี A1–A9 · U128) — หน้าตั้งค่าแสดงป้าย "รอนักบัญชียืนยัน" ข้างค่าตั้งนั้น จนกว่าผู้ถือสิทธิ์
 * `manage_accountant_questions` (บัญชี) กด "ยืนยันแล้ว" พร้อมเหตุผล (insert-only + audit) แล้วป้ายหาย
 *
 * ⚠️ `label`/`question` เป็นข้อความที่ผู้ใช้เห็น — ห้ามมีเลขอ้างอิงสเปค (Rule 05) · อ้างอิงอยู่ใน `source` (ไม่ render)
 * · ผูกกับกล่องคำอธิบายด้วยฟิลด์ `assumption` ของ `SettingHelpContent` (`lib/settings/help/*`)
 */

/** ผู้ยืนยันว่านักบัญชีตอบแล้ว = บัญชี (ผู้บันทึก/ตอบคำถามนักบัญชี) — API ตรวจ `manage` ของตัวนี้ */
export const CONFIRM_SETTING_ASSUMPTION = 'manage_accountant_questions'

export const SETTING_ASSUMPTION_KEYS = [
  'wht_income_type',
  'wht_base',
  'wht_zero_rate_certificate',
  'wht_certificate_mode',
  'wht_threshold',
  'wht_filing_method',
  'wht_gross_up',
  'holidays',
  'vat_rounding',
  'tax_invoice_fields',
  'invoice_numbering',
  'internal_documents',
  'export_pack',
  'cost_centers',
  'bank_file_formats',
  'hotel_receipt',
  'adjustment_after_close',
  'customer_wht',
  'bank_fee_write_off',
  'customer_wht_bank_fee',
  'bank_fee_full_tax_invoice',
] as const

export type SettingAssumptionKey = (typeof SETTING_ASSUMPTION_KEYS)[number]

export const settingAssumptionKeySchema = z.enum(SETTING_ASSUMPTION_KEYS)

export interface SettingAssumption {
  key: SettingAssumptionKey
  /** หัวข้อสั้นบนป้าย/รายการ */
  label: string
  /** ค่าที่ระบบใช้อยู่ตอนนี้ + สิ่งที่ขอให้นักบัญชียืนยัน */
  question: string
  /** ที่มา (คำถามนักบัญชี/มติ) — metadata ไม่ render */
  source: string
}

export const SETTING_ASSUMPTIONS: Readonly<Record<SettingAssumptionKey, SettingAssumption>> = {
  wht_income_type: {
    key: 'wht_income_type',
    label: 'ประเภทเงินได้ของผู้รับเงิน',
    question:
      'ค่าองค์กรใช้ค่าจ้างทำของ 40(8) อัตรา 3% ไปก่อน และตั้งประเภทเงินได้ 40(2)/40(8) รายคนได้ที่ข้อมูลผู้รับเงิน (ค่ารายคนชนะค่าองค์กร) — พนักงานที่มีสัญญาจ้างแรงงานควรเป็น 40(1)/40(2) ยื่น ภ.ง.ด.1 หรือไม่',
    source: 'Q1 · A3 · U5/U33 · staging E-021',
  },
  wht_base: {
    key: 'wht_base',
    label: 'ฐานภาษีหัก ณ ที่จ่าย',
    question: 'หักจากค่าคอมมิชชัน/ค่าติดตาม/ค่าน้ำมันเหมาจ่าย/เบี้ยเลี้ยง ไม่รวมค่าใช้จ่ายที่เบิกตามใบเสร็จในนามบริษัท · ฐานก่อน VAT',
    source: 'Q2 · A1 · U3',
  },
  wht_zero_rate_certificate: {
    key: 'wht_zero_rate_certificate',
    label: 'หนังสือรับรองกรณีอัตรา 0%',
    question: 'เงินได้ 40(1)/40(2) ที่ภาษีเป็น 0 ยังออกหนังสือรับรองและรวมใน ภ.ง.ด.1',
    source: 'Q3 · U16',
  },
  wht_certificate_mode: {
    key: 'wht_certificate_mode',
    label: 'รูปแบบการออกหนังสือรับรอง',
    question: 'ออก 1 ใบต่อผู้รับต่อรอบจ่าย (รวมทุกรายการในรอบ)',
    source: 'Q4 · A2 · U4',
  },
  wht_threshold: {
    key: 'wht_threshold',
    label: 'เกณฑ์ขั้นต่ำไม่หักภาษี',
    question:
      'ไม่หักเมื่อยอดต่ำกว่า ฿1,000 (อัตรา 3% ค่าเริ่มต้น) โดยนับยอดสะสมต่อผู้รับต่อเดือนปฏิทิน (ค่าเริ่มต้น — ท.ป.4/2528) รอบที่ถึงเกณฑ์หักรวมส่วนของรอบก่อน · เลือกนับต่อรอบจ่ายได้ — ใช้วิธีไหน',
    source: 'ส่วนที่ 2 A1/A3 · มติ A4 · staging E-054',
  },
  wht_filing_method: {
    key: 'wht_filing_method',
    label: 'กำหนดยื่น ภ.ง.ด.',
    // ข้อความกลาง — วิธียื่นจริงดูที่คอลัมน์ "ค่าที่ใช้อยู่" (staging E-055: เดิมเขียนตายตัวว่าออนไลน์วันที่ 15)
    question:
      'วิธียื่น ภ.ง.ด. และกำหนดยื่นตามค่าตั้ง (กระดาษ วันที่ 7 · ออนไลน์ วันที่ 15 ของเดือนถัดไป · เลื่อนตามวันหยุด) — แจ้งเมื่อมาตรการขยายเวลาเปลี่ยน',
    source: 'Q16 · ส่วนที่ 2 A5 · U45/U93',
  },
  wht_gross_up: {
    key: 'wht_gross_up',
    label: 'เงื่อนไขภาษีที่บริษัทออกให้',
    question: 'สูตรออกให้ตลอดไป/ออกให้ครั้งเดียว และการบันทึกภาษีที่ออกให้เป็นรายจ่าย ก่อนเปิดใช้',
    source: 'Q18 · U105',
  },
  holidays: {
    key: 'holidays',
    label: 'ปฏิทินวันหยุด',
    question: 'วันหยุดราชการของปีที่ใช้เลื่อนกำหนดยื่นแบบ',
    source: 'ส่วนที่ 2 A5 · U93',
  },
  vat_rounding: {
    key: 'vat_rounding',
    label: 'การปัดเศษภาษีมูลค่าเพิ่ม',
    question: 'คำนวณ VAT ต่อเคสแล้วรวมเป็นยอดใบ (อาจต่างจากคิดจากยอดรวมไม่กี่สตางค์)',
    source: 'Q13 · ส่วนที่ 2 B1',
  },
  tax_invoice_fields: {
    key: 'tax_invoice_fields',
    label: 'รายการบนใบกำกับภาษีเต็มรูป',
    question: 'ชื่อ/ที่อยู่/เลขผู้เสียภาษี/สาขา ทั้งผู้ขายและผู้ซื้อ · เลขที่/วันที่ · รายการ · ก่อน VAT/VAT/รวม — ครบหรือไม่',
    source: 'Q7 · Q12 · U95',
  },
  invoice_numbering: {
    key: 'invoice_numbering',
    label: 'รูปแบบเลขใบกำกับภาษี',
    question: 'ใช้รูปแบบเริ่มต้น INV-0001 (ไม่มีปี)',
    source: 'ส่วนที่ 2 C1 · U102',
  },
  internal_documents: {
    key: 'internal_documents',
    label: 'ใบสำคัญจ่าย',
    question: 'ใช้สลิปโอน + หนังสือรับรองเป็นหลักฐานแทนฉบับที่ผู้รับเซ็น เพียงพอหรือไม่',
    source: 'Q14 · U102',
  },
  export_pack: {
    key: 'export_pack',
    label: 'ชุดเอกสารบัญชีรายเดือน',
    question:
      'รูปแบบไฟล์ชุดส่งบัญชี · ข้อมูลหัก ณ ที่จ่ายเลือกตามเดือนที่จ่าย และใบที่ยกเลิกหลังส่งชุดแล้วมีแถวกลับรายการในชุดเดือนถัดไป',
    source: 'Q10 · U128',
  },
  cost_centers: {
    key: 'cost_centers',
    label: 'ศูนย์ต้นทุน',
    question: 'แยกตามทีม (ทีมใน/ทีมนอก) — ต้องการโครงสร้างอื่นหรือไม่',
    source: 'Q11',
  },
  bank_file_formats: {
    key: 'bank_file_formats',
    label: 'รูปแบบไฟล์โอนธนาคาร',
    question: 'ธนาคาร รูปแบบไฟล์ และการเข้ารหัสอักษร ต้องทดสอบกับธนาคารจริงก่อนใช้',
    source: 'ส่วนที่ 2 F1',
  },
  hotel_receipt: {
    key: 'hotel_receipt',
    label: 'ค่าที่พักที่ใบเสร็จไม่ใช่นามบริษัท',
    question: 'ถือเป็นเงินได้ของพนักงาน/รายจ่ายต้องห้าม หรือจัดการอย่างไร',
    source: 'Q17',
  },
  adjustment_after_close: {
    key: 'adjustment_after_close',
    label: 'การปรับปรุงหลังปิดงวด',
    question: 'งวดที่ล็อกแก้ผ่านรายการปรับปรุง + ผู้บริหารอนุมัติ · รายงานบริหารแสดงสุทธิในงวดเดิม',
    source: 'Q9 · B2 · U43',
  },
  customer_wht: {
    key: 'customer_wht',
    label: 'ภาษีที่ลูกค้าหัก ณ ที่จ่าย',
    question: 'บันทึกเป็นเครดิตภาษี ปิดลูกหนี้เต็มจำนวน โดยมีหนังสือรับรองจากลูกค้าเป็นหลักฐาน',
    source: 'มติ A8 · U40',
  },
  bank_fee_write_off: {
    key: 'bank_fee_write_off',
    label: 'ตัดส่วนต่างรับเงินเป็นค่าธรรมเนียมธนาคาร',
    question:
      'ลูกค้าโอนขาดไม่เกินเพดาน (ค่าเริ่มต้น ฿50) บันทึกส่วนต่างเป็นค่าธรรมเนียมธนาคารและปิดบิลเป็นชำระครบ — เพดานและการบันทึกบัญชีถูกต้องหรือไม่',
    source: 'B4 · U144',
  },
  customer_wht_bank_fee: {
    key: 'customer_wht_bank_fee',
    label: 'ลูกค้าหักภาษีและมีค่าธรรมเนียมโอนในรายการเดียว',
    question:
      'เงินเข้าขาดจากยอดหลังหักภาษีไม่เกินเพดาน ระบบนับภาษีที่ลูกค้าหักเต็มจำนวนก่อน แล้วบันทึกส่วนต่างที่เหลือเป็นค่าธรรมเนียมธนาคารและปิดบิลเป็นชำระครบ — ลำดับการบันทึกนี้ถูกต้องหรือไม่',
    source: 'B4 · U163 (ต่อยอด A1 · U144)',
  },
  bank_fee_full_tax_invoice: {
    key: 'bank_fee_full_tax_invoice',
    label: 'ใบกำกับภาษีของบิลที่ตัดส่วนต่างค่าธรรมเนียม',
    question:
      'บิลที่ปิดด้วยการตัดส่วนต่างเป็นค่าธรรมเนียมธนาคาร ออกใบเสร็จรับเงิน/ใบกำกับภาษีเต็มยอดบิลและภาษีมูลค่าเพิ่มจากมูลค่าบริการเต็ม โดยบันทึกค่าธรรมเนียมเป็นค่าใช้จ่ายของเรา (ไม่ออกใบลดหนี้) — ถูกต้องหรือไม่',
    source: 'U169 · BUG-179 (ต่อยอด U144 · U163) · ม.79 · ไม่เข้าเหตุ ม.86/10',
  },
}

/** สถานะต่อรายการที่หน้าจออ่าน — ยังไม่ยืนยัน = แสดงป้าย */
export interface SettingAssumptionStatusDto {
  key: SettingAssumptionKey
  label: string
  question: string
  confirmed: boolean
  confirmedAt: string | null
  confirmedByName: string | null
  reason: string | null
}

export const settingAssumptionConfirmSchema = z.object({
  reason: z.string().trim().min(1, 'ต้องระบุเหตุผล/อ้างอิงคำตอบของนักบัญชี').max(1000),
})

export type SettingAssumptionConfirmInput = z.infer<typeof settingAssumptionConfirmSchema>

/** รวมทะเบียนกับแถวที่ยืนยันแล้ว — ลำดับตามทะเบียน (pure) */
export function settingAssumptionStatuses(
  confirmations: readonly { assumptionKey: string; confirmedAt: Date; confirmedByName: string | null; reason: string }[],
): SettingAssumptionStatusDto[] {
  const byKey = new Map(confirmations.map((row) => [row.assumptionKey, row]))
  return SETTING_ASSUMPTION_KEYS.map((key) => {
    const row = byKey.get(key)
    const meta = SETTING_ASSUMPTIONS[key]
    return {
      key,
      label: meta.label,
      question: meta.question,
      confirmed: row !== undefined,
      confirmedAt: row?.confirmedAt.toISOString() ?? null,
      confirmedByName: row?.confirmedByName ?? null,
      reason: row?.reason ?? null,
    }
  })
}
