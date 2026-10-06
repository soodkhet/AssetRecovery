import type { DocumentNumberType } from '@/lib/generated/prisma/enums'

/**
 * ทะเบียน "ตัวอย่างเอกสารทั้งหมด" (มติ PO U104 — เมนูบัญชี → เมนูย่อย) — **pure ล้วน ใช้ร่วม FE/BE**
 *
 * 1 แถว = 1 ตัวอย่างที่เรนเดอร์จาก PDF renderer ตัวจริงของระบบด้วยข้อมูลสมมติ (`components/pdf/document-samples.tsx`)
 * คำอธิบาย ใครได้รับ / ออกเมื่อ / จำนวนฉบับ / ผู้เซ็น ถอดจากตารางเอกสาร (`28` §6.0.1 · §6.1) + mockup `reference/documents.html`
 * ⚠️ ข้อความทุกช่องเป็นข้อความที่ผู้ใช้เห็น — ห้ามมีเลขอ้างอิงสเปค (Rule 05)
 */

export const DOCUMENT_SAMPLE_TYPES = [
  'billing-invoice',
  'receipt-tax-invoice',
  'receipt-tax-invoice-replacement',
  'receipt-tax-invoice-partial',
  'handover-note',
  'payment-voucher',
  'payslip',
  'advance-request',
  'advance-return',
  'substitute-receipt',
  'wht-certificate',
  'payout-summary',
  'pack-cover',
] as const

export type DocumentSampleType = (typeof DOCUMENT_SAMPLE_TYPES)[number]

export type DocumentSampleGroup = 'customer' | 'payout' | 'advance' | 'internal'

export const DOCUMENT_SAMPLE_GROUP_LABEL: Readonly<Record<DocumentSampleGroup, string>> = {
  customer: 'เอกสารถึงบริษัทไฟแนนซ์',
  payout: 'การจ่ายเงินและภาษีหัก ณ ที่จ่าย',
  advance: 'เงินทดรอง',
  internal: 'เอกสารภายใน',
}

export interface DocumentSampleInfo {
  type: DocumentSampleType
  group: DocumentSampleGroup
  title: string
  /** ตัวอย่างย่อยของเอกสารชนิดเดียวกัน (ฉบับออกแทน / รับบางส่วน) */
  variant: string | null
  recipients: string
  issuedWhen: string
  copies: string
  signers: string
  /** ชุดเลขที่เอกสารที่ใช้แสดงเลขตัวอย่าง — `null` = เอกสารไม่มีเลขจากชุดเลข */
  numberSeries: DocumentNumberType | null
}

