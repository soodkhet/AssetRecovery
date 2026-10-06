import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CSV_BOM } from '@/lib/exports/csv'
import {
  adjustmentCsv,
  adjustmentRef,
  bankDirection,
  bankReconCsv,
  canTransitionExport,
  cashReceiptCsv,
  CHECKLIST_AUTHORIZED_PENDING,
  checklistDocStatus,
  checklistRows,
  checklistSheet,
  checklistSummary,
  expenseCsv,
  receiptInCompanyNameCell,
  exportVersionLabel,
  normalizeTaxId,
  packAttemptId,
  packStoragePath,
  packZipFileName,
  packZipDownloadName,
  isSafeStorageKey,
  paymentCsv,
  payeesMissingTaxId,
  revenueCsv,
  whtCsv,
  whtReversalRow,
  whtPctText,
  ADJUSTMENT_HEADERS,
  BANK_RECON_HEADERS,
  CASH_RECEIPT_HEADERS,
  CHECKLIST_HEADERS,
  CREDIT_NOTE_HEADERS,
  creditNoteCsv,
  ACCRUED_EXPENSE_HEADERS,
  ACCRUED_EXPENSE_STATUSES,
  accruedExpenseCsv,
  ADVANCE_BALANCE_HEADERS,
  COMPANY_DOCUMENT_HEADERS,
  companyDocumentCsv,
  advanceBalanceCsv,
  buildPackCoverDoc,
  createPackPdfBudget,
  packFileRangeLabel,
  packNotAttachedFile,
  packNotAttachedText,
  packAttachmentCount,
  packPdfEntryName,
  packPdfRef,
  PACK_ATTACHMENT_NOTE,
  CUSTOMER_WHT_HEADERS,
  customerWhtCsv,
  SUSPENSE_HEADERS,
  suspenseCsv,
  ADVANCE_RETURN_HEADERS,
  advanceReturnCsv,
  evidenceFileName,
  TAX_INVOICE_HEADERS,
  taxInvoiceCsv,
  UNBILLED_REVENUE_HEADERS,
  unbilledRevenueCsv,
  taxInvoiceNotAttachedText,
  taxInvoicePdfEntryName,
  vatRatesText,
  EXPENSE_HEADERS,
  PACK_COVER_FILE_NAME,
  PACK_FILES,
  PAYMENT_HEADERS,
  REVENUE_HEADERS,
  WHT_HEADERS,
  type ChecklistExportRow,
  type WhtExportRow,
} from '@/lib/exports/pack'
import {
  buildControlTotals,
  controlTotalsCsv,
  controlTotalsForCover,
  CONTROL_TOTALS_HEADERS,
} from '@/lib/exports/control-totals'
import { CONTROL_TOTALS_FIXTURE } from '@/tests/helpers/control-totals-fixture'

/**
 * "format ต้องตรง `reference/samples/`" — เทสต์อ่านไฟล์ตัวอย่างจริงมาเทียบหัวคอลัมน์
 * (ตัวอย่างเปลี่ยน = เทสต์แดงทันที ไม่ต้องรอสำนักงานบัญชีทัก)
 */
function sampleHeader(fileName: string): string[] {
  const path = fileURLToPath(new URL(`../../reference/samples/${fileName}`, import.meta.url))
  const text = readFileSync(path, 'utf8')
  expect(text.startsWith(CSV_BOM), `${fileName}: ตัวอย่างต้องมี BOM`).toBe(true)
  return (text.slice(CSV_BOM.length).split('\r\n')[0] ?? '').split(',')
}

describe('รายชื่อไฟล์มาตรฐาน (`37` §6.1)', () => {
  it('ครบ 18 ไฟล์ เลข 00–17 ต่อเนื่องไม่มีช่องว่าง (17 = U132 · 09 = มติ PO U21 · 10/11 = U40/U41 · 12/13 = U57/U68 · 14 = U87 · 00/15/16 = U94)', () => {
    expect(PACK_FILES).toHaveLength(18)
    expect(PACK_FILES.map((file) => file.no)).toEqual([
      '00',
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
    ])
    expect(PACK_FILES.map((file) => file.fileName)).toEqual([
      '00_Control_Totals.csv',
      '01_Revenue.csv',
      '02_Cash_Receipts.csv',
      '03_Expenses.csv',
      '04_Payments.csv',
      '05_WHT_Data.csv',
      '06_Bank_Reconciliation.csv',
      '07_Adjustment_Log.csv',
      '08_Document_Checklist.xlsx',
      '09_Credit_Notes.csv',
      '10_Customer_WHT.csv',
      '11_Suspense_Receipts.csv',
      '12_Tax_Invoices.csv',
      '13_Advance_Returns.csv',
      '14_Unbilled_Revenue.csv',
      '15_Accrued_Expenses.csv',
      '16_Advance_Balance.csv',
      '17_Company_Documents.csv',
    ])
    expect(packFileRangeLabel()).toBe('00–17')
    expect(PACK_FILES.filter((file) => file.kind === 'xlsx').map((file) => file.no)).toEqual(['08'])
  })

  it('ชื่อไฟล์ทุกตัวตรงกับไฟล์ตัวอย่างใน reference/samples', () => {
    for (const file of PACK_FILES) {
      const path = fileURLToPath(new URL(`../../reference/samples/${file.fileName}`, import.meta.url))
      expect(() => readFileSync(path), `ไม่พบตัวอย่าง ${file.fileName}`).not.toThrow()
    }
  })

  it('ชื่อไฟล์ .zip และ path ใน bucket เดินตาม version (ห้ามทับของเดิม — Rule 09)', () => {
    expect(packZipFileName(2569, 6, 3)).toBe('AccountingPack_2569-06_v1.2.zip')
    expect(
      packStoragePath({
        organizationId: 'org-1',
        yearBe: 2569,
        month: 6,
        version: 2,
        attempt: '20260816-0032-ab12cd34',
        fileName: '01_Revenue.csv',
      }),
    ).toBe('org-1/2569-06/v2/20260816-0032-ab12cd34/01_Revenue.csv')
  })

  it('key ใน Storage เป็น ASCII ล้วน — ชื่อไทยใช้แค่ตอนดาวน์โหลด (UAT R7cv3-B01)', () => {
    const at = new Date('2026-10-04T05:01:08.300Z')
    const attempt = packAttemptId(at, 'd900aa1f-1111-4000-8000-000000000000')
    const names = [...PACK_FILES.map((file) => file.fileName), PACK_COVER_FILE_NAME, packZipFileName(2569, 10, 1)]
    for (const fileName of names) {
      const path = packStoragePath({
        organizationId: '00000000-0000-0000-0000-000000000001',
        yearBe: 2569,
        month: 10,
        version: 1,
        attempt,
        fileName,
      })
      expect(isSafeStorageKey(path), path).toBe(true)
    }
    expect(packZipDownloadName('ตุลาคม 2569', 1)).toBe('AccountingPack_ตุลาคม_2569_v1.0.zip')
    expect(() =>
      packStoragePath({
        organizationId: 'org-1',
        yearBe: 2569,
        month: 10,
        version: 1,
        attempt,
        fileName: 'AccountingPack_ตุลาคม_2569_v1.0.zip',
      }),
    ).toThrow(RangeError)
  })

  it('ครั้งที่พยายามต่างกัน = path ต่างกัน แม้ version เท่ากัน (ล้มกลางทางแล้วต้อง Export ซ้ำได้)', () => {
    const at = new Date('2026-08-16T00:32:45.123Z')
    const base = { organizationId: 'org-1', yearBe: 2569, month: 6, version: 1, fileName: '01_Revenue.csv' }

    const first = packStoragePath({ ...base, attempt: packAttemptId(at, '9a8b7c6d-1111-4000-8000-000000000000') })
    const second = packStoragePath({ ...base, attempt: packAttemptId(at, '0f1e2d3c-2222-4000-8000-000000000000') })

    expect(first).not.toBe(second)
    // ยังอ่านออกว่าเป็นเวอร์ชันอะไร + เวลาที่พยายาม
    expect(first).toContain('/v1/20260816-0032')
    expect(first.endsWith('/01_Revenue.csv')).toBe(true)
  })
})

describe('หัวคอลัมน์ตรงกับ reference/samples ทุกไฟล์', () => {
  it.each([
    ['01_Revenue.csv', REVENUE_HEADERS],
    ['02_Cash_Receipts.csv', CASH_RECEIPT_HEADERS],
    ['03_Expenses.csv', EXPENSE_HEADERS],
    ['04_Payments.csv', PAYMENT_HEADERS],
    ['05_WHT_Data.csv', WHT_HEADERS],
    ['06_Bank_Reconciliation.csv', BANK_RECON_HEADERS],
    ['07_Adjustment_Log.csv', ADJUSTMENT_HEADERS],
    ['09_Credit_Notes.csv', CREDIT_NOTE_HEADERS],
    ['10_Customer_WHT.csv', CUSTOMER_WHT_HEADERS],
    ['11_Suspense_Receipts.csv', SUSPENSE_HEADERS],
    ['12_Tax_Invoices.csv', TAX_INVOICE_HEADERS],
    ['13_Advance_Returns.csv', ADVANCE_RETURN_HEADERS],
    ['14_Unbilled_Revenue.csv', UNBILLED_REVENUE_HEADERS],
    ['00_Control_Totals.csv', CONTROL_TOTALS_HEADERS],
    ['15_Accrued_Expenses.csv', ACCRUED_EXPENSE_HEADERS],
    ['16_Advance_Balance.csv', ADVANCE_BALANCE_HEADERS],
    ['17_Company_Documents.csv', COMPANY_DOCUMENT_HEADERS],
  ])('%s', (fileName, headers) => {
    expect(sampleHeader(fileName)).toEqual([...headers])
  })
})

