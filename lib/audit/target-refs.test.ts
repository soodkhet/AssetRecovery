import { describe, expect, it } from 'vitest'
import { auditRefLabel, auditValueDisplay } from '@/lib/audit/log-display'
import {
  auditTargetRef,
  auditValueRefs,
  bankTransactionRefLabel,
  caseRefLabel,
  cashReceiptRefLabel,
  exportRecordRefLabel,
  groupAuditRefs,
} from '@/lib/audit/target-refs'

/** known H-06 — เป้าหมาย/ค่าอ้างอิงในบันทึกการใช้งานเป็นชื่อที่อ่านได้ (ส่วน pure) */

const PERIOD = '0a1b2c3d-0000-4000-8000-000000000001'
const CASE = '0a1b2c3d-0000-4000-8000-000000000002'
const LOT = '0a1b2c3d-0000-4000-8000-000000000003'

describe('auditTargetRef', () => {
  it('ชนิดที่รู้จัก + UUID ⇒ ref (รวมชื่อเอกพจน์ billing_batch)', () => {
    expect(auditTargetRef({ targetType: 'cases', targetId: CASE })).toEqual({ type: 'cases', id: CASE })
    expect(auditTargetRef({ targetType: 'billing_batch', targetId: LOT })).toEqual({ type: 'billing_batches', id: LOT })
  })
  it('ไม่รู้จักชนิด / ไม่มี id / ไม่ใช่ UUID ⇒ null', () => {
    expect(auditTargetRef({ targetType: 'sessions', targetId: CASE })).toBeNull()
    expect(auditTargetRef({ targetType: 'cases', targetId: null })).toBeNull()
    expect(auditTargetRef({ targetType: 'cases', targetId: 'not-a-uuid' })).toBeNull()
  })
})

describe('auditValueRefs + groupAuditRefs', () => {
  it('เก็บเฉพาะฟิลด์อ้างอิงที่รู้จัก (snake/camel) ค่าเป็น UUID · รวมต่อชนิดไม่ซ้ำ', () => {
    const refs = [
      ...auditValueRefs({ period_id: PERIOD, status: 'open', note: CASE }),
      ...auditValueRefs({ periodId: PERIOD, lotId: LOT, caseId: CASE }),
      ...auditValueRefs(null),
      ...auditValueRefs(['x']),
    ]
    expect(refs).toHaveLength(4)
    const grouped = groupAuditRefs(refs)
    expect(grouped.get('accounting_periods')).toEqual([PERIOD])
    expect(grouped.get('handover_lots')).toEqual([LOT])
    expect(grouped.get('cases')).toEqual([CASE])
  })
})

describe('ป้ายที่แสดง', () => {
  it('เคสรอบที่ 2 ขึ้นไปบอกรอบ', () => {
    expect(caseRefLabel('FT-001', 1)).toBe('FT-001')
    expect(caseRefLabel('FT-001', 2)).toBe('FT-001 (รอบที่ 2)')
  })
  it('ค่าก่อน/หลังที่เป็น id ⇒ ชื่อจาก refLabels · ไม่มีป้าย/ฟิลด์ทั่วไป ⇒ ค่าเดิม', () => {
    const labels = { [PERIOD]: 'ตุลาคม 2569' }
    expect(auditValueDisplay(PERIOD, 'period_id', 'exceptions', labels)).toBe('ตุลาคม 2569')
    expect(auditValueDisplay(PERIOD.toUpperCase(), 'period_id', 'exceptions', labels)).toBe('ตุลาคม 2569')
    expect(auditValueDisplay(CASE, 'period_id', 'exceptions', labels)).toBe(CASE)
    expect(auditValueDisplay(PERIOD, 'note', 'exceptions', labels)).toBe(PERIOD)
    expect(auditValueDisplay('open', 'status', 'exceptions', labels)).toBe('เปิดอยู่')
    expect(auditRefLabel(PERIOD, 'note', labels)).toBeNull()
  })
})

describe('ทดสอบซ้ำ local LR5-01 — ชุดส่งบัญชี / แบรนด์ / รายการเดินบัญชี / รายการรับเงิน', () => {
  it('ชนิดเป้าหมายใหม่ถูกรู้จัก', () => {
    for (const type of ['export_records', 'device_brands', 'bank_transactions', 'cash_receipts'] as const) {
      expect(auditTargetRef({ targetType: type, targetId: CASE })).toEqual({ type, id: CASE })
    }
  })
  it('ฟิลด์อ้างอิง bank_transaction_id / cashReceiptId / brandId / exportRecordId', () => {
    const refs = auditValueRefs({ bank_transaction_id: CASE, cashReceiptId: LOT, brandId: PERIOD, exportRecordId: CASE })
    const grouped = groupAuditRefs(refs)
    expect(grouped.get('bank_transactions')).toEqual([CASE])
    expect(grouped.get('cash_receipts')).toEqual([LOT])
    expect(grouped.get('device_brands')).toEqual([PERIOD])
    expect(grouped.get('export_records')).toEqual([CASE])
  })
  it('รูปแบบป้าย', () => {
    expect(exportRecordRefLabel('ตุลาคม 2569', 'v1.2')).toBe('ชุดส่งบัญชี ตุลาคม 2569 v1.2')
    expect(bankTransactionRefLabel('08/10/2569', '฿1,070.00', 'กสิกรไทย')).toBe('08/10/2569 · ฿1,070.00 · กสิกรไทย')
    expect(cashReceiptRefLabel('BL-2569-010', '฿1,070.00')).toBe('รับเงิน BL-2569-010 · ฿1,070.00')
  })
})
