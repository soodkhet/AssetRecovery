import { formatThaiAddressLine } from '@/lib/address/address-value'
import { fmtSatang } from '@/lib/format/money'
import { letterheadContactLine, letterheadTaxLine, type DocLetterhead } from '@/lib/organization/profile'
import { bahtInWords } from '@/lib/payout/baht-text'

/**
 * โครงข้อมูลกลางของเอกสาร "แบบใบเสร็จ" ตาม mockup `reference/documents.html` (มติ PO U100/U101) —
 * ใบเบิกเงินทดรอง · ใบรับคืนเงินทดรอง · ใบรับรองแทนใบเสร็จรับเงิน — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * เลย์เอาต์: หัวเอกสารกลาง (โลโก้/ข้อมูลองค์กร) → ชื่อเอกสาร + ฉบับ → วันที่ (พ.ศ.) / เลขที่ → กล่องสองฝ่าย →
 * ตารางรายการ → รวม + จำนวนเงินตัวอักษร → ลายเซ็น → เลขหน้า
 * ⚠️ ทุกค่าเป็น **ข้อความที่ประกอบเสร็จแล้ว** (พ.ศ. / คั่นหลักพัน) — component PDF ห้าม format/คำนวณเอง (Rule 01)
 */

export interface ReceiptDocParty {
  /** "จ่ายโดย" / "ผู้เบิก" / "ชำระโดย" … */
  label: string
  name: string
  lines: string[]
}

export type ReceiptDocAlign = 'left' | 'center' | 'right'

export interface ReceiptDocColumn {
  header: string
  /** ความกว้างเป็นสัดส่วนของตาราง เช่น `'8%'` — ทุกคอลัมน์รวมกัน 100% */
  width: string
  align: ReceiptDocAlign
}

export interface ReceiptDocRow {
  cells: string[]
  /** บรรทัดรองสีเทาใต้ช่องรายละเอียด (คอลัมน์ที่ 2) */
  sub?: string | null
  /** แถวหักลบ (ยอดในวงเล็บ · พิมพ์สีแดงตามแบบ) */
  deduct?: boolean
}

export interface ReceiptDocSummary {
  label: string
  value: string
  tone: 'sub' | 'total' | 'deduct'
}

export interface ReceiptDocChoice {
  label: string
  checked: boolean
}

export interface ReceiptStyleDoc {
  title: string
  titleEn: string
  /** "(ต้นฉบับ / Original)" — `null` = ไม่พิมพ์ป้ายฉบับ */
  copyLabel: string | null
  dateText: string
  number: string
  meta: Array<{ label: string; value: string }>
  parties: [ReceiptDocParty, ReceiptDocParty]
  columns: ReceiptDocColumn[]
  rows: ReceiptDocRow[]
  /** บรรทัดข้อมูลเต็มแถวหลังรายการ เช่น "ช่องทางการจ่ายเงิน : โอนเข้าบัญชี …" */
  infoLine: { label: string; text: string } | null
  /** ตัวเลือกช่องทางแบบช่องติ๊ก (ใบรับคืน) */
  choices: { label: string; options: ReceiptDocChoice[] } | null
  summary: ReceiptDocSummary[]
  /** "-สามพันบาทถ้วน-" */
  wordsText: string
  /** คำรับรอง (ใบรับรองแทนใบเสร็จ) */
  certification: string | null
  note: string | null
  signatures: Array<{ role: string; name: string | null }>
  /** ป้าย "ยกเลิก" (เช่น ใบรับคืนที่กลับรายการแล้ว) */
  cancelled: { title: string; detail: string } | null
  footerLeft: string
}

/** ป้ายฉบับของเอกสาร "ต้นฉบับเดียว" (มติ PO U101) */
export const ORIGINAL_COPY_LABEL = '(ต้นฉบับ / Original)'

/** ยอดเงินบนเอกสาร "1,234.50" */
export function docMoney(satang: number): string {
  return fmtSatang(satang)
}

/** ยอดหักบนเอกสาร "(1,234.50)" */
export function docDeduct(satang: number): string {
  return `(${fmtSatang(satang)})`
}

/** "จำนวนเงิน: -สามพันบาทถ้วน-" ของยอดรวม */
export function docWords(satang: number): string {
  return `จำนวนเงิน: -${bahtInWords(satang)}-`
}

/**
 * ฝ่ายองค์กร (ผู้ออกเอกสาร) จากหัวเอกสารกลาง — ที่อยู่ / ติดต่อ / เลขผู้เสียภาษี + สาขา
 * (ลำดับเดียวกับ `letterheadPartyLines()` ของเอกสารอื่น)
 */
export function organizationDocParty(label: string, letterhead: DocLetterhead): ReceiptDocParty {
  const lines = [
    letterhead.address === '' ? null : letterhead.address,
    letterheadContactLine(letterhead),
    letterheadTaxLine(letterhead),
  ].filter((line): line is string => line !== null)
  return { label, name: letterhead.nameTh, lines }
}

/** ข้อมูลผู้รับเงิน (พนักงาน) ที่เอกสารใช้ — จาก `payee_profiles` + ผู้ใช้ */
export interface DocPayeeSource {
  fullName: string
  nameTitle: string | null
  phone: string | null
  nationalId: string | null
  addressDetail: string | null
  addressSubdistrict: string | null
  addressDistrict: string | null
  addressProvince: string | null
  addressPostalCode: string | null
  bankName?: string | null
  accountNumber?: string | null
}

/** ชื่อเต็มพร้อมคำนำหน้า (ถ้ามี และชื่อยังไม่ขึ้นต้นด้วยคำนำหน้านั้น) */
export function payeeDisplayName(payee: Pick<DocPayeeSource, 'fullName' | 'nameTitle'>): string {
  const title = (payee.nameTitle ?? '').trim()
  const name = payee.fullName.trim()
  return title === '' || name.startsWith(title) ? name : `${title}${name}`
}

/** "กสิกรไทย 123-4-56789-0" — ไม่มีข้อมูลธนาคาร = `null` */
export function payeeBankLine(payee: Pick<DocPayeeSource, 'bankName' | 'accountNumber'>): string | null {
  const bank = (payee.bankName ?? '').trim()
  const account = (payee.accountNumber ?? '').trim()
  if (bank === '' && account === '') return null
  return [bank, account].filter((part) => part !== '').join(' ')
}

/** ฝ่ายพนักงาน — โทร / ที่อยู่ / เลขประจำตัวประชาชน (+ บรรทัดเพิ่ม เช่น บัญชีรับโอน) */
export function payeeDocParty(label: string, payee: DocPayeeSource, extra: readonly string[] = []): ReceiptDocParty {
  const address = formatThaiAddressLine({
    detail: payee.addressDetail,
    subdistrict: payee.addressSubdistrict,
    district: payee.addressDistrict,
    province: payee.addressProvince,
    postalCode: payee.addressPostalCode,
  })
  const nationalId = (payee.nationalId ?? '').trim()
  const lines = [
    payee.phone === null || payee.phone.trim() === '' ? null : `โทร. ${payee.phone.trim()}`,
    address,
    nationalId === '' ? null : `เลขประจำตัวประชาชน ${nationalId}`,
    ...extra,
  ].filter((line): line is string => line !== null)
  return { label, name: payeeDisplayName(payee), lines }
}