describe('Version (`37` §6.2 · §16)', () => {
  it('ครั้งแรก = v1.0 · export ซ้ำรอบเดิมครั้งที่ 2 = v1.1 ไม่ทับของเดิม', () => {
    expect(exportVersionLabel(1)).toBe('v1.0')
    expect(exportVersionLabel(2)).toBe('v1.1')
    expect(exportVersionLabel(3)).toBe('v1.2')
  })
})

describe('สถานะ generated → sent → accepted (`37` §9)', () => {
  it('เดินหน้าได้ทีละขั้น ข้ามขั้น/ย้อนกลับไม่ได้', () => {
    expect(canTransitionExport('generated', 'sent')).toBe(true)
    expect(canTransitionExport('sent', 'accepted')).toBe(true)
    expect(canTransitionExport('generated', 'accepted')).toBe(false)
    expect(canTransitionExport('sent', 'generated')).toBe(false)
    expect(canTransitionExport('accepted', 'sent')).toBe(false)
  })
})

describe('01_Revenue.csv', () => {
  it('vat_flag = Y เมื่อมี VAT · N เมื่อไม่มี · วันที่เป็น พ.ศ.', () => {
    const csv = revenueCsv([
      {
        companyName: 'บริษัท สยามไฟแนนซ์ จำกัด',
        caseRef: 'SF-2026-00802',
        revenueDate: new Date('2026-06-25T00:00:00Z'),
        grossSatang: 1200000,
        vatSatang: 84000,
      },
      {
        companyName: 'บริษัท กรุงไทยลีสซิ่ง จำกัด',
        caseRef: 'KT-2026-00110',
        revenueDate: new Date('2026-06-26T00:00:00Z'),
        grossSatang: 500000,
        vatSatang: 0,
      },
    ])
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines[0]).toBe('company,case_ref,revenue_date,gross_baht,vat_flag')
    expect(lines[1]).toBe('บริษัท สยามไฟแนนซ์ จำกัด,SF-2026-00802,25/06/2569,12000.00,Y')
    expect(lines[2]).toBe('บริษัท กรุงไทยลีสซิ่ง จำกัด,KT-2026-00110,26/06/2569,5000.00,N')
  })
})