export const DOCUMENT_SAMPLES: readonly DocumentSampleInfo[] = [
  {
    type: 'billing-invoice',
    group: 'customer',
    title: 'ใบแจ้งหนี้ / ใบวางบิล',
    variant: null,
    recipients: 'บริษัทไฟแนนซ์ (ต้นฉบับ) · ฝ่ายการเงินเก็บสำเนา',
    issuedWhen: 'ตอนส่งรอบวางบิล — ไม่ใช่เอกสารภาษี (ไม่นับเป็นภาษีขาย)',
    copies: 'ต้นฉบับ + สำเนา',
    signers: 'ผู้วางบิล/ผู้ให้บริการ · ผู้รับวางบิล/ลูกค้า',
    numberSeries: 'billing_batch',
  },
  {
    type: 'receipt-tax-invoice',
    group: 'customer',
    title: 'ใบเสร็จรับเงิน / ใบกำกับภาษี',
    variant: null,
    recipients: 'บริษัทไฟแนนซ์ (ต้นฉบับ) · สำเนาเข้าชุดเอกสารบัญชี (รายงานภาษีขาย)',
    issuedWhen: 'ตอนบันทึกรับเงินจากบริษัทไฟแนนซ์ — รับ 1 ครั้ง = 1 ฉบับ เลขเรียงต่อเนื่อง',
    copies: 'ต้นฉบับ + สำเนา',
    signers: 'ผู้รับเงิน · ผู้มีอำนาจลงนาม',
    numberSeries: 'tax_invoice',
  },
  {
    type: 'receipt-tax-invoice-replacement',
    group: 'customer',
    title: 'ใบเสร็จรับเงิน / ใบกำกับภาษี',
    variant: 'ฉบับออกแทน',
    recipients: 'บริษัทไฟแนนซ์ (ต้นฉบับ) · สำเนาเข้าชุดเอกสารบัญชี',
    issuedWhen: 'เมื่อยกเลิกฉบับเดิมที่ข้อมูลผิด แล้วออกใหม่ — พิมพ์แถบ "ออกแทนฉบับเลขที่…" พร้อมเหตุผล',
    copies: 'ต้นฉบับ + สำเนา',
    signers: 'ผู้รับเงิน · ผู้มีอำนาจลงนาม',
    numberSeries: 'tax_invoice',
  },
  {
    type: 'receipt-tax-invoice-partial',
    group: 'customer',
    title: 'ใบเสร็จรับเงิน / ใบกำกับภาษี',
    variant: 'รับชำระบางส่วน',
    recipients: 'บริษัทไฟแนนซ์ (ต้นฉบับ) · สำเนาเข้าชุดเอกสารบัญชี',
    issuedWhen: 'เมื่อรับเงินไม่เต็มยอดใบแจ้งหนี้ — ระบุครั้งที่รับ และยอดคงค้างตามใบแจ้งหนี้',
    copies: 'ต้นฉบับ + สำเนา',
    signers: 'ผู้รับเงิน · ผู้มีอำนาจลงนาม',
    numberSeries: 'tax_invoice',
  },
  {
    type: 'handover-note',
    group: 'customer',
    title: 'ใบส่งมอบทรัพย์',
    variant: null,
    recipients: 'บริษัทไฟแนนซ์ 1 ฉบับ + คลังเก็บ 1 ฉบับ — ฉบับที่เซ็นแล้วสแกนแนบในล็อตเป็นหลักฐาน',
    issuedWhen: 'ตอนเตรียมส่งมอบล็อต — การยืนยันล็อตทำให้เกิดรายได้ของเคส',
    copies: '2 ฉบับ (ต้นฉบับ / สำเนา)',
    signers: 'ผู้ส่งมอบ · ผู้รับมอบ',
    numberSeries: 'delivery_note',
  },
  {
    type: 'payment-voucher',
    group: 'payout',
    title: 'ใบสำคัญจ่าย',
    variant: null,
    recipients: 'ฝ่ายการเงินเก็บ + เข้าชุดเอกสารบัญชี (หลักฐานรายจ่าย) — ผู้รับเงินเซ็นรับ',
    issuedWhen: 'ตอนรอบจ่ายยืนยันการโอนสำเร็จ (1 ใบต่อผู้รับเงินต่อรอบ)',
    copies: 'ต้นฉบับเดียว',
    signers: 'ผู้จัดทำ · ผู้อนุมัติ · ผู้รับเงิน',
    numberSeries: 'payment_voucher',
  },
  {
    type: 'payslip',
    group: 'payout',
    title: 'สลิปค่าตอบแทน',
    variant: null,
    recipients: 'พนักงานภาคสนาม (ดาวน์โหลดจากหน้าค่าตอบแทนของตนเอง)',
    issuedWhen: 'ตอนรอบจ่ายยืนยันการโอนสำเร็จ',
    copies: 'ไม่มีป้ายฉบับ',
    signers: 'ไม่ต้องลงลายมือชื่อ (ออกโดยระบบ)',
    numberSeries: 'payment_voucher',
  },
  {
    type: 'wht-certificate',
    group: 'payout',
    title: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)',
    variant: null,
    recipients: 'ผู้ถูกหักภาษี (ฉบับที่ 1 แนบแบบแสดงรายการ / ฉบับที่ 2 เก็บเป็นหลักฐาน) · สำเนาเข้าชุดเอกสารบัญชี',
    issuedWhen: 'ตอนรอบจ่ายยืนยันการโอนสำเร็จ — ใช้แบบฟอร์มทางการของกรมสรรพากร',
    copies: '2 ฉบับ (ฉบับที่ 1 / ฉบับที่ 2)',
    signers: 'ผู้จ่ายเงิน (ผู้มีหน้าที่หักภาษี ณ ที่จ่าย)',
    numberSeries: 'wht_certificate',
  },
  {
    type: 'advance-request',
    group: 'advance',
    title: 'ใบเบิกเงินทดรอง',
    variant: null,
    recipients: 'ฝ่ายการเงินเก็บต้นฉบับ (ผู้เบิกเซ็น) · ผู้เบิกได้สำเนา',
    issuedWhen: 'หลังอนุมัติเงินทดรอง',
    copies: 'ต้นฉบับเดียว',
    signers: 'ผู้เบิก · ผู้อนุมัติ · ผู้จ่ายเงิน',
    numberSeries: 'advance',
  },
  {
    type: 'advance-return',
    group: 'advance',
    title: 'ใบรับคืนเงินทดรอง',
    variant: null,
    recipients: 'ผู้เบิก (ต้นฉบับ) · ฝ่ายการเงินเก็บสำเนาเข้าชุดเอกสารบัญชี',
    issuedWhen: 'ตอนรับเงินคืนแยก หรือเมื่อรอบจ่ายที่หักกลบยืนยันการโอนสำเร็จ',
    copies: 'ต้นฉบับเดียว',
    signers: 'ผู้รับเงิน (การเงิน) · ผู้คืนเงิน',
    numberSeries: 'advance_return',
  },
  {
    type: 'substitute-receipt',
    group: 'advance',
    title: 'ใบรับรองแทนใบเสร็จรับเงิน',
    variant: null,
    recipients: 'แนบเป็นหลักฐานรายจ่ายในชุดเอกสารบัญชี — ผู้เบิกเซ็นรับรอง แล้วอัปโหลดฉบับเซ็นกลับเข้าระบบ',
    issuedWhen: 'ตอนเคลียร์เงินทดรอง / เบิกค่าใช้จ่ายที่ไม่มีใบเสร็จ',
    copies: 'ต้นฉบับเดียว',
    signers: 'ผู้เบิกจ่าย · ผู้อนุมัติ',
    numberSeries: 'substitute_receipt',
  },
  {
    type: 'payout-summary',
    group: 'internal',
    title: 'สรุปรอบจ่ายเงิน',
    variant: null,
    recipients: 'ใช้ภายใน (การเงิน / บัญชี / ผู้บริหาร)',
    issuedWhen: 'ก่อนตัดโอนเงินของรอบจ่าย',
    copies: 'เอกสารภายใน',
    signers: 'ผู้จัดทำ (การเงิน) · ผู้อนุมัติโอนเงิน',
    numberSeries: null,
  },
  {
    type: 'pack-cover',
    group: 'internal',
    title: 'หน้าปกชุดเอกสารบัญชี',
    variant: null,
    recipients: 'สำนักงานบัญชี — เป็นไฟล์แรกของชุดเอกสารส่งมอบรายเดือน',
    issuedWhen: 'ตอนสร้างชุดเอกสารส่งสำนักงานบัญชี',
    copies: 'เอกสารภายใน',
    signers: 'ผู้จัดทำ (บัญชี) · ผู้อนุมัติส่งมอบ',
    numberSeries: null,
  },
]

