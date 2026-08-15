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
  checklistDocStatus,
  checklistRows,
  checklistSheet,
  checklistSummary,
  expenseCsv,
  exportVersionLabel,
  normalizeTaxId,
  packStoragePath,
  packZipFileName,
  paymentCsv,
  payeesMissingTaxId,
  revenueCsv,
  whtCsv,
  whtPctText,
  ADJUSTMENT_HEADERS,
  BANK_RECON_HEADERS,
  CASH_RECEIPT_HEADERS,
  CHECKLIST_HEADERS,
  EXPENSE_HEADERS,
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
  it('ครบ 8 ไฟล์ เลข 01–08 ต่อเนื่องไม่มีช่องว่าง', () => {
    expect(PACK_FILES).toHaveLength(8)
    expect(PACK_FILES.map((file) => file.no)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08'])
    expect(PACK_FILES.filter((file) => file.kind === 'xlsx').map((file) => file.no)).toEqual(['08'])
  })

  it('ชื่อไฟล์ทุกตัวตรงกับไฟล์ตัวอย่างใน reference/samples', () => {
    for (const file of PACK_FILES) {
      const path = fileURLToPath(new URL(`../../reference/samples/${file.fileName}`, import.meta.url))
      expect(() => readFileSync(path), `ไม่พบตัวอย่าง ${file.fileName}`).not.toThrow()
    }
  })

  it('ชื่อไฟล์ .zip และ path ใน bucket เดินตาม version (ห้ามทับของเดิม — Rule 09)', () => {
    expect(packZipFileName('มิถุนายน 2569', 3)).toBe('AccountingPack_มิถุนายน_2569_v1.2.zip')
    expect(
      packStoragePath({ organizationId: 'org-1', yearBe: 2569, month: 6, version: 2, fileName: '01_Revenue.csv' }),
    ).toBe('org-1/2569-06/v2/01_Revenue.csv')
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
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      'ประยุทธ์ บุญมี,ค่าตอบแทนติดตามทรัพย์ (commission),8500.00,255.00,8245.00',
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
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      'PB-2569-06-002,05/07/2569,ประยุทธ์ บุญมี,8245.00,Bank Transfer,PV-2569-PB-2569-06-002-001',
    )
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
      '0142,ประยุทธ์ บุญมี,1123456789012,30/06/2569,ค่าจ้างทำของ ม.40(8),8500.00,255.00,3.00',
    )
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
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      '05/07/2569,BTR-2569-07-0012,8245.00,debit,payout_batch,PB-2569-06-002,manual_matched',
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
      },
    ])
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      '06/07/2569,เงินเข้าไม่ทราบที่มา,500.00,credit,-,-,unmatched_resolved',
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
        },
      ],
      { yearBe: 2569, month: 6 },
    )
    expect(csv.slice(CSV_BOM.length).split('\r\n')[1]).toBe(
      'ADJ-2569-06-001,revenue,SF-2026-00791,-100.00,แก้ไขยอด VAT คำนวณผิดพลาดจากปัดเศษ,Executive (คุณวิภา),03/07/2569',
    )
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
    expect(checklistDocStatus({ level: 'critical', status: 'authorized' })).toBe('ครบถ้วน')
    expect(checklistDocStatus({ level: 'critical', status: 'resolved' })).toBe('ครบถ้วน')
  })

  it('แถวที่ปิดแล้วไม่โชว์ severity/สรุปข้อยกเว้น (ตรงกับตัวอย่าง 08)', () => {
    expect(checklistRows(rows)[2]).toEqual(['tax_invoice', 'INV-2569-0014', 'ครบถ้วน', '-', '-', '-'])
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
    expect(checklistSummary(rows)).toEqual({ complete: 1, missingCritical: 1, pending: 1 })
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
