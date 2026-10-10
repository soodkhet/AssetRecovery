/**
 * รายการ read-only ของไฟล์ 13 — **pure ล้วน (ค่าคงที่ถอดจาก spec ตรงตัว)**
 *
 *  · §6.7 Internal Document Templates — เอกสารภายในที่ระบบสร้างอัตโนมัติ (แก้รูปแบบจริงที่ไฟล์ 28)
 *  · §6.9 Export Format — ไฟล์มาตรฐานของ Accounting Pack 00–18 (รายละเอียดเต็มที่ `37` §6.1 · 00/15/16 = มติ PO U94 · 17 = U132 · 18 = U144)
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
  /**
   * ชื่อไฟล์ในชุด Export Pack — เรียงเลขต่อเนื่อง 00–18 ห้ามขาด (`37` §6.1 · 09 = มติ PO U21 · 10/11 = U40/U41 ·
   * 12/13 = U57/U68 · 14 = U87 · 00/15/16 = U94 · 17 = U132 · 18 = U144)
   */
  fileName: string
  format: 'CSV UTF-8' | 'XLSX'
  content: string
  /** ไฟล์ spec ต้นทางของข้อมูล */
  sourceFile: string
}

export const EXPORT_FORMATS: readonly ExportFormatSpec[] = [
  // มติ PO 06/10/2569 U94 ข้อ 4 — ยอดรวมควบคุมของทั้งชุด
  {
    fileName: '00_Control_Totals.csv',
    format: 'CSV UTF-8',
    content:
      'ยอดรวมควบคุม — จำนวนแถว + ผลรวมคอลัมน์เงินหลักของทุกไฟล์ และยอดสรุปของงวด (รายได้ก่อน VAT, VAT ขาย, รับเงิน, ภาษีลูกค้าหัก, จ่ายออก, WHT, ค้างจ่าย, ค้างรับ, เงินรอตรวจสอบ, เงินทดรองคงเหลือ)',
    sourceFile: '37',
  },
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
    content:
      'รายการค่าใช้จ่าย — payee, category, gross, wht, net, ใบเสร็จค่าที่พักในนามบริษัท + expense_id, work_date, payment_date, payout_batch_ref, voucher_ref, case_ref, cost_center, receipt_file',
    sourceFile: '32',
  },
  {
    fileName: '04_Payments.csv',
    format: 'CSV UTF-8',
    content: 'รายการจ่ายเงินจริง (+ PDF ใบสำคัญจ่าย/สลิปค่าตอบแทนในโฟลเดอร์ vouchers/)',
    sourceFile: '17',
  },
  {
    fileName: '05_WHT_Data.csv',
    format: 'CSV UTF-8',
    content:
      'ข้อมูลหัก ณ ที่จ่าย — `payee_tax_id` เป็นตัวเลข 13 หลักล้วนไม่มีขีดคั่น (+ PDF 50 ทวิ ในโฟลเดอร์ wht_certificates/)' /* DEC-006/D10 */,
    sourceFile: '33',
  },
  {
    fileName: '06_Bank_Reconciliation.csv',
    format: 'CSV UTF-8',
    content:
      'ผลกระทบยอดธนาคาร — column `status` ใช้ค่า enum เต็ม 6 ค่า (auto_matched/manual_matched/unmatched/unmatched_resolved/suspense/suspense_refunded)',
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
  {
    fileName: '09_Credit_Notes.csv',
    format: 'CSV UTF-8',
    content: 'ใบลดหนี้/ใบเพิ่มหนี้ที่ออกในรอบ — document_type, number, tax_invoice_ref, amount, vat, company_tax_id',
    sourceFile: '31',
  },
  // มติ PO 05/10/2569 U40 — ภาษีที่ลูกค้าหักเรา + สถานะหนังสือ 50 ทวิ
  {
    fileName: '10_Customer_WHT.csv',
    format: 'CSV UTF-8',
    content: 'ภาษีที่ลูกค้าหัก ณ ที่จ่าย + สถานะหนังสือ 50 ทวิ — company, withheld, cert_no, cert_date, status, cert_file_name',
    sourceFile: '31',
  },
  // มติ PO 05/10/2569 U41 — เงินรับรอตรวจสอบ (ไม่ทราบที่มา)
  {
    fileName: '11_Suspense_Receipts.csv',
    format: 'CSV UTF-8',
    content: 'เงินรับรอตรวจสอบ — amount, reason, status, resolved_ref, refund_date',
    sourceFile: '35',
  },
  // มติ PO 05/10/2569 U57 — ใบกำกับภาษีที่ออก/ยกเลิกในรอบ (+ สำเนา PDF ในโฟลเดอร์ tax_invoices/ ของ zip)
  {
    fileName: '12_Tax_Invoices.csv',
    format: 'CSV UTF-8',
    content:
      'ใบเสร็จรับเงิน/ใบกำกับภาษีที่ออก/ยกเลิกในรอบ — invoice_number, invoice_date, company, company_tax_id, before_vat, vat, total, vat_rate_pct, status, replaced_by (+ PDF ในโฟลเดอร์ tax_invoices/ · ใบแจ้งหนี้ใน billing_invoices/)',
    sourceFile: '31',
  },
  // มติ PO 05/10/2569 U68 — รับคืนเงินทดรอง (หักกลบในรอบจ่าย / รับคืนแยก)
  {
    fileName: '13_Advance_Returns.csv',
    format: 'CSV UTF-8',
    content: 'รับคืนเงินทดรอง — return_date, advance_ref, payee, amount, channel (payout_offset/cash/bank_transfer), payout_batch_ref, status',
    sourceFile: '15',
  },
  // มติ PO 06/10/2569 U87 — รายได้ค้างรับ (ส่งมอบแล้ว ยังไม่วางบิล ณ วันสร้างชุด)
  {
    fileName: '14_Unbilled_Revenue.csv',
    format: 'CSV UTF-8',
    content:
      'รายได้ค้างรับ (ส่งมอบแล้ว ยังไม่วางบิล) — case_ref, company, company_tax_id, delivered_date, fee_model, before_vat, vat, total, vat_rate_pct, billing_batch_number (รอบร่าง)',
    sourceFile: '19',
  },
  // มติ PO 06/10/2569 U94 ข้อ 2 — ค่าใช้จ่ายค้างจ่าย ณ สิ้นงวด (ภาพ ณ เวลาสร้างชุด)
  {
    fileName: '15_Accrued_Expenses.csv',
    format: 'CSV UTF-8',
    content:
      'ค่าตอบแทน/ค่าใช้จ่ายค้างจ่าย ณ สิ้นงวด — expense_id, payee, payee_tax_id, category, case_ref, work_date, status, gross, estimated_wht, payout_batch_ref',
    sourceFile: '17',
  },
  // มติ PO 06/10/2569 U94 ข้อ 3 — เงินทดรองต่อคน
  {
    fileName: '16_Advance_Balance.csv',
    format: 'CSV UTF-8',
    content:
      'เงินทดรองต่อคน — payee, payee_tax_id, ยอดยกมา, จ่าย, ใช้/เคลียร์, คืน (หักกลบ/รับแยก), คงเหลือสิ้นงวด, advance_refs',
    sourceFile: '15',
  },
  // มติ PO 07/10/2569 U132 — รายการเอกสารบริษัทไฟแนนซ์ (ภาพ ณ เวลาสร้างชุด)
  {
    fileName: '17_Company_Documents.csv',
    format: 'CSV UTF-8',
    content:
      'เอกสารบริษัทไฟแนนซ์เวอร์ชันปัจจุบัน — company, company_tax_id, ชนิดเอกสาร, ชื่อเอกสาร, เวอร์ชัน, วันที่ออก, ชื่อไฟล์, SHA-256, วันที่แนบ, คำเตือนเอกสารไม่ครบ',
    sourceFile: '10',
  },
  // มติ PO 07/10/2569 U144 — ส่วนต่างรับชำระขาดไม่เกินเพดานที่ตัดเป็นค่าธรรมเนียมธนาคาร
  {
    fileName: '18_Bank_Fee_Write_Offs.csv',
    format: 'CSV UTF-8',
    content:
      'ค่าธรรมเนียมธนาคารที่ตัดจากส่วนต่างรับชำระขาด (ไม่เกินเพดาน) — วันที่ตัด, company, company_tax_id, เลขรอบวางบิล, ยอดบิล, รับจริง, ภาษีลูกค้าหัก, ค่าธรรมเนียม',
    sourceFile: '19',
  },
]
