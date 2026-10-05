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
  whtPctText,
  ADJUSTMENT_HEADERS,
  BANK_RECON_HEADERS,
  CASH_RECEIPT_HEADERS,
  CHECKLIST_HEADERS,
  CREDIT_NOTE_HEADERS,
  creditNoteCsv,
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
  it('ครบ 14 ไฟล์ เลข 01–14 ต่อเนื่องไม่มีช่องว่าง (09 = มติ PO U21 · 10/11 = U40/U41 · 12/13 = U57/U68 · 14 = U87)', () => {
    expect(PACK_FILES).toHaveLength(14)
    expect(PACK_FILES.map((file) => file.no)).toEqual([
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
    ])
    expect(PACK_FILES.map((file) => file.fileName)).toEqual([
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
    ])
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
      'ประยุทธ์ บุญมี,ค่าตอบแทนติดตามทรัพย์ (commission),8500.00,255.00,8245.00,',
    )
  })

  it('ค่าใช้จ่าย (มติ U96 #14): receipt_in_company_name ต่อท้ายสุด — ค่าที่พัก Y/N · ชนิดอื่นว่าง', () => {
    expect(EXPENSE_HEADERS.at(-1)).toBe('receipt_in_company_name')
    expect(EXPENSE_HEADERS.slice(0, 5)).toEqual(['payee', 'category', 'gross_baht', 'wht_baht', 'net_baht'])
    const base = { payeeName: 'ก', category: 'ค่าที่พัก', grossSatang: 80000, whtSatang: 0, netSatang: 80000 }
    const lines = expenseCsv([
      { ...base, receiptInCompanyName: true },
      { ...base, receiptInCompanyName: false },
    ])
      .slice(CSV_BOM.length)
      .split('\r\n')
    expect(lines[1]?.endsWith(',800.00,0.00,800.00,Y')).toBe(true)
    expect(lines[2]?.endsWith(',800.00,0.00,800.00,N')).toBe(true)
    expect(receiptInCompanyNameCell(null)).toBe('')
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
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      'PB-2569-06-002,05/07/2569,ประยุทธ์ บุญมี,8245.00,Bank Transfer,PV-2569-PB-2569-06-002-001,0.00,8245.00',
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
      },
    ])
    const [header, row] = csv.slice(CSV_BOM.length).split('\r\n')
    expect(header).toBe('payout_batch_ref,payment_date,payee,amount_baht,method,voucher_ref,advance_offset_baht,transfer_baht')
    expect(row).toBe('PB-2569-06-002,05/07/2569,ประยุทธ์ บุญมี,8245.00,Bank Transfer,PV-2569-PB-2569-06-002-001,550.00,7695.00')
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
      '0142,ประยุทธ์ บุญมี,1123456789012,30/06/2569,ค่าจ้างทำของ ม.40(8),8500.00,255.00,3.00,PND3',
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
    ])
    const lines = whtCsv([
      base,
      { ...base, certificateNumber: '0143', filingForm: 'PND53' },
      { ...base, certificateNumber: '0144', whtSatang: 0, whtPct: '0.00', filingForm: 'PND1' },
    ])
      .slice(CSV_BOM.length)
      .split('\r\n')
    expect(lines.slice(1, 4).map((line) => line.split(',').at(-1))).toEqual(['PND3', 'PND53', 'PND1'])
    // 40(2) อัตรา 0% (U16) — ภาษี 0 แต่ยังเป็นแถวของ ภ.ง.ด.1
    expect(lines[3]).toBe('0144,ประยุทธ์ บุญมี,1123456789012,30/06/2569,ค่าจ้างทำของ ม.40(8),8500.00,0.00,0.00,PND1')
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
      'CN,CN-2569-001,05/07/2569,INV-2569-0014,บริษัท สยามไฟแนนซ์ จำกัด,100.00,7.00,107.00,"ลดค่าบริการ, ตามที่ตกลง",active,ADJ-2569-06-001,สำนักงานใหญ่',
    )
    expect(lines[2]).toBe(
      'DN,DN-2569-001,06/07/2569,INV-2569-0014,บริษัท สยามไฟแนนซ์ จำกัด,50.00,3.50,53.50,เพิ่มค่าบริการ,cancelled,-,สาขาที่ 00001',
    )
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
      },
    ])
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines[0]).toBe(TAX_INVOICE_HEADERS.join(','))
    expect(lines[1]).toBe(
      'INV-2569-0014,30/06/2569,บริษัท สยามไฟแนนซ์ จำกัด,0105555000111,3730.00,261.10,3991.10,7.00,2569-06,active,-,-,-,tax_invoices/INV-2569-0014.pdf,สำนักงานใหญ่,BL-2569-002',
    )
    expect(lines[2]).toBe(
      'INV-2569-0015,30/06/2569,บริษัท สยามไฟแนนซ์ จำกัด,0105555000111,3730.00,261.10,3991.10,7.00,2569-06,cancelled,03/07/2569,"ที่อยู่ผิด, ออกใหม่",INV-2569-0016,-,สาขาที่ 00001,BL-2569-002',
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
      },
    ])
    const lines = csv.slice(CSV_BOM.length).split('\r\n')
    expect(lines[0]).toBe(ADVANCE_RETURN_HEADERS.join(','))
    expect(lines[1]).toBe('10/07/2569,ADV-3F2A9C1B,สมชาย ใจดี,550.00,payout_offset,PB-2569-07-01,-,active,-,-')
    expect(lines[2]).toBe('15/07/2569,ADV-7D41E0AA,ประยุทธ์ บุญมี,1200.00,cash,-,receipt-cash-0715.jpg,active,-,-')
    expect(lines[3]).toBe(
      '20/07/2569,ADV-91BC22F0,สมหญิง รักงาน,300.00,bank_transfer,-,slip-0720.pdf,reversed,22/07/2569,บันทึกยอดซ้ำกับรายการเดิม',
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
