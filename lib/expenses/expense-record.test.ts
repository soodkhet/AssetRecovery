import { describe, expect, it } from 'vitest'
import { ExpenseRecordError } from '@/lib/expenses/errors'
import {
  ADVANCE_CATEGORY_LABEL,
  assertCostCenterEditable,
  assertNoAmountEdit,
  buildDocumentException,
  expenseCategoryOf,
  isSyncableBatchStatus,
  requiresReceipt,
  resolveDocumentStatus,
  resolveMappingRule,
  summarizeExpenseRecords,
  type ExpenseAmountRow,
} from '@/lib/expenses/expense-record'

/** เทสต์ของไฟล์ 32 §16 + กติกา §6.1–§6.3/§10/§11 — pure ทั้งหมด ไม่แตะ DB */

describe('sync เฉพาะรอบจ่ายที่จ่ายจริง (`32` §6.1/§16)', () => {
  it('completed เท่านั้นที่ sync ได้', () => {
    expect(isSyncableBatchStatus('completed')).toBe(true)
  })

  it('file_generated / approved / draft ยังไม่ sync (จ่ายจริงหรือยังไม่รู้)', () => {
    for (const status of ['draft', 'pending_approval', 'approved', 'file_generated', 'cancelled']) {
      expect(isSyncableBatchStatus(status), status).toBe(false)
    }
  })
})

describe('ประเภทค่าใช้จ่าย (`32` §7.1)', () => {
  it('ใช้ป้ายจากทะเบียนกลางของ `41` §6.6', () => {
    expect(expenseCategoryOf({ expenseType: 'fuel' })).toBe('ค่าน้ำมัน')
    expect(expenseCategoryOf({ expenseType: 'hotel' })).toBe('ค่าที่พัก')
    expect(expenseCategoryOf({ expenseType: 'commission' })).toBe('คอมมิชชั่น')
  })

  it('รายการที่มาจากเงินทดรองจ่าย (ไม่มี expense ต้นทาง) ได้ป้ายของตัวเอง', () => {
    expect(expenseCategoryOf({ expenseType: null })).toBe(ADVANCE_CATEGORY_LABEL)
  })
})

describe('ความครบถ้วนของเอกสาร (`32` §6.3)', () => {
  it('ที่พัก/ใบเสร็จ = บังคับแนบ · ประเภทที่คำนวณจากแผนไม่บังคับ', () => {
    expect(requiresReceipt('hotel')).toBe(true)
    expect(requiresReceipt('receipt')).toBe(true)
    expect(requiresReceipt('fuel')).toBe(false)
    expect(requiresReceipt('allowance')).toBe(false)
    expect(requiresReceipt('manual')).toBe(false)
    expect(requiresReceipt(null)).toBe(false)
  })

  it('บังคับแนบแต่ไม่มีไฟล์ ⇒ incomplete', () => {
    expect(resolveDocumentStatus({ expenseType: 'hotel', receiptFileUrl: null })).toBe('incomplete')
    expect(resolveDocumentStatus({ expenseType: 'receipt', receiptFileUrl: '   ' })).toBe('incomplete')
  })

  it('แนบแล้ว หรือไม่ต้องแนบ ⇒ complete', () => {
    expect(resolveDocumentStatus({ expenseType: 'hotel', receiptFileUrl: 'field/receipts/a.jpg' })).toBe('complete')
    expect(resolveDocumentStatus({ expenseType: 'fuel', receiptFileUrl: null })).toBe('complete')
    expect(resolveDocumentStatus({ expenseType: null, receiptFileUrl: null })).toBe('complete')
  })
})

describe('Cost Center mapping (`32` §6.2/§10/§11)', () => {
  it('ไม่มีต้นทางอัตโนมัติ = manual · มี = auto', () => {
    expect(resolveMappingRule({ autoCostCenterId: null })).toBe('manual')
    expect(resolveMappingRule({ autoCostCenterId: 'cc-1' })).toBe('auto')
  })

  it('manual แก้ได้', () => {
    expect(() => assertCostCenterEditable('manual', 'er-1')).not.toThrow()
  })

  it('auto แก้ไม่ได้ ⇒ COST_CENTER_AUTO_EDIT', () => {
    try {
      assertCostCenterEditable('auto', 'er-1')
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect(error).toBeInstanceOf(ExpenseRecordError)
      expect((error as ExpenseRecordError).code).toBe('COST_CENTER_AUTO_EDIT')
      expect((error as ExpenseRecordError).status).toBe(400)
    }
  })
})

