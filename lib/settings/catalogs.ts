/**
 * รายการ read-only ของไฟล์ 13 — **pure ล้วน (ค่าคงที่ถอดจาก spec ตรงตัว)**
 *
 *  · §6.7 Internal Document Templates — เอกสารภายในที่ระบบสร้างอัตโนมัติ (แก้รูปแบบจริงที่ไฟล์ 28)
 *  · §6.9 Export Format — ไฟล์มาตรฐานของ Accounting Pack 01–08 (รายละเอียดเต็มที่ `37` §6.1)
 *
 * ทั้งสองหมวดไม่มีตารางใน `02` เพราะเป็น "รายการที่ระบบรู้จัก" ไม่ใช่ข้อมูลที่ผู้ใช้เพิ่มได้ —
 * endpoint จึงเป็น **GET อย่างเดียว** ตรงตาม `13` §13 / `27` §6.1
 */

export interface InternalDocumentTemplate {
  code: string
  name: string
  /** ใช้เมื่อไหร่ (`13` §6.7) */
  usage: string
  /** ไฟล์ spec ที่กำหนดรูปแบบ PDF จริง */
  sourceFile: string
}

export const INTERNAL_DOCUMENT_TEMPLATES: readonly InternalDocumentTemplate[] = [
  {
    code: 'internal_billing_summary',
    name: 'Internal Billing Summary',
    usage: 'สรุปยอดวางบิลภายใน ก่อนออกเอกสารทางการ',
    sourceFile: '28',
  },
  {
    code: 'payout_batch_summary',
    name: 'Payout Batch Summary',
    usage: 'สรุปรอบจ่ายเงินก่อนโอน',
    sourceFile: '28',
  },
  {
    code: 'payment_voucher',
    name: 'Payment Voucher ภายใน',
    usage: 'หลังจ่ายเงินสำเร็จ — เก็บเป็นหลักฐานภายใน',
    sourceFile: '28',
  },
  {
    code: 'compensation_statement',
    name: 'Compensation Statement / Payslip',
    usage: 'สรุปค่าตอบแทนต่อพนักงาน/รอบ',
    sourceFile: '28',
  },
  {
    code: 'accounting_pack_cover',
    name: 'Accounting Pack Cover Sheet',
    usage: 'หน้าปกชุดเอกสารส่งสำนักงานบัญชีรายเดือน',
    sourceFile: '28',
  },
]

export interface ExportFormatSpec {
  /** ชื่อไฟล์ในชุด Export Pack — เรียงเลขต่อเนื่อง 01–08 ห้ามขาด (`37` §6.1) */
  fileName: string
  format: 'CSV UTF-8' | 'XLSX'
  content: string
  /** ไฟล์ spec ต้นทางของข้อมูล */
  sourceFile: string
}

export const EXPORT_FORMATS: readonly ExportFormatSpec[] = [
  {
    fileName: '01_Revenue.csv',
    format: 'CSV UTF-8',
    content: 'รายการรายได้ — company, case_ref, revenue_date, gross, vat_flag',
    sourceFile: '19',
  },
  {
    fileName: '02_Cash_Receipts.csv',
    format: 'CSV UTF-8',
    content: 'รายการเงินรับ — receipt_date, payer, amount, bank_ref',
    sourceFile: '31',
  },
  {
    fileName: '03_Expenses.csv',
    format: 'CSV UTF-8',
    content: 'รายการค่าใช้จ่าย — payee, category, gross, wht, net',
    sourceFile: '32',
  },
  {
    fileName: '04_Payments.csv',
    format: 'CSV UTF-8',
    content: 'รายการจ่ายเงินจริง',
    sourceFile: '17',
  },
  {
    fileName: '05_WHT_Data.csv',
    format: 'CSV UTF-8',
    content: 'ข้อมูลหัก ณ ที่จ่าย — `payee_tax_id` เป็นตัวเลข 13 หลักล้วนไม่มีขีดคั่น (DEC-006/D10)',
    sourceFile: '33',
  },
  {
    fileName: '06_Bank_Reconciliation.csv',
    format: 'CSV UTF-8',
    content:
      'ผลกระทบยอดธนาคาร — column `status` ใช้ค่า enum เต็ม 4 ค่า (auto_matched/manual_matched/unmatched/unmatched_resolved)',
    sourceFile: '35',
  },
  {
    fileName: '07_Adjustment_Log.csv',
    format: 'CSV UTF-8',
    content: 'รายการปรับปรุงยอดทั้งหมดของรอบนั้น',
    sourceFile: '20',
  },
  {
    fileName: '08_Document_Checklist.xlsx',
    format: 'XLSX',
    content: 'source_ref, doc_status, issue',
    sourceFile: '34',
  },
]
