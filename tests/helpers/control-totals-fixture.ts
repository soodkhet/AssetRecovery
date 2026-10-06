import type { ControlTotalsInput } from '@/lib/exports/control-totals'

/**
 * ชุดข้อมูลตัวอย่างของ `00_Control_Totals.csv` (มติ PO U94 ข้อ 4) — ใช้ร่วมระหว่างเทสต์ pure กับไฟล์ตัวอย่าง
 * `reference/samples/00_Control_Totals.csv` (ไฟล์ตัวอย่างต้องประกอบจากชุดนี้ได้ตรงทุกไบต์)
 * งวด มิถุนายน 2569 · มีทั้งแถวที่นับและไม่นับในยอดสรุป (ใบยกเลิก · รับเงินก่อนงวด · เงินรอตรวจสอบที่ปิดแล้ว)
 */
const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`)

export const CONTROL_TOTALS_FIXTURE: ControlTotalsInput = {
  period: { start: D('2026-06-01'), end: D('2026-07-01') },
  generatedAt: new Date('2026-07-03T03:30:00Z'),
  revenue: [
    { companyName: 'บริษัท สยามไฟแนนซ์ จำกัด', caseRef: 'SF-2569-0412', revenueDate: D('2026-06-25'), grossSatang: 1_200_000, vatSatang: 84_000 },
    { companyName: 'บริษัท ไทยลีสซิ่ง จำกัด', caseRef: 'TL-2569-0088', revenueDate: D('2026-06-28'), grossSatang: 75_000, vatSatang: 5_250 },
  ],
  cashReceipts: [
    { receivedDate: D('2026-06-28'), payerName: 'บริษัท สยามไฟแนนซ์ จำกัด', amountSatang: 1_248_000, bankRef: 'TRF001' },
  ],
  expenses: [
    { payeeName: 'ประยุทธ์ บุญมี', category: 'ค่าตอบแทน', grossSatang: 850_000, whtSatang: 25_500, netSatang: 824_500, receiptInCompanyName: null },
    { payeeName: 'ประยุทธ์ บุญมี', category: 'ค่าที่พัก', grossSatang: 80_000, whtSatang: 0, netSatang: 80_000, receiptInCompanyName: true },
  ],
  payments: [
    { batchRef: 'PB-1', paymentDate: D('2026-06-25'), payeeName: 'ประยุทธ์ บุญมี', netSatang: 904_500, voucherRef: 'PV-2569-PB-1-001', advanceOffsetSatang: 55_000, whtPaidByPayerSatang: 0 },
  ],
  wht: [
    {
      certificateNumber: 'WHT-2569-001',
      payeeName: 'ประยุทธ์ บุญมี',
      payeeTaxId: '3100000004600',
      paymentDate: D('2026-06-25'),
      incomeType: 'ค่าจ้างทำของ มาตรา 40(8)',
      grossSatang: 850_000,
      whtSatang: 25_500,
      whtPct: '3.00',
      filingForm: 'PND3',
      payeeTitle: 'นาย',
      payeeAddress: null,
      payeeBranchCode: null,
      whtCondition: 'withhold',
    },
  ],
  bank: [
    { transactionDate: D('2026-06-28'), description: 'TRF001', amountSatang: 1_248_000, matchStatus: 'manual_matched', matchedType: 'billing_batch', matchedRef: 'x', billingBatchNumber: 'BL-2569-001' },
    { transactionDate: D('2026-06-25'), description: 'PAYOUT', amountSatang: -849_500, matchStatus: 'auto_matched', matchedType: 'payout_batch', matchedRef: 'PB-1', billingBatchNumber: null },
  ],
  adjustments: [
    { targetType: 'revenue', targetRef: 'SF-2569-0412', signedSatang: -10_000, reason: 'ลดค่าบริการ', approvedByName: 'ผู้บริหาร', approvedAt: D('2026-06-29'), billingBatchNumber: null },
  ],
  checklist: [
    { sourceModule: 'expense', sourceRef: 'EXP-1', level: 'warning', status: 'open', title: 'ใบเสร็จไม่ชัด', responsibleName: 'บัญชี' },
  ],
  creditNotes: [
    { documentType: 'CN', number: 'CN-2569-001', issueDate: D('2026-06-29'), taxInvoiceRef: 'RT-2569-0001', companyName: 'บริษัท สยามไฟแนนซ์ จำกัด', amountBeforeVatSatang: 10_000, vatSatang: 700, totalSatang: 10_700, reason: 'ลดค่าบริการ', status: 'active', adjustmentRef: 'ADJ-2569-06-001', companyBranchCode: '00000', companyTaxId: '0105560046000' },
    { documentType: 'DN', number: 'DN-2569-001', issueDate: D('2026-06-30'), taxInvoiceRef: 'RT-2569-0001', companyName: 'บริษัท สยามไฟแนนซ์ จำกัด', amountBeforeVatSatang: 5_000, vatSatang: 350, totalSatang: 5_350, reason: 'ยกเลิก', status: 'cancelled', adjustmentRef: null, companyBranchCode: '00000', companyTaxId: '0105560046000' },
  ],
  customerWht: [
    { withheldDate: D('2026-06-28'), companyName: 'บริษัท สยามไฟแนนซ์ จำกัด', companyTaxId: '0105560046000', billingRef: 'มิถุนายน 2569', taxInvoiceNumbers: ['RT-2569-0001'], withheldSatang: 36_000, certificateNumber: null, certificateDate: null, whtSatang: null, status: 'pending', billingBatchNumber: 'BL-2569-001' },
    { withheldDate: D('2026-05-20'), companyName: 'บริษัท ไทยลีสซิ่ง จำกัด', companyTaxId: null, billingRef: 'พฤษภาคม 2569', taxInvoiceNumbers: [], withheldSatang: 9_000, certificateNumber: null, certificateDate: null, whtSatang: null, status: 'pending', billingBatchNumber: null },
  ],
  suspense: [
    { transactionDate: D('2026-06-10'), description: 'ไม่ทราบที่มา', amountSatang: 50_000, suspendedAt: D('2026-06-11'), suspenseNote: 'รอตรวจ', matchStatus: 'suspense', matchedRef: null, resolvedDate: null, refundNote: null, billingBatchNumber: null },
    { transactionDate: D('2026-06-12'), description: 'คืนแล้ว', amountSatang: 20_000, suspendedAt: D('2026-06-12'), suspenseNote: 'โอนผิด', matchStatus: 'suspense_refunded', matchedRef: null, resolvedDate: D('2026-06-20'), refundNote: 'คืนผู้โอน', billingBatchNumber: null },
  ],
  taxInvoices: [
    { invoiceNumber: 'RT-2569-0001', invoiceDate: D('2026-06-28'), companyName: 'บริษัท สยามไฟแนนซ์ จำกัด', companyTaxId: '0105560046000', companyBranchCode: '00000', amountBeforeVatSatang: 1_200_000, vatSatang: 84_000, totalSatang: 1_284_000, vatRatesPct: ['7.00'], billingRef: 'มิถุนายน 2569', status: 'active', cancelledAt: null, cancelReason: null, replacedBy: null, pdfFile: 'tax_invoices/RT-2569-0001.pdf', billingBatchNumber: 'BL-2569-001', documentType: 'ใบเสร็จรับเงิน/ใบกำกับภาษี', receivedDate: D('2026-06-28') },
    { invoiceNumber: 'INV-2569-0009', invoiceDate: D('2026-05-30'), companyName: 'บริษัท ไทยลีสซิ่ง จำกัด', companyTaxId: '0105555000222', companyBranchCode: '00000', amountBeforeVatSatang: 100_000, vatSatang: 7_000, totalSatang: 107_000, vatRatesPct: ['7.00'], billingRef: 'พฤษภาคม 2569', status: 'cancelled', cancelledAt: D('2026-06-05'), cancelReason: 'ออกผิด', replacedBy: null, pdfFile: null, billingBatchNumber: null, documentType: 'ใบกำกับภาษี', receivedDate: null },
  ],
  advanceReturns: [
    { returnDate: D('2026-06-25'), advanceRef: 'ADV-3F2A9C1B', payeeName: 'ประยุทธ์ บุญมี', amountSatang: 55_000, channel: 'payout_offset', payoutBatchRef: 'PB-1', evidenceFilePath: null, reversedAt: null, reversalReason: null },
  ],
  unbilledRevenue: [
    { caseRef: 'TL-2569-0088', companyName: 'บริษัท ไทยลีสซิ่ง จำกัด', companyTaxId: '0105555000222', revenueDate: D('2026-06-28'), feeModel: 'FLAT', grossSatang: 75_000, vatSatang: 5_250, totalSatang: 80_250, vatRatePct: '7.00', draftBillingBatchNumber: null },
  ],
  accruedExpenses: [
    { expenseId: 'e-1', payeeName: 'ประวิทธิ์ มากมี', payeeTaxId: '3100000004601', category: 'ค่าตอบแทน', caseRef: 'SF-2569-0420', workDate: D('2026-06-29'), status: 'approved', grossSatang: 450_000, estimatedWhtSatang: 13_500, payoutBatchRef: null },
    { expenseId: 'e-2', payeeName: 'ประวิทธิ์ มากมี', payeeTaxId: '3100000004601', category: 'ค่าน้ำมัน', caseRef: null, workDate: D('2026-06-30'), status: 'pending_approval', grossSatang: 35_000, estimatedWhtSatang: null, payoutBatchRef: null },
  ],
  advanceBalances: [
    { payeeName: 'ประยุทธ์ บุญมี', payeeTaxId: '3100000004600', openingSatang: 55_000, paidSatang: 300_000, clearedSatang: 245_000, returnedOffsetSatang: 55_000, returnedDirectSatang: 0, closingSatang: 55_000, advanceRefs: ['ADV-3F2A9C1B', 'ADV-7D41E0AA'] },
  ],
  companyDocuments: [
    { companyName: 'บจก. ตัวอย่าง ลิสซิ่ง', companyTaxId: '0105555000001', documentType: 'company_certificate', documentName: 'หนังสือรับรองบริษัท', version: 2, issuedDate: new Date('2026-09-01T00:00:00Z'), originalName: 'หนังสือรับรอง-2569.pdf', fileSha256: '9f2c4a1e6b3d8f70a5c2e1d4b6a8f0c3e5d7b9a1c3e5f7092b4d6f8a0c2e4f61', uploadedAt: new Date('2026-09-05T03:00:00Z'), warnings: [] },
    { companyName: 'บจก. ตัวอย่าง แคปปิตอล', companyTaxId: '0105555000002', documentType: null, documentName: null, version: null, issuedDate: null, originalName: null, fileSha256: null, uploadedAt: null, warnings: ['ยังไม่มีหนังสือรับรองบริษัท', 'ยังไม่มี ภ.พ.20 ของบริษัท'] },
  ],
  // มติ PO U144 — บิล ฿10,700 ลูกค้าหัก WHT ฿300 โอนมา ฿10,375 ⇒ ขาด ฿25 (≤ เพดาน ฿50) ตัดเป็นค่าธรรมเนียมธนาคาร
  bankFeeWriteOffs: [
    { writeOffDate: D('2026-06-29'), companyName: 'บจก. ตัวอย่าง ลิสซิ่ง', companyTaxId: '0105555000001', billingRef: 'BL-2569-004', billedTotalSatang: 1_070_000, receivedSatang: 1_037_500, customerWhtSatang: 30_000, bankFeeSatang: 2_500 },
  ],
}