describe('ห้ามแก้ยอดเงินตรง (`32` §10/§11/§16)', () => {
  it('body ที่มี netSatang ⇒ EDIT_AMOUNT_DIRECTLY พร้อมบอกฟิลด์', () => {
    try {
      assertNoAmountEdit({ costCenterId: 'cc-1', reason: 'x', netSatang: 1 })
      expect.unreachable('ต้องโยน error')
    } catch (error) {
      expect((error as ExpenseRecordError).code).toBe('EDIT_AMOUNT_DIRECTLY')
      expect((error as ExpenseRecordError).context).toEqual({ fields: ['netSatang'] })
    }
  })

  it('จับทั้งรูป camelCase และ snake_case (ทางเข้าอื่นก็ต้องโดน)', () => {
    expect(() => assertNoAmountEdit({ gross_satang: 100 })).toThrow(
      expect.objectContaining({ code: 'EDIT_AMOUNT_DIRECTLY' }),
    )
    expect(() => assertNoAmountEdit({ whtSatang: 0 })).toThrow(
      expect.objectContaining({ code: 'EDIT_AMOUNT_DIRECTLY' }),
    )
  })

  it('body ปกติ (map cost center อย่างเดียว) ผ่าน · body ที่ไม่ใช่ object ไม่พัง', () => {
    expect(() => assertNoAmountEdit({ costCenterId: 'cc-1', reason: 'ทีมกลาง' })).not.toThrow()
    expect(() => assertNoAmountEdit(null)).not.toThrow()
    expect(() => assertNoAmountEdit('x')).not.toThrow()
  })
})

describe('exception อัตโนมัติเมื่อเอกสารไม่ครบ (`32` §9 · `34` §6.1)', () => {
  const exception = buildDocumentException({
    payeeName: 'ประยุทธ์ บุญมี',
    batchName: 'PB-2569-06-OUT',
    category: 'ค่าที่พัก',
    expenseRecordId: 'er-1',
  })

  it('เป็น warning ไม่ใช่ critical (ใบเสร็จตามเก็บได้ ไม่บล็อก Export ทั้งรอบ)', () => {
    expect(exception.level).toBe('warning')
  })

  it('ระบุผู้รับเงิน/รอบจ่าย/ประเภท และอ้างกลับรายการต้นทางได้', () => {
    expect(exception.title).toContain('ประยุทธ์ บุญมี')
    expect(exception.description).toContain('PB-2569-06-OUT')
    expect(exception.description).toContain('ค่าที่พัก')
    expect(exception.sourceRef).toBe('er-1')
    expect(exception.sourceModule).toBe('expense')
  })
})

describe('สรุปยอดหัวตาราง (`32` §8)', () => {
  const rows: ExpenseAmountRow[] = [
    { grossSatang: 45_000_00, whtSatang: 1_350_00, netSatang: 43_650_00, documentStatus: 'complete', costCenterId: 'cc-1' },
    { grossSatang: 12_000_00, whtSatang: 360_00, netSatang: 11_640_00, documentStatus: 'incomplete', costCenterId: null },
    { grossSatang: 1_500_50, whtSatang: 0, netSatang: 1_500_50, documentStatus: 'incomplete', costCenterId: null },
  ]

  it('รวมเป็น satang ตรงทุกช่อง + นับรายการที่ต้องตามเก็บ', () => {
    expect(summarizeExpenseRecords(rows)).toEqual({
      count: 3,
      grossSatang: 58_500_50,
      whtSatang: 1_710_00,
      netSatang: 56_790_50,
      incompleteCount: 2,
      unmappedCount: 2,
    })
  })

  it('ไม่มีรายการ = ศูนย์ทุกช่อง (ไม่ใช่ NaN)', () => {
    expect(summarizeExpenseRecords([])).toEqual({
      count: 0,
      grossSatang: 0,
      whtSatang: 0,
      netSatang: 0,
      incompleteCount: 0,
      unmappedCount: 0,
    })
  })
})