export function isDocumentSampleType(value: string): value is DocumentSampleType {
  return (DOCUMENT_SAMPLE_TYPES as readonly string[]).includes(value)
}

export function documentSampleInfo(type: DocumentSampleType): DocumentSampleInfo {
  const info = DOCUMENT_SAMPLES.find((each) => each.type === type)
  if (info === undefined) throw new Error(`documentSampleInfo: ไม่รู้จักชนิด ${type}`)
  return info
}

/** ชื่อไฟล์ดาวน์โหลด — ขึ้นต้น "ตัวอย่าง" เสมอ กันสับสนกับเอกสารจริง */
export function documentSampleFileName(type: DocumentSampleType): string {
  return `ตัวอย่าง-${type}.pdf`
}

/** capability ที่เปิดดูหน้าตัวอย่างเอกสาร (มติ PO U104) — สตริงตรง ๆ เพราะไฟล์นี้ถูก import ฝั่ง client */
export const DOCUMENT_SAMPLES_CAPABILITY = 'view_document_samples'

/** ผลของ `GET /api/accounting/document-samples` */
export interface DocumentSampleListItemDto extends DocumentSampleInfo {
  /** เลขที่ตัวอย่าง = "เลขถัดไป" ตามค่าตั้งเลขที่เอกสารปัจจุบัน (แสดงเท่านั้น ไม่เดินตัวนับ) */
  sampleNumber: string | null
  /** รูปแบบเลข เช่น `INV-{พ.ศ.}-NNNN` */
  numberPattern: string | null
}