describe('02/03/04 — เงินรับ ค่าใช้จ่าย จ่ายจริง', () => {
  it('เงินรับ: bank_ref ว่างกลายเป็น "-"', () => {
    const csv = cashReceiptCsv([
      {
        receivedDate: new Date('2026-06-28T00:00:00Z'),
        payerName: 'บริษัท สยามไฟแนนซ์ จำกัด',
        amountSatang: 1808942,
        bankRef: null,
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe('28/06/2569,บริษัท สยามไฟแนนซ์ จำกัด,18089.42,-')
  })

  it('ค่าใช้จ่าย: gross/wht/net เป็นยอด snapshot ไม่คำนวณใหม่', () => {
    const csv = expenseCsv([
      {
        payeeName: 'ประยุทธ์ บุญมี',
        category: 'ค่าตอบแทนติดตามทรัพย์ (commission)',
        grossSatang: 850000,
        whtSatang: 25500,
        netSatang: 824500,
        receiptInCompanyName: null,
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      'ประยุทธ์ บุญมี,ค่าตอบแทนติดตามทรัพย์ (commission),8500.00,255.00,8245.00,,-,-,-,-,-,-,-,-,-',
    )
  })

  it('มติ U103: ใบรับรองแทนใบเสร็จ — receipt_file = ชื่อไฟล์ฉบับเซ็น · substitute_receipt_number ต่อท้ายสุด', () => {
    expect(EXPENSE_HEADERS.at(-1)).toBe('substitute_receipt_number')
    const line = expenseCsv([
      {
        payeeName: 'สมหญิง ดูแลดี',
        category: 'ค่าที่พัก',
        grossSatang: 45_000,
        whtSatang: 0,
        netSatang: 45_000,
        receiptInCompanyName: false,
        receiptFilePath: 'substitute-receipts/11111111-1111-4111-8111-111111111111/signed/crt-signed-0622.pdf',
        substituteReceiptNumber: 'CRT-2569-0003',
      },
    ])
      .slice(CSV_BOM.length)
      .split('\r\n')[1]
    expect(line?.split(',').slice(-2)).toEqual(['crt-signed-0622.pdf', 'CRT-2569-0003'])
  })

  it('ค่าใช้จ่าย (มติ U96 #14): receipt_in_company_name ต่อท้ายสุด — ค่าที่พัก Y/N · ชนิดอื่นว่าง', () => {
    // U96 #15 ต่อท้ายหลังคอลัมน์นี้ — ตำแหน่งที่ 6 ไม่ย้าย
    expect(EXPENSE_HEADERS[5]).toBe('receipt_in_company_name')
    expect(EXPENSE_HEADERS.slice(0, 5)).toEqual(['payee', 'category', 'gross_baht', 'wht_baht', 'net_baht'])
    const base = { payeeName: 'ก', category: 'ค่าที่พัก', grossSatang: 80000, whtSatang: 0, netSatang: 80000 }
    const lines = expenseCsv([
      { ...base, receiptInCompanyName: true },
      { ...base, receiptInCompanyName: false },
    ])
      .slice(CSV_BOM.length)
      .split('\r\n')
    expect(lines[1]?.split(',').slice(2, 6)).toEqual(['800.00', '0.00', '800.00', 'Y'])
    expect(lines[2]?.split(',').slice(2, 6)).toEqual(['800.00', '0.00', '800.00', 'N'])
    expect(receiptInCompanyNameCell(null)).toBe('')
  })

  it('มติ U96 #15: หลักฐานรายจ่ายต่อท้าย 8 คอลัมน์ — ใบเสร็จเป็นชื่อไฟล์ ไม่เปิดเผย path', () => {
    expect(EXPENSE_HEADERS.slice(6)).toEqual([
      'expense_id',
      'work_date',
      'payment_date',
      'payout_batch_ref',
      'voucher_ref',
      'case_ref',
      'cost_center',
      'receipt_file',
      // มติ PO U103 — ต่อท้ายสุด
      'substitute_receipt_number',
    ])
    const line = expenseCsv([
      {
        payeeName: 'ประยุทธ์ บุญมี',
        category: 'ค่าที่พัก',
        grossSatang: 80_000,
        whtSatang: 0,
        netSatang: 80_000,
        receiptInCompanyName: true,
        expenseId: 'e-1',
        workDate: new Date('2026-06-20T00:00:00Z'),
        paymentDate: new Date('2026-06-25T03:00:00Z'),
        payoutBatchRef: 'PB-1',
        voucherRef: 'PV-2569-PB-1-001',
        caseRef: 'SF-2569-0412',
        costCenter: 'FIELD-N',
        receiptFilePath: 'field/receipts/abc/hotel-0620.jpg',
      },
    ])
      .slice(CSV_BOM.length)
      .split('\r\n')[1]
    expect(line).toBe(
      'ประยุทธ์ บุญมี,ค่าที่พัก,800.00,0.00,800.00,Y,e-1,20/06/2569,25/06/2569,PB-1,PV-2569-PB-1-001,SF-2569-0412,FIELD-N,hotel-0620.jpg,-',
    )
  })

  it('จ่ายจริง: method คงที่ Bank Transfer + voucher_ref ของใบสำคัญจ่ายจริง', () => {
    const csv = paymentCsv([
      {
        batchRef: 'PB-2569-06-002',
        paymentDate: new Date('2026-07-05T00:00:00Z'),
        payeeName: 'ประยุทธ์ บุญมี',
        netSatang: 824500,
        voucherRef: 'PV-2569-PB-2569-06-002-001',
        advanceOffsetSatang: 0,
        whtPaidByPayerSatang: 0,
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      'PB-2569-06-002,05/07/2569,ประยุทธ์ บุญมี,8245.00,Bank Transfer,PV-2569-PB-2569-06-002-001,0.00,8245.00,0.00',
    )
  })

  it('มติ PO U30: หักคืนเงินทดรองต่อท้ายไฟล์ — advance_offset_baht + transfer_baht (amount − หัก)', () => {
    const csv = paymentCsv([
      {
        batchRef: 'PB-2569-06-002',
        paymentDate: new Date('2026-07-05T00:00:00Z'),
        payeeName: 'ประยุทธ์ บุญมี',
        netSatang: 824500,
        voucherRef: 'PV-2569-PB-2569-06-002-001',
        advanceOffsetSatang: 55000,
        whtPaidByPayerSatang: 0,
      },
    ])
    const [header, row] = csv.slice(CSV_BOM.length).split('\r\n')
    expect(header).toBe(
      'payout_batch_ref,payment_date,payee,amount_baht,method,voucher_ref,advance_offset_baht,transfer_baht,wht_paid_by_payer_baht',
    )
    expect(row).toBe('PB-2569-06-002,05/07/2569,ประยุทธ์ บุญมี,8245.00,Bank Transfer,PV-2569-PB-2569-06-002-001,550.00,7695.00,0.00')
  })

  it('มติ PO U105: ภาษีที่บริษัทออกให้ต่อท้ายไฟล์ — ผู้รับได้เงินเต็ม (amount = เงินได้ ไม่หักภาษี)', () => {
    const [, row] = paymentCsv([
      {
        batchRef: 'PB-2569-10-001',
        paymentDate: new Date('2026-10-06T00:00:00Z'),
        payeeName: 'ประยุทธ์ บุญมี',
        netSatang: 1_000_000,
        voucherRef: 'PV-2569-0100',
        advanceOffsetSatang: 0,
        whtPaidByPayerSatang: 30_928,
      },
    ])
      .slice(CSV_BOM.length)
      .split('\r\n')
    expect(row).toBe('PB-2569-10-001,06/10/2569,ประยุทธ์ บุญมี,10000.00,Bank Transfer,PV-2569-0100,0.00,10000.00,309.28')
  })
})

describe('05_WHT_Data.csv — payee_tax_id 13 หลักล้วน (DEC-006/D10)', () => {
  const base: WhtExportRow = {
    certificateNumber: '0142',
    payeeName: 'ประยุทธ์ บุญมี',
    payeeTaxId: '1-1234-56789-01-2',
    paymentDate: new Date('2026-06-30T00:00:00Z'),
    incomeType: 'ค่าจ้างทำของ ม.40(8)',
    grossSatang: 850000,
    whtSatang: 25500,
    whtPct: '3.00',
    filingForm: 'PND3',
    payeeTitle: 'นาย',
    payeeAddress: '12 ม.3 ต.ป่าแดด อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50100',
    payeeBranchCode: null,
    whtCondition: 'withhold',
  }

  it('ตัดขีด/ช่องว่างออกเหลือ 13 หลักล้วน', () => {
    expect(normalizeTaxId('1-1234-56789-01-2')).toBe('1123456789012')
    expect(normalizeTaxId('1123456789012')).toBe('1123456789012')
    expect(normalizeTaxId('112345678901')).toBeNull()
    expect(normalizeTaxId(null)).toBeNull()
    expect(normalizeTaxId('')).toBeNull()
  })

  it('payee ที่ไม่มีเลข 13 หลักถูกจับได้ก่อนสร้างไฟล์ (ยาม `37` §6.1)', () => {
    expect(payeesMissingTaxId([base])).toEqual([])
    expect(payeesMissingTaxId([{ ...base, payeeTaxId: null }])).toEqual([
      { certificateNumber: '0142', payeeName: 'ประยุทธ์ บุญมี' },
    ])
  })

  it('wht_pct คงทศนิยม 2 ตำแหน่งตามตัวอย่าง', () => {
    expect(whtPctText('3')).toBe('3.00')
    expect(whtPctText('3.00')).toBe('3.00')
    expect(whtPctText(null)).toBe('-')
  })

  it('แถวออกมาตรงรูปแบบตัวอย่าง', () => {
    expect(whtCsv([base]).slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      '0142,ประยุทธ์ บุญมี,1123456789012,30/06/2569,ค่าจ้างทำของ ม.40(8),8500.00,255.00,3.00,PND3,นาย,12 ม.3 ต.ป่าแดด อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50100,-,withhold,0.00,active,-',
    )
  })

  it('filing_form ต่อท้ายสุด — คอลัมน์เดิมไม่เปลี่ยนลำดับ/ชื่อ (มติ PO 05/10/2569 U15)', () => {
    expect(WHT_HEADERS).toEqual([
      'cert_no',
      'payee',
      'payee_tax_id',
      'pay_date',
      'income_type',
      'gross_baht',
      'wht_baht',
      'wht_pct',
      'filing_form',
      'payee_title',
      'payee_address',
      'payee_branch',
      'wht_condition',
      'wht_paid_by_payer_baht',
      'status',
      'ref_cert_no',
    ])
    const lines = whtCsv([
      base,
      { ...base, certificateNumber: '0143', filingForm: 'PND53' },
      { ...base, certificateNumber: '0144', whtSatang: 0, whtPct: '0.00', filingForm: 'PND1' },
    ])
      .slice(CSV_BOM.length)
      .split('\r\n')
    expect(lines.slice(1, 4).map((line) => line.split(',')[8])).toEqual(['PND3', 'PND53', 'PND1'])
    // 40(2) อัตรา 0% (U16) — ภาษี 0 แต่ยังเป็นแถวของ ภ.ง.ด.1
    expect(lines[3]?.startsWith('0144,ประยุทธ์ บุญมี,1123456789012,30/06/2569,ค่าจ้างทำของ ม.40(8),8500.00,0.00,0.00,PND1,')).toBe(true)
  })

  it('U94 — คอลัมน์ผู้ถูกหักต่อท้าย: นิติบุคคลมีรหัสสาขา ไม่มีคำนำหน้า · ที่อยู่มีจุลภาคถูก quote · เงื่อนไขการหักเป็นรหัส', () => {
    const [, person, company] = whtCsv([
      { ...base, payeeAddress: null, whtCondition: 'pay_once' },
      {
        ...base,
        certificateNumber: '0145',
        payeeName: 'บริษัท เร็วดี จำกัด',
        payeeTitle: null,
        payeeAddress: '1 อาคาร A, ชั้น 2 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500',
        payeeBranchCode: '00001',
        filingForm: 'PND53',
      },
    ])
      .slice(CSV_BOM.length)
      .split('\r\n')
    // มติ PO U105 — (3) ออกให้ครั้งเดียว: ภาษีทั้งก้อนเป็นภาษีที่บริษัทออกให้ · (1) = 0
    expect(person?.endsWith(',PND3,นาย,-,-,pay_once,255.00,active,-')).toBe(true)
    expect(company?.endsWith(',PND53,-,"1 อาคาร A, ชั้น 2 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500",00001,withhold,0.00,active,-')).toBe(true)
  })

  it('U128 — แถวกลับรายการ: ยอดติดลบ + status cancelled + อ้างใบเดิม · ใบออกแทนอ้างใบที่ถูกแทน', () => {
    const reversal = whtReversalRow(base)
    expect(reversal).toMatchObject({ grossSatang: -850000, whtSatang: -25500, rowStatus: 'cancelled', refCertificateNumber: '0142' })
    const [, reversed, replacement] = whtCsv([reversal, { ...base, certificateNumber: '0150', refCertificateNumber: '0142' }])
      .slice(CSV_BOM.length)
      .split('\r\n')
    expect(reversed?.startsWith('0142,ประยุทธ์ บุญมี,1123456789012,30/06/2569,ค่าจ้างทำของ ม.40(8),-8500.00,-255.00,3.00,PND3,')).toBe(true)
    expect(reversed?.endsWith(',withhold,0.00,cancelled,0142')).toBe(true)
    expect(replacement?.endsWith(',withhold,0.00,active,0142')).toBe(true)
  })
})

describe('06_Bank_Reconciliation.csv — enum เต็ม 4 ค่า (DEC-006/D10)', () => {
  it('ทิศทางอ่านจากเครื่องหมายของยอด แต่ยอดในไฟล์เป็นค่าบวกเสมอ', () => {
    expect(bankDirection(1808942)).toBe('credit')
    expect(bankDirection(-824500)).toBe('debit')
    const csv = bankReconCsv([
      {
        transactionDate: new Date('2026-07-05T00:00:00Z'),
        description: 'BTR-2569-07-0012',
        amountSatang: -824500,
        matchStatus: 'manual_matched',
        matchedType: 'payout_batch',
        matchedRef: 'PB-2569-06-002',
        billingBatchNumber: null,
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      '05/07/2569,BTR-2569-07-0012,8245.00,debit,payout_batch,PB-2569-06-002,manual_matched,-',
    )
  })

  it('มติ U79 — จับคู่รอบวางบิล: `matched_ref` คงรูปแบบเดิม (บริษัท + รอบเดือน) · เลขรอบอยู่คอลัมน์ต่อท้าย', () => {
    const lines = bankReconCsv([
      {
        transactionDate: new Date('2026-06-28T00:00:00Z'),
        description: 'BTR-2569-06-0231',
        amountSatang: 1_808_942,
        matchStatus: 'auto_matched',
        matchedType: 'billing_batch',
        matchedRef: 'บริษัท สยามไฟแนนซ์ จำกัด 2569-06',
        billingBatchNumber: 'BL-2569-001',
      },
    ])
      .slice(CSV_BOM.length)
      .split('\r\n')
    expect(lines[0]?.split(',').at(-1)).toBe('billing_batch_number')
    expect(lines[1]).toBe(
      '28/06/2569,BTR-2569-06-0231,18089.42,credit,billing_batch,บริษัท สยามไฟแนนซ์ จำกัด 2569-06,auto_matched,BL-2569-001',
    )
  })

  it('รายการที่ยังไม่จับคู่: status เป็นค่า enum ดิบ ไม่แปลไทย · ช่องคู่เป็น "-"', () => {
    const csv = bankReconCsv([
      {
        transactionDate: new Date('2026-07-06T00:00:00Z'),
        description: 'เงินเข้าไม่ทราบที่มา',
        amountSatang: 50000,
        matchStatus: 'unmatched_resolved',
        matchedType: null,
        matchedRef: null,
        billingBatchNumber: null,
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      '06/07/2569,เงินเข้าไม่ทราบที่มา,500.00,credit,-,-,unmatched_resolved,-',
    )
  })
})

describe('07_Adjustment_Log.csv', () => {
  it('เลขที่เดินตามลำดับในรอบ (deterministic) และยอดลดติดลบ', () => {
    expect(adjustmentRef({ yearBe: 2569, month: 6, index: 1 })).toBe('ADJ-2569-06-001')
    const csv = adjustmentCsv(
      [
        {
          targetType: 'revenue',
          targetRef: 'SF-2026-00791',
          signedSatang: -10000,
          reason: 'แก้ไขยอด VAT คำนวณผิดพลาดจากปัดเศษ',
          approvedByName: 'Executive (คุณวิภา)',
          approvedAt: new Date('2026-07-03T00:00:00Z'),
          billingBatchNumber: null,
        },
        {
          // มติ U79 — `target_ref` ของรอบวางบิลคงเป็นรอบเดือน · เลขรอบอยู่คอลัมน์ต่อท้าย
          targetType: 'billing_batch',
          targetRef: '2569-06',
          signedSatang: 5_000,
          reason: 'ปรับยอดรอบ',
          approvedByName: 'Executive (คุณวิภา)',
          approvedAt: new Date('2026-07-03T00:00:00Z'),
          billingBatchNumber: 'BL-2569-001',
        },
      ],
      { yearBe: 2569, month: 6 },
    )
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines[0]).toBe(ADJUSTMENT_HEADERS.join(','))
    expect(lines[1]).toBe(
      'ADJ-2569-06-001,revenue,SF-2026-00791,-100.00,แก้ไขยอด VAT คำนวณผิดพลาดจากปัดเศษ,Executive (คุณวิภา),03/07/2569,-',
    )
    expect(lines[2]).toBe('ADJ-2569-06-002,billing_batch,2569-06,50.00,ปรับยอดรอบ,Executive (คุณวิภา),03/07/2569,BL-2569-001')
  })
})

describe('08_Document_Checklist.xlsx', () => {
  const rows: ChecklistExportRow[] = [
    {
      sourceModule: 'case',
      sourceRef: 'SF-2026-00815',
      level: 'critical',
      status: 'open',
      title: 'ไม่มีใบส่งมอบทรัพย์แนบ (Lot ยังไม่ confirmed)',
      responsibleName: 'ธุรการคลัง (นันทพร)',
    },
    {
      sourceModule: 'expense',
      sourceRef: 'EXP-2569-0342',
      level: 'warning',
      status: 'open',
      title: 'รอใบเสร็จค่าน้ำมันฉบับจริงจากพนักงาน',
      responsibleName: 'ประยุทธ์ บุญมี',
    },
    {
      sourceModule: 'tax_invoice',
      sourceRef: 'INV-2569-0014',
      level: 'info',
      status: 'resolved',
      title: 'เอกสารครบแล้ว',
      responsibleName: null,
    },
  ]

  it('แปลงสถานะ Exception เป็นสถานะเอกสารตาม `34` §6.1', () => {
    expect(checklistDocStatus({ level: 'critical', status: 'open' })).toBe('ขาดเอกสาร')
    expect(checklistDocStatus({ level: 'warning', status: 'open' })).toBe('รอตรวจสอบ')
    expect(checklistDocStatus({ level: 'info', status: 'open' })).toBe('รอตรวจสอบ')
    expect(checklistDocStatus({ level: 'critical', status: 'authorized' })).toBe('อนุญาตปิดงวด — ยังรอเอกสาร')
    expect(checklistDocStatus({ level: 'warning', status: 'authorized' })).toBe(CHECKLIST_AUTHORIZED_PENDING)
    expect(checklistDocStatus({ level: 'critical', status: 'resolved' })).toBe('ครบถ้วน')
  })

  it('แถวที่ปิดแล้วไม่โชว์ severity แต่ยังบอกหัวข้อข้อยกเว้น (UAT BUG-123)', () => {
    expect(checklistRows(rows)[2]).toEqual(['tax_invoice', 'INV-2569-0014', 'ครบถ้วน', '-', 'เอกสารครบแล้ว', '-'])
    expect(checklistRows(rows)[0]).toEqual([
      'case',
      'SF-2026-00815',
      'ขาดเอกสาร',
      'critical',
      'ไม่มีใบส่งมอบทรัพย์แนบ (Lot ยังไม่ confirmed)',
      'ธุรการคลัง (นันทพร)',
    ])
  })

  it('สรุปนับ 3 กลุ่มตรงกับจำนวนแถว', () => {
    expect(checklistSummary(rows)).toEqual({ complete: 1, missingCritical: 1, pending: 1, authorizedPending: 0 })
  })

  it('ชีตมีหัวเรื่อง 2 บรรทัด ตาราง สรุป และหมายเหตุท้ายไฟล์ (ตาม samples/08)', () => {
    const sheet = checklistSheet({
      periodLabel: 'มิถุนายน 2569',
      generatedByName: 'นันทพร (บัญชี)',
      generatedAt: new Date('2026-07-05T03:00:00Z'),
      rows,
    })
    expect(sheet[0]).toEqual(['Document Checklist Export — รอบบัญชี มิถุนายน 2569'])
    expect(sheet[1]?.[0]).toContain('จัดทำโดย นันทพร (บัญชี) วันที่ 05/07/2569')
    expect(sheet[3]).toEqual([...CHECKLIST_HEADERS])
    expect(sheet).toContainEqual(['ขาดเอกสาร (Critical)', '1'])
    expect(sheet.at(-1)?.[0]).toContain('ห้าม Export Accounting Pack')
  })
})

describe('08_Document_Checklist — exception ที่อนุญาตปิดงวด (มติ PO 05/10/2569 U31 · BUG-129)', () => {
  const authorized: ChecklistExportRow = {
    sourceModule: 'expense',
    sourceRef: 'EXP-2569-0351',
    level: 'critical',
    status: 'authorized',
    title: 'รอใบเสร็จค่าที่พักฉบับจริง',
    responsibleName: 'ประยุทธ์ บุญมี',
    authorizeNote: 'ผู้บริหารอนุญาตปิดงวด เอกสารตามมาเดือนหน้า',
  }
  const resolved: ChecklistExportRow = { ...authorized, sourceRef: 'EXP-2569-0352', status: 'resolved', authorizeNote: null }

  it('แถว authorized ไม่นับว่าครบถ้วน · แสดงระดับ + หัวข้อเอกสารที่รอ + เหตุผลที่อนุญาต', () => {
    expect(checklistRows([authorized])[0]).toEqual([
      'expense',
      'EXP-2569-0351',
      'อนุญาตปิดงวด — ยังรอเอกสาร',
      'critical',
      'รอใบเสร็จค่าที่พักฉบับจริง (อนุญาตปิดงวด: ผู้บริหารอนุญาตปิดงวด เอกสารตามมาเดือนหน้า)',
      'ประยุทธ์ บุญมี',
    ])
  })

  it('ไม่มีเหตุผลอนุญาต ⇒ แสดงหัวข้ออย่างเดียว', () => {
    expect(checklistRows([{ ...authorized, authorizeNote: null }])[0]?.[4]).toBe('รอใบเสร็จค่าที่พักฉบับจริง')
  })

  it('สรุปนับแยก "อนุญาตปิดงวด" ออกจาก "ครบถ้วน" — ชีตมีบรรทัดสรุปของกลุ่มนี้', () => {
    expect(checklistSummary([authorized, resolved])).toEqual({
      complete: 1,
      missingCritical: 0,
      pending: 0,
      authorizedPending: 1,
    })
    const sheet = checklistSheet({
      periodLabel: 'กันยายน 2569',
      generatedByName: 'บัญชี',
      generatedAt: new Date('2026-10-05T03:00:00Z'),
      rows: [authorized, resolved],
    })
    expect(sheet).toContainEqual(['ครบถ้วน', '1'])
    expect(sheet).toContainEqual(['อนุญาตปิดงวด — ยังรอเอกสาร', '1'])
  })
})

describe('09_Credit_Notes.csv (มติ PO 05/10/2569 U21)', () => {
  it('ใบลดหนี้ + ใบเพิ่มหนี้ — ยอดบวกเสมอ · วันที่ พ.ศ. · ไม่ผูก Adjustment = "-" · UTF-8 BOM + CRLF', () => {
    const csv = creditNoteCsv([
      {
        documentType: 'CN',
        number: 'CN-2569-001',
        issueDate: new Date('2026-07-05T00:00:00Z'),
        taxInvoiceRef: 'INV-2569-0014',
        companyName: 'บริษัท สยามไฟแนนซ์ จำกัด',
        amountBeforeVatSatang: 10_000,
        vatSatang: 700,
        totalSatang: 10_700,
        reason: 'ลดค่าบริการ, ตามที่ตกลง',
        status: 'active',
        adjustmentRef: 'ADJ-2569-06-001',
        companyBranchCode: '00000',
        companyTaxId: '0105-55500-0111',
      },
      {
        documentType: 'DN',
        number: 'DN-2569-001',
        issueDate: new Date('2026-07-06T00:00:00Z'),
        taxInvoiceRef: 'INV-2569-0014',
        companyName: 'บริษัท สยามไฟแนนซ์ จำกัด',
        amountBeforeVatSatang: 5_000,
        vatSatang: 350,
        totalSatang: 5_350,
        reason: 'เพิ่มค่าบริการ',
        status: 'cancelled',
        adjustmentRef: null,
        // มติ PO U82 — สาขาผู้ซื้อตามใบกำกับเดิม (คอลัมน์ต่อท้าย)
        companyBranchCode: '00001',
      },
    ])
    expect(csv.startsWith(CSV_BOM)).toBe(true)
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines[0]).toBe(CREDIT_NOTE_HEADERS.join(','))
    expect(lines[1]).toBe(
      'CN,CN-2569-001,05/07/2569,INV-2569-0014,บริษัท สยามไฟแนนซ์ จำกัด,100.00,7.00,107.00,"ลดค่าบริการ, ตามที่ตกลง",active,ADJ-2569-06-001,สำนักงานใหญ่,0105555000111',
    )
    // มติ U94 ข้อ 5 — company_tax_id ต่อท้ายสุด · ไม่มี/ไม่ครบ 13 หลัก = "-"
    expect(lines[2]).toBe(
      'DN,DN-2569-001,06/07/2569,INV-2569-0014,บริษัท สยามไฟแนนซ์ จำกัด,50.00,3.50,53.50,เพิ่มค่าบริการ,cancelled,-,สาขาที่ 00001,-',
    )
    expect(CREDIT_NOTE_HEADERS.at(-1)).toBe('company_tax_id')
    expect(lines[3]).toBe('')
  })

  it('ไม่มีเอกสารในรอบ ⇒ มีแต่หัวคอลัมน์', () => {
    expect(creditNoteCsv([])).toBe(`${CSV_BOM}${CREDIT_NOTE_HEADERS.join(',')}\r\n`)
  })
})

describe('10_Customer_WHT.csv (มติ PO 05/10/2569 U40)', () => {
  it('ได้รับแล้ว + ยังรอหนังสือ — เลขผู้เสียภาษี 13 หลักล้วน · ยังไม่ได้รับ ⇒ ช่องหนังสือเป็น "-" · status = enum ดิบ', () => {
    const csv = customerWhtCsv([
      {
        withheldDate: new Date('2026-09-12T00:00:00Z'),
        companyName: 'บริษัท สยามไฟแนนซ์ จำกัด',
        companyTaxId: '0-1055-55000-11-1',
        billingRef: '2569-08',
        taxInvoiceNumbers: ['INV-2569-0014'],
        withheldSatang: 11_190,
        certificateNumber: 'สฟ-2569/0451',
        certificateDate: new Date('2026-09-10T00:00:00Z'),
        whtSatang: 11_190,
        status: 'received',
        billingBatchNumber: 'BL-2569-004',
      },
      {
        withheldDate: new Date('2026-09-28T00:00:00Z'),
        companyName: 'บริษัท ไทยลีสซิ่ง จำกัด',
        companyTaxId: null,
        billingRef: null,
        taxInvoiceNumbers: [],
        withheldSatang: 24_000,
        certificateNumber: null,
        certificateDate: null,
        whtSatang: null,
        status: 'pending',
        billingBatchNumber: null,
      },
    ])
    expect(csv.startsWith(CSV_BOM)).toBe(true)
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines[0]).toBe(CUSTOMER_WHT_HEADERS.join(','))
    expect(lines[1]).toBe(
      '12/09/2569,บริษัท สยามไฟแนนซ์ จำกัด,0105555000111,2569-08,INV-2569-0014,111.90,สฟ-2569/0451,10/09/2569,111.90,received,BL-2569-004',
    )
    expect(lines[2]).toBe('28/09/2569,บริษัท ไทยลีสซิ่ง จำกัด,-,-,-,240.00,-,-,-,pending,-')
  })

  it('ไม่มีรายการ ⇒ มีแต่หัวคอลัมน์', () => {
    expect(customerWhtCsv([])).toBe(`${CSV_BOM}${CUSTOMER_WHT_HEADERS.join(',')}\r\n`)
  })
})

describe('11_Suspense_Receipts.csv (มติ PO 05/10/2569 U41)', () => {
  it('ยังค้าง / จับคู่ภายหลัง / คืนผู้โอน — ยอดบวก · วันที่ พ.ศ. · status = enum ดิบ', () => {
    const csv = suspenseCsv([
      {
        transactionDate: new Date('2026-09-20T00:00:00Z'),
        description: 'TRF IN 0987',
        amountSatang: 12_345,
        suspendedAt: new Date('2026-09-21T03:00:00Z'),
        suspenseNote: 'ไม่ระบุผู้โอน',
        matchStatus: 'suspense',
        matchedRef: null,
        resolvedDate: null,
        refundNote: null,
        billingBatchNumber: null,
      },
      {
        transactionDate: new Date('2026-09-22T00:00:00Z'),
        description: 'TRF IN KBANK 5521',
        amountSatang: 535_000,
        suspendedAt: new Date('2026-09-23T03:00:00Z'),
        suspenseNote: 'ยอดไม่ตรงบิลใด',
        matchStatus: 'manual_matched',
        // มติ U79 — `resolved_ref` คงรูปแบบเดิม · เลขรอบอยู่คอลัมน์ต่อท้าย
        matchedRef: 'บริษัท สยามไฟแนนซ์ จำกัด 2569-08',
        resolvedDate: new Date('2026-09-30T03:00:00Z'),
        refundNote: null,
        billingBatchNumber: 'BL-2569-004',
      },
      {
        transactionDate: new Date('2026-09-25T00:00:00Z'),
        description: 'TRF IN SCB',
        amountSatang: 50_000,
        suspendedAt: new Date('2026-09-25T03:00:00Z'),
        suspenseNote: 'โอนผิดบัญชี',
        matchStatus: 'suspense_refunded',
        matchedRef: null,
        resolvedDate: new Date('2026-09-27T00:00:00Z'),
        refundNote: 'คืนตามคำขอ, มีสลิป',
        billingBatchNumber: null,
      },
    ])
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines[0]).toBe(SUSPENSE_HEADERS.join(','))
    expect(lines[1]).toBe('20/09/2569,TRF IN 0987,123.45,21/09/2569,ไม่ระบุผู้โอน,suspense,-,-,-,-')
    expect(lines[2]).toBe(
      '22/09/2569,TRF IN KBANK 5521,5350.00,23/09/2569,ยอดไม่ตรงบิลใด,manual_matched,บริษัท สยามไฟแนนซ์ จำกัด 2569-08,30/09/2569,-,BL-2569-004',
    )
    expect(lines[3]).toBe(
      '25/09/2569,TRF IN SCB,500.00,25/09/2569,โอนผิดบัญชี,suspense_refunded,-,27/09/2569,"คืนตามคำขอ, มีสลิป",-',
    )
  })
})

describe('12_Tax_Invoices.csv (มติ PO 05/10/2569 U57)', () => {
  const base = {
    companyName: 'บริษัท สยามไฟแนนซ์ จำกัด',
    companyTaxId: '0105555000111',
    amountBeforeVatSatang: 373_000,
    vatSatang: 26_110,
    totalSatang: 399_110,
    vatRatesPct: ['7', '7.00'],
    billingRef: '2569-06',
    billingBatchNumber: 'BL-2569-002',
    companyBranchCode: '00000',
    documentType: 'ใบเสร็จรับเงิน/ใบกำกับภาษี',
    receivedDate: new Date('2026-06-30T00:00:00Z'),
  }

  it('ใบปกติ / ใบยกเลิก (+ วันที่ เหตุผล ใบแทน) — ยอดจาก snapshot · วันที่ พ.ศ. · status = enum ดิบ', () => {
    const csv = taxInvoiceCsv([
      {
        ...base,
        invoiceNumber: 'INV-2569-0014',
        invoiceDate: new Date('2026-06-30T00:00:00Z'),
        status: 'active',
        cancelledAt: null,
        cancelReason: null,
        replacedBy: null,
        pdfFile: 'tax_invoices/INV-2569-0014.pdf',
      },
      {
        ...base,
        companyTaxId: '0-1055-55000-11-1',
        invoiceNumber: 'INV-2569-0015',
        invoiceDate: new Date('2026-06-30T00:00:00Z'),
        status: 'cancelled',
        // 03/07/2569 01:00 เวลาไทย
        cancelledAt: new Date('2026-07-02T18:00:00Z'),
        cancelReason: 'ที่อยู่ผิด, ออกใหม่',
        replacedBy: 'INV-2569-0016',
        pdfFile: null,
        // มติ PO U77 — สาขาผู้ซื้อตาม snapshot บนใบ
        companyBranchCode: '00001',
        // ใบกำกับแบบเดิม (ก่อน U95) — ไม่มีวันรับเงิน
        documentType: 'ใบกำกับภาษี',
        receivedDate: null,
      },
    ])
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines[0]).toBe(TAX_INVOICE_HEADERS.join(','))
    expect(lines[1]).toBe(
      'INV-2569-0014,30/06/2569,บริษัท สยามไฟแนนซ์ จำกัด,0105555000111,3730.00,261.10,3991.10,7.00,2569-06,active,-,-,-,tax_invoices/INV-2569-0014.pdf,สำนักงานใหญ่,BL-2569-002,ใบเสร็จรับเงิน/ใบกำกับภาษี,30/06/2569',
    )
    expect(lines[2]).toBe(
      'INV-2569-0015,30/06/2569,บริษัท สยามไฟแนนซ์ จำกัด,0105555000111,3730.00,261.10,3991.10,7.00,2569-06,cancelled,03/07/2569,"ที่อยู่ผิด, ออกใหม่",INV-2569-0016,-,สาขาที่ 00001,BL-2569-002,ใบกำกับภาษี,-',
    )
  })

  it('อัตรา VAT — ไม่ซ้ำ เรียงน้อยไปมาก · ไม่มีรายได้ผูก ⇒ -', () => {
    expect(vatRatesText(['7.00', '10', '7'])).toBe('7.00 10.00')
    expect(vatRatesText([])).toBe('-')
  })

  it('ชื่อ PDF ใน zip อยู่ใต้ tax_invoices/ และตัดอักขระที่ใช้ตั้งชื่อไฟล์ไม่ได้', () => {
    expect(taxInvoicePdfEntryName('INV-2569-0014')).toBe('tax_invoices/INV-2569-0014.pdf')
    expect(taxInvoicePdfEntryName('INV/2569 0014')).toBe('tax_invoices/INV_2569_0014.pdf')
  })

  it('รายชื่อใบที่ไม่ได้แนบ PDF ระบุจำนวนและเลขที่ครบ', () => {
    const text = taxInvoiceNotAttachedText(['INV-1', 'INV-2'])
    expect(text).toContain('2 ใบ')
    expect(text).toContain('INV-1\r\nINV-2')
  })
})

describe('13_Advance_Returns.csv (มติ PO 05/10/2569 U68)', () => {
  it('หักกลบในรอบจ่าย / รับเงินสด / โอนแล้วกลับรายการ', () => {
    const csv = advanceReturnCsv([
      {
        returnDate: new Date('2026-07-10T03:00:00Z'),
        advanceRef: 'ADV-3F2A9C1B',
        payeeName: 'สมชาย ใจดี',
        amountSatang: 55_000,
        channel: 'payout_offset',
        payoutBatchRef: 'PB-2569-07-01',
        evidenceFilePath: null,
        reversedAt: null,
        reversalReason: null,
        returnNumber: 'RAV-2569-0001',
      },
      {
        returnDate: new Date('2026-07-15T00:00:00Z'),
        advanceRef: 'ADV-7D41E0AA',
        payeeName: 'ประยุทธ์ บุญมี',
        amountSatang: 120_000,
        channel: 'cash',
        payoutBatchRef: null,
        evidenceFilePath: 'advances/abc/returns/receipt-cash-0715.jpg',
        reversedAt: null,
        reversalReason: null,
        returnNumber: 'RAV-2569-0002',
      },
      {
        returnDate: new Date('2026-07-20T00:00:00Z'),
        advanceRef: 'ADV-91BC22F0',
        payeeName: 'สมหญิง รักงาน',
        amountSatang: 30_000,
        channel: 'bank_transfer',
        payoutBatchRef: 'ไม่ควรออก',
        evidenceFilePath: 'advances/def/returns/slip-0720.pdf',
        reversedAt: new Date('2026-07-22T04:00:00Z'),
        reversalReason: 'บันทึกยอดซ้ำกับรายการเดิม',
        returnNumber: 'RAV-2569-0003',
      },
    ])
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines[0]).toBe(ADVANCE_RETURN_HEADERS.join(','))
    // มติ PO O67 · U100 — เลขที่ใบรับคืน (RAV) ต่อท้ายสุด คอลัมน์เดิมไม่ย้าย
    expect(ADVANCE_RETURN_HEADERS.at(-1)).toBe('return_number')
    expect(lines[1]).toBe('10/07/2569,ADV-3F2A9C1B,สมชาย ใจดี,550.00,payout_offset,PB-2569-07-01,-,active,-,-,RAV-2569-0001')
    expect(lines[2]).toBe('15/07/2569,ADV-7D41E0AA,ประยุทธ์ บุญมี,1200.00,cash,-,receipt-cash-0715.jpg,active,-,-,RAV-2569-0002')
    expect(lines[3]).toBe(
      '20/07/2569,ADV-91BC22F0,สมหญิง รักงาน,300.00,bank_transfer,-,slip-0720.pdf,reversed,22/07/2569,บันทึกยอดซ้ำกับรายการเดิม,RAV-2569-0003',
    )
  })

  it('ชื่อไฟล์หลักฐาน = ชื่อไฟล์เท่านั้น ไม่เปิดเผย path ใน bucket', () => {
    expect(evidenceFileName('a/b/c.jpg')).toBe('c.jpg')
    expect(evidenceFileName(null)).toBeNull()
    expect(evidenceFileName('a/')).toBeNull()
  })
})

describe('14_Unbilled_Revenue.csv (มติ PO 06/10/2569 U87)', () => {
  it('ประกอบได้ตรงไฟล์ตัวอย่างทั้งไฟล์ — ยังไม่ผูกรอบ / อยู่ในรอบร่าง / บริษัทไม่คิด VAT', () => {
    const csv = unbilledRevenueCsv([
      {
        caseRef: 'SF-2569-0412',
        companyName: 'บริษัท สยามไฟแนนซ์ จำกัด',
        companyTaxId: '0105555000111',
        revenueDate: new Date('2026-06-28T00:00:00Z'),
        feeModel: 'SUCCESS_FEE',
        grossSatang: 150_000,
        vatSatang: 10_500,
        totalSatang: 160_500,
        vatRatePct: '7',
        draftBillingBatchNumber: null,
      },
      {
        caseRef: 'TL-2569-0088',
        companyName: 'บริษัท ไทยลีสซิ่ง จำกัด',
        companyTaxId: '0-1055-55000-22-2',
        revenueDate: new Date('2026-06-30T00:00:00Z'),
        feeModel: 'FLAT',
        grossSatang: 75_000,
        vatSatang: 5_250,
        totalSatang: 80_250,
        vatRatePct: '7.00',
        draftBillingBatchNumber: 'BL-2569-003',
      },
      {
        caseRef: 'SF-2569-0377',
        companyName: 'บริษัท สยามไฟแนนซ์ จำกัด',
        companyTaxId: '0105555000111',
        revenueDate: new Date('2026-05-25T00:00:00Z'),
        feeModel: 'HYBRID',
        grossSatang: 200_000,
        vatSatang: 0,
        totalSatang: 200_000,
        vatRatePct: '0',
        draftBillingBatchNumber: null,
      },
    ])
    const path = fileURLToPath(new URL('../../reference/samples/14_Unbilled_Revenue.csv', import.meta.url))
    expect(csv).toBe(readFileSync(path, 'utf8'))
  })

  it('ไม่มีรายได้ค้างรับ ⇒ มีแต่หัวคอลัมน์ · เลขผู้เสียภาษีไม่ครบ 13 หลัก ⇒ `-`', () => {
    expect(unbilledRevenueCsv([])).toBe(`${CSV_BOM}${UNBILLED_REVENUE_HEADERS.join(',')}\r\n`)
    const csv = unbilledRevenueCsv([
      {
        caseRef: 'X-1',
        companyName: 'ไฟแนนซ์ ก',
        companyTaxId: '12345',
        revenueDate: new Date('2026-06-01T00:00:00Z'),
        feeModel: 'FLAT',
        grossSatang: 1,
        vatSatang: 0,
        totalSatang: 1,
        vatRatePct: '7',
        draftBillingBatchNumber: null,
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe('X-1,ไฟแนนซ์ ก,-,01/06/2569,FLAT,0.01,0.00,0.01,7.00,-')
  })
})

function csvLines(csv: string): string[] {
  return csv.slice(CSV_BOM.length).split('\r\n')
}

function sampleText(fileName: string): string {
  return readFileSync(fileURLToPath(new URL(`../../reference/samples/${fileName}`, import.meta.url)), 'utf8')
}

describe('15_Accrued_Expenses.csv (มติ PO 06/10/2569 U94 ข้อ 2)', () => {
  it('สถานะที่นับเป็นค้างจ่าย = รอคลังยืนยัน/รออนุมัติ/รอการเงิน/อนุมัติแล้ว (ไม่รวมตีกลับ/ปฏิเสธ/ถูกแทน)', () => {
    expect([...ACCRUED_EXPENSE_STATUSES]).toEqual([
      'pending_warehouse_confirm',
      'pending_approval',
      'pending_finance_approval',
      'approved',
    ])
  })

  it('status = enum ดิบ · ประมาณ WHT ไม่ได้ ⇒ "-" · ไม่อยู่ในรอบจ่าย ⇒ "-" · ตรงไฟล์ตัวอย่างทั้งไฟล์', () => {
    const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
    const csv = accruedExpenseCsv([
      {
        expenseId: '7c1d2e3f-0a1b-4c2d-8e9f-0a1b2c3d4e01',
        payeeName: 'ประยุทธ์ บุญมี',
        payeeTaxId: '3100000004600',
        category: 'ค่าตอบแทนติดตามทรัพย์ (commission)',
        caseRef: 'SF-2569-0420',
        workDate: D('2026-06-28'),
        status: 'approved',
        grossSatang: 450_000,
        estimatedWhtSatang: 13_500,
        payoutBatchRef: 'PB-2569-07-001',
      },
      {
        expenseId: '7c1d2e3f-0a1b-4c2d-8e9f-0a1b2c3d4e02',
        payeeName: 'ประวิทธิ์ มากมี',
        payeeTaxId: '3100000004601',
        category: 'ค่าน้ำมัน',
        caseRef: 'SF-2569-0421',
        workDate: D('2026-06-29'),
        status: 'pending_approval',
        grossSatang: 35_000,
        estimatedWhtSatang: 0,
        payoutBatchRef: null,
      },
      {
        expenseId: '7c1d2e3f-0a1b-4c2d-8e9f-0a1b2c3d4e03',
        payeeName: 'สมหญิง ใจดี',
        payeeTaxId: '3100000004602',
        category: 'ค่าตอบแทนติดตามทรัพย์ (commission)',
        caseRef: 'TL-2569-0090',
        workDate: D('2026-06-30'),
        status: 'pending_warehouse_confirm',
        grossSatang: 620_000,
        estimatedWhtSatang: 18_600,
        payoutBatchRef: null,
      },
    ])
    expect(csv).toBe(sampleText('15_Accrued_Expenses.csv'))

    const unknown = accruedExpenseCsv([
      {
        expenseId: 'x',
        payeeName: 'ก',
        payeeTaxId: null,
        category: 'ค่าตอบแทน',
        caseRef: null,
        workDate: D('2026-06-01'),
        status: 'approved',
        grossSatang: 1,
        estimatedWhtSatang: null,
        payoutBatchRef: null,
      },
    ])
    expect(csvLines(unknown)[1]).toBe('x,ก,-,ค่าตอบแทน,-,01/06/2569,approved,0.01,-,-')
  })
})

describe('16_Advance_Balance.csv (มติ PO 06/10/2569 U94 ข้อ 3)', () => {
  it('ตรงไฟล์ตัวอย่าง · ยกมา + จ่าย − เคลียร์ − คืนหักกลบ − คืนรับแยก = คงเหลือ ทุกแถวของตัวอย่าง', () => {
    const csv = advanceBalanceCsv([
      {
        payeeName: 'ประยุทธ์ บุญมี',
        payeeTaxId: '3100000004600',
        openingSatang: 55_000,
        paidSatang: 300_000,
        clearedSatang: 245_000,
        returnedOffsetSatang: 55_000,
        returnedDirectSatang: 0,
        closingSatang: 55_000,
        advanceRefs: ['ADV-3F2A9C1B', 'ADV-7D41E0AA'],
      },
      {
        payeeName: 'สมชาย ใจดี',
        payeeTaxId: '3100000004603',
        openingSatang: 0,
        paidSatang: 500_000,
        clearedSatang: 380_000,
        returnedOffsetSatang: 0,
        returnedDirectSatang: 120_000,
        closingSatang: 0,
        advanceRefs: ['ADV-91BC22F0'],
      },
    ])
    expect(csv).toBe(sampleText('16_Advance_Balance.csv'))
    for (const line of csvLines(sampleText('16_Advance_Balance.csv')).slice(1, -1)) {
      const cells = line.split(',').slice(2, 8).map((cell) => Math.round(Number(cell) * 100))
      const [opening, paid, cleared, offset, direct, closing] = cells
      expect((opening ?? 0) + (paid ?? 0) - (cleared ?? 0) - (offset ?? 0) - (direct ?? 0)).toBe(closing)
    }
  })

  it('ไม่มีใบ ⇒ advance_refs = "-"', () => {
    const line = csvLines(
      advanceBalanceCsv([
        {
          payeeName: 'ก',
          payeeTaxId: null,
          openingSatang: 0,
          paidSatang: 0,
          clearedSatang: 0,
          returnedOffsetSatang: 0,
          returnedDirectSatang: 0,
          closingSatang: 0,
          advanceRefs: [],
        },
      ]),
    )[1]
    expect(line).toBe('ก,-,0.00,0.00,0.00,0.00,0.00,0.00,-')
  })
})

describe('00_Control_Totals.csv + หน้าปก (มติ PO 06/10/2569 U94 ข้อ 4)', () => {
  const lines = buildControlTotals(CONTROL_TOTALS_FIXTURE)

  it('ประกอบได้ตรงไฟล์ตัวอย่างทั้งไฟล์', () => {
    expect(controlTotalsCsv(lines)).toBe(sampleText('00_Control_Totals.csv'))
  })

  it('ทุกไฟล์ 01–16 มีบรรทัดควบคุม · จำนวนแถวเท่ากับแถวที่เขียนไฟล์จริง · ยอดเท่าผลรวมคอลัมน์ในไฟล์', () => {
    const fileNames = new Set(lines.filter((line) => line.section === 'file').map((line) => line.file))
    expect([...fileNames]).toEqual(PACK_FILES.filter((file) => file.no !== '00').map((file) => file.fileName))

    // เทียบกับไฟล์ที่ builder ของแต่ละไฟล์เขียนจริง — ผลรวมคอลัมน์จาก CSV ต้องเท่ากับยอดควบคุม
    const files: Record<string, string> = {
      '03_Expenses.csv': expenseCsv(CONTROL_TOTALS_FIXTURE.expenses),
      '04_Payments.csv': paymentCsv(CONTROL_TOTALS_FIXTURE.payments),
      '12_Tax_Invoices.csv': taxInvoiceCsv(CONTROL_TOTALS_FIXTURE.taxInvoices),
      '15_Accrued_Expenses.csv': accruedExpenseCsv(CONTROL_TOTALS_FIXTURE.accruedExpenses),
      '16_Advance_Balance.csv': advanceBalanceCsv(CONTROL_TOTALS_FIXTURE.advanceBalances),
    }
    for (const [fileName, csv] of Object.entries(files)) {
      const [header, ...rows] = csvLines(csv).filter((line) => line !== '')
      const columns = (header ?? '').split(',')
      for (const line of lines.filter((entry) => entry.section === 'file' && entry.file === fileName)) {
        expect(line.rowCount, fileName).toBe(rows.length)
        const index = columns.indexOf(line.item)
        const total = rows
          .map((row) => row.split(',')[index] ?? '')
          .map((cell) => (cell === '-' ? 0 : Math.round(Number(cell) * 100)))
          .reduce((sum, value) => sum + value, 0)
        expect(total, `${fileName}:${line.item}`).toBe(line.amountSatang)
      }
    }
  })

  it('ยอดสรุปกรองตามความหมาย: VAT ขายไม่รวมใบยกเลิก · ใบลดหนี้ติดลบ ใบเพิ่มหนี้ที่ยกเลิกไม่นับ · ภาษีลูกค้าหักเฉพาะในงวด · เงินรอตรวจสอบเฉพาะที่ค้าง', () => {
    const amount = (item: string): number | null =>
      lines.find((line) => line.section === 'summary' && line.item === item)?.amountSatang ?? null
    expect(lines.filter((line) => line.section === 'summary').map((line) => line.item)).toEqual([
      'revenue_before_vat',
      'output_vat_documents',
      'output_vat_credit_debit_notes',
      'cash_received',
      'customer_wht',
      'payout_transfer',
      'wht_withheld',
      'wht_paid_by_payer',
      'wht_remit_total',
      'accrued_expenses',
      'unbilled_revenue',
      'suspense_outstanding',
      'advance_balance',
    ])
    expect(amount('output_vat_documents')).toBe(84_000)
    expect(amount('output_vat_credit_debit_notes')).toBe(-700)
    expect(amount('customer_wht')).toBe(36_000)
    expect(amount('payout_transfer')).toBe(849_500)
    expect(amount('suspense_outstanding')).toBe(50_000)
    expect(amount('advance_balance')).toBe(55_000)
  })

  it('U114 (BUG-177): ภาษีหัก ณ ที่จ่ายแยก หักจากผู้รับ / บริษัทออกให้ / รวมต้องนำส่ง — ทั้งไฟล์ 00 และหน้าปก', () => {
    const base = CONTROL_TOTALS_FIXTURE.wht[0]
    if (base === undefined) throw new Error('fixture')
    const wht = [
      { ...base, certificateNumber: 'WHT-2569-017', grossSatang: 1_220_000, whtSatang: 36_600, whtCondition: 'withhold' as const },
      // (2)/(3): gross = เงินได้ + ภาษีที่ออกให้
      { ...base, certificateNumber: 'WHT-2569-019', grossSatang: 1_030_928, whtSatang: 30_928, whtCondition: 'pay_always' as const },
      { ...base, certificateNumber: 'WHT-2569-020', grossSatang: 1_271_604, whtSatang: 37_037, whtCondition: 'pay_once' as const },
    ]
    const split = buildControlTotals({ ...CONTROL_TOTALS_FIXTURE, wht })
    const get = (item: string) => split.find((line) => line.section === 'summary' && line.item === item)
    expect(get('wht_withheld')).toMatchObject({ rowCount: 1, amountSatang: 36_600 })
    expect(get('wht_paid_by_payer')).toMatchObject({ rowCount: 2, amountSatang: 67_965 })
    expect(get('wht_remit_total')).toMatchObject({ rowCount: 3, amountSatang: 104_565 })
    // U128 — แถวกลับรายการ (ยอดติดลบ) หักกลบในยอดสรุปและผลรวมไฟล์ 05 เอง
    const [first, second] = wht
    if (first === undefined || second === undefined) throw new Error('fixture')
    const reversed = buildControlTotals({ ...CONTROL_TOTALS_FIXTURE, wht: [...wht, whtReversalRow(first), whtReversalRow(second)] })
    const getReversed = (item: string) => reversed.find((line) => line.section === 'summary' && line.item === item)
    expect(getReversed('wht_withheld')?.amountSatang).toBe(0)
    expect(getReversed('wht_paid_by_payer')?.amountSatang).toBe(37_037)
    expect(getReversed('wht_remit_total')?.amountSatang).toBe(37_037)
    const file05 = reversed.find((line) => line.section === 'file' && line.item === 'wht_baht' && line.file.startsWith('05'))
    expect(file05?.amountSatang).toBe(37_037)
    // ป้ายหักจากผู้รับต้องไม่รวมภาษีที่บริษัทออกให้
    expect(get('wht_withheld')?.description).toContain('หักจากผู้รับ')
    expect(get('wht_paid_by_payer')?.description).toContain('บริษัทออกให้')
    const csv = controlTotalsCsv(split)
    expect(csv).toContain(',wht_withheld,ภาษีหัก ณ ที่จ่าย — หักจากผู้รับ (ใบ 50 ทวิ ที่มีผล),1,366.00')
    expect(csv).toContain(',wht_paid_by_payer,ภาษีหัก ณ ที่จ่าย — บริษัทออกให้ (ไม่ได้หักจากผู้รับ),2,679.65')
    expect(csv).toContain(',wht_remit_total,ภาษีหัก ณ ที่จ่าย — รวมต้องนำส่ง,3,1045.65')
    const cover = buildPackCoverDoc({
      organizationName: 'บริษัททดสอบ',
      periodLabel: 'ตุลาคม 2569',
      version: 6,
      generatedByName: 'บัญชี',
      generatedAt: new Date('2026-10-06T04:40:00Z'),
      contentDigest: 'abc',
      checks: [],
      controlTotals: controlTotalsForCover(split),
    })
    const amounts = cover.totals.filter((row) => row.label.startsWith('ภาษีหัก ณ ที่จ่าย')).map((row) => row.amountText)
    expect(amounts).toEqual(['366.00', '679.65', '1,045.65'])
  })

  it('หน้าปก: จำนวนแถวต่อไฟล์ + ตารางยอดสรุปค่าเดียวกับไฟล์ 00 · ช่วงไฟล์ 00–17 · หมายเหตุโฟลเดอร์ PDF', () => {
    const doc = buildPackCoverDoc({
      organizationName: 'บริษัททดสอบ',
      periodLabel: 'มิถุนายน 2569',
      version: 1,
      generatedByName: 'บัญชี',
      generatedAt: new Date('2026-07-03T03:30:00Z'),
      contentDigest: 'abc',
      checks: [],
      controlTotals: controlTotalsForCover(lines),
    })
    expect(doc.fileRangeLabel).toBe('00–17')
    expect(doc.files).toHaveLength(18)
    expect(doc.files.find((file) => file.fileName === '00_Control_Totals.csv')?.rowCountText).toBe(String(lines.length))
    expect(doc.files.find((file) => file.fileName === '01_Revenue.csv')?.rowCountText).toBe('2')
    expect(doc.totals).toHaveLength(13)
    expect(doc.totals[0]).toEqual({ label: 'รายได้ก่อน VAT (รายได้ที่รับรู้ในงวด)', amountText: '12,750.00' })
    expect(doc.attachmentNote).toBe(PACK_ATTACHMENT_NOTE)
    for (const dir of ['tax_invoices/', 'wht_certificates/', 'vouchers/', 'billing_invoices/']) {
      expect(doc.attachmentNote).toContain(dir)
    }
    // ไม่ส่งยอดควบคุม ⇒ จำนวนแถวเป็น "-" และไม่มีตาราง
    const bare = buildPackCoverDoc({
      organizationName: 'x',
      periodLabel: 'x',
      version: 1,
      generatedByName: 'x',
      generatedAt: new Date(),
      contentDigest: 'x',
      checks: [],
    })
    expect(bare.totals).toEqual([])
    expect(bare.files.every((file) => file.rowCountText === '-')).toBe(true)
  })
})

describe('PDF ใน zip — เพดานร่วมทุกโฟลเดอร์ (มติ PO U57 · U94 ข้อ 5)', () => {
  it('เพดานจำนวน: ได้ครบเท่าที่กำหนด แล้วปฏิเสธตลอดไป', () => {
    const budget = createPackPdfBudget({ limit: 2, timeBudgetMs: 1_000, now: () => 0 })
    expect([budget.tryTake(), budget.tryTake(), budget.tryTake(), budget.tryTake()]).toEqual([true, true, false, false])
    expect(budget.used).toBe(2)
  })

  it('เพดานเวลา: นับจากตอนสร้าง (ทั้งชุด ไม่ใช่ต่อโฟลเดอร์)', () => {
    let clock = 0
    const budget = createPackPdfBudget({ limit: 100, timeBudgetMs: 50, now: () => clock })
    expect(budget.tryTake()).toBe(true)
    clock = 51
    expect(budget.tryTake()).toBe(false)
  })

  it('ชื่อไฟล์/รายชื่อไม่ได้แนบของแต่ละโฟลเดอร์', () => {
    expect(packPdfEntryName('wht_certificates', 'WHT-2569-001')).toBe('wht_certificates/WHT-2569-001.pdf')
    expect(packPdfEntryName('vouchers', 'PV-A/B 1')).toBe('vouchers/PV-A_B_1.pdf')
    expect(packNotAttachedFile('vouchers')).toBe('vouchers/NOT_ATTACHED.txt')
    const text = packNotAttachedText({
      documentLabel: 'หนังสือรับรองการหักภาษี ณ ที่จ่าย',
      unit: 'ใบ',
      csvFileName: '05_WHT_Data.csv',
      refs: ['WHT-1', 'WHT-2'],
    })
    expect(text).toContain('2 ใบ')
    expect(text).toContain('05_WHT_Data.csv')
    expect(text).toContain('WHT-1\r\nWHT-2')
    expect(
      packNotAttachedText({ documentLabel: 'ใบแจ้งหนี้', unit: 'ใบ', csvFileName: null, refs: ['BL-1'] }),
    ).not.toContain('.csv')
  })
})

describe('BUG-167/168 — จำนวนเอกสารแนบ + ชื่อไฟล์เอกสารยกเลิก', () => {
  it('เอกสารยกเลิกต่อท้าย -CANCELLED แบบเดียวกันทุกโฟลเดอร์', () => {
    expect(packPdfRef('WHT-2569-009', true)).toBe('WHT-2569-009-CANCELLED')
    expect(packPdfRef('WHT-2569-009', false)).toBe('WHT-2569-009')
    expect(taxInvoicePdfEntryName('INV-0005', true)).toBe('tax_invoices/INV-0005-CANCELLED.pdf')
    expect(taxInvoicePdfEntryName('INV-0005')).toBe('tax_invoices/INV-0005.pdf')
    expect(packPdfEntryName('wht_certificates', packPdfRef('WHT-2569-009', true))).toBe(
      'wht_certificates/WHT-2569-009-CANCELLED.pdf',
    )
  })

  it('นับ PDF ที่แนบจริงรวมทุกโฟลเดอร์ · ค่าที่อ่านไม่ออก = 0', () => {
    expect(
      packAttachmentCount({
        tax_invoices: { attached: 8, not_attached: [] },
        wht_certificates: { attached: 17, not_attached: [] },
        vouchers: { attached: 12, not_attached: ['SLIP-X'] },
        billing_invoices: { attached: 6, not_attached: [] },
      }),
    ).toBe(43)
    expect(packAttachmentCount(null)).toBe(0)
    expect(packAttachmentCount([])).toBe(0)
    expect(packAttachmentCount({ x: { attached: -1 }, y: { attached: '3' }, z: null })).toBe(0)
  })
})

describe('17_Company_Documents.csv (มติ PO 07/10/2569 U132)', () => {
  it('ประกอบได้ตรงไฟล์ตัวอย่าง · บริษัทที่ไม่มีเอกสารได้แถวคำเตือน', () => {
    expect(companyDocumentCsv(CONTROL_TOTALS_FIXTURE.companyDocuments)).toBe(sampleText('17_Company_Documents.csv'))
  })
})
