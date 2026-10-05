import { describe, expect, it } from 'vitest'
import { ModuleError } from '@/lib/api/errors'
import { WARNING_ONLY_CODES } from '@/lib/api/error-catalog'
import { compareAssetIdentity } from '@/lib/warehouse/imei'
import {
  assertIntakeCondition,
  assertIntakeIdentity,
  assertRejectReason,
  IMEI_MISMATCH_FORM_WARNING,
  imeiMismatchWarning,
  INTAKE_PHOTO_ANGLES,
  requiredIntakeIdentity,
  requiresConditionNote,
} from '@/lib/warehouse/intake'

/** `44` §8.2 · §10 · §12 — T02/T03/T04 ของ §17 */

const IMEI = '355000000000001'

describe('assertIntakeCondition', () => {
  it('ไม่เลือกสภาพ = INTAKE_MISSING_CONDITION (T02 ฝั่งไม่เลือก)', () => {
    expect(() => assertIntakeCondition({ condition: null, conditionNote: null })).toThrowError(
      /INTAKE_MISSING_CONDITION/,
    )
  })

  it('สภาพปกติไม่ต้องมีรายละเอียด', () => {
    expect(() => assertIntakeCondition({ condition: 'normal', conditionNote: null })).not.toThrow()
  })

  it('ชำรุด/ขาดหาย ต้องมีรายละเอียด (T02)', () => {
    for (const condition of ['damaged', 'partial_loss'] as const) {
      expect(() => assertIntakeCondition({ condition, conditionNote: null })).toThrowError(/INTAKE_MISSING_NOTE/)
      expect(() => assertIntakeCondition({ condition, conditionNote: '   ' })).toThrowError(/INTAKE_MISSING_NOTE/)
      expect(() => assertIntakeCondition({ condition, conditionNote: 'จอแตกมุมขวาบน' })).not.toThrow()
    }
  })

  it('requiresConditionNote ตรงกับกติกา §10', () => {
    expect(requiresConditionNote('normal')).toBe(false)
    expect(requiresConditionNote('damaged')).toBe(true)
    expect(requiresConditionNote('partial_loss')).toBe(true)
    expect(requiresConditionNote(null)).toBe(false)
  })
})

describe('assertRejectReason (T04)', () => {
  it('เหตุผลว่าง/เว้นวรรคล้วน/ไม่ส่งมา = REJECT_MISSING_REASON', () => {
    for (const reason of ['', '   ', null, undefined]) {
      expect(() => assertRejectReason(reason)).toThrowError(/REJECT_MISSING_REASON/)
    }
  })

  it('คืนค่าที่ trim แล้วให้เก็บลง DB ได้ทันที', () => {
    expect(assertRejectReason('  IMEI ไม่ตรงกับสัญญา  ')).toBe('IMEI ไม่ตรงกับสัญญา')
  })

  it('status ของ code นี้เป็น 400 (reject ไม่ใช่ warning)', () => {
    try {
      assertRejectReason('')
      expect.unreachable('ต้อง throw')
    } catch (error) {
      expect((error as ModuleError).status).toBe(400)
    }
  })
})

describe('imeiMismatchWarning (T03 — เตือน ไม่ block)', () => {
  const matched = compareAssetIdentity(
    { imeiContract: IMEI, serialContract: null },
    { imeiActual: IMEI, serialActual: null },
  )
  const mismatched = compareAssetIdentity(
    { imeiContract: IMEI, serialContract: null },
    { imeiActual: '355000000000999', serialActual: null },
  )

  it('ตรงกัน = ไม่มี warning', () => {
    expect(imeiMismatchWarning(matched)).toBeUndefined()
  })

  it('ไม่ตรง = warning code IMEI_MISMATCH (ไม่ใช่ error)', () => {
    const warning = imeiMismatchWarning(mismatched)
    expect(warning?.code).toBe('IMEI_MISMATCH')
    expect(WARNING_ONLY_CODES).toContain('IMEI_MISMATCH')
  })

  it('บอกช่องที่ไม่ตรง แต่ไม่ใส่เลข IMEI ลงในข้อความ (ค่าเต็มแสดงบนหน้าจอ/audit อยู่แล้ว)', () => {
    const warning = imeiMismatchWarning(mismatched)
    expect(warning?.message).toContain('IMEI')
    expect(warning?.message).not.toContain(IMEI)
  })

  it('เคสที่สัญญาไม่มีทั้ง IMEI/serial ก็ต้องเตือน', () => {
    const nothing = compareAssetIdentity(
      { imeiContract: null, serialContract: null },
      { imeiActual: null, serialActual: null },
    )
    expect(imeiMismatchWarning(nothing)?.code).toBe('IMEI_MISMATCH')
  })
})

describe('รูปหลักฐาน 7 มุม (§8.2 ขั้น 3/3)', () => {
  it('มีครบ 7 มุมและไม่ซ้ำกัน', () => {
    expect(INTAKE_PHOTO_ANGLES).toHaveLength(7)
    expect(new Set(INTAKE_PHOTO_ANGLES).size).toBe(7)
  })
})

describe('assertIntakeIdentity — ต้องกรอกค่าที่ตรวจจริงก่อนรับเข้า (UAT BUG-074)', () => {
  const codeOf = (run: () => void): string | null => {
    try {
      run()
      return null
    } catch (error) {
      return error instanceof ModuleError ? error.code : String(error)
    }
  }

  it('สัญญามี IMEI ⇒ ต้องกรอก IMEI (กรอกแค่ serial ไม่พอ)', () => {
    const contract = { imeiContract: IMEI, serialContract: 'SN-1' }
    expect(requiredIntakeIdentity(contract)).toBe('imei')
    expect(codeOf(() => assertIntakeIdentity(contract, { imeiActual: null, serialActual: 'SN-1' }))).toBe(
      'REQUIRED_MISSING',
    )
    expect(codeOf(() => assertIntakeIdentity(contract, { imeiActual: IMEI, serialActual: null }))).toBeNull()
  })

  it('เครื่องที่ไม่มี IMEI (มีแค่ serial) ⇒ ต้องกรอก serial แทน ไม่บังคับ IMEI', () => {
    const contract = { imeiContract: null, serialContract: 'SN-TAB-001' }
    expect(requiredIntakeIdentity(contract)).toBe('serial')
    expect(codeOf(() => assertIntakeIdentity(contract, { imeiActual: null, serialActual: '  ' }))).toBe(
      'REQUIRED_MISSING',
    )
    expect(codeOf(() => assertIntakeIdentity(contract, { imeiActual: null, serialActual: 'SN-TAB-001' }))).toBeNull()
  })

  it('สัญญาไม่มีทั้งคู่ ⇒ กรอกช่องใดก็ได้ · ว่างทั้งคู่ = ปฏิเสธ', () => {
    const contract = { imeiContract: null, serialContract: null }
    expect(requiredIntakeIdentity(contract)).toBe('either')
    expect(codeOf(() => assertIntakeIdentity(contract, { imeiActual: null, serialActual: null }))).toBe(
      'REQUIRED_MISSING',
    )
    expect(codeOf(() => assertIntakeIdentity(contract, { imeiActual: null, serialActual: 'SN-X' }))).toBeNull()
  })

  it('ข้อความเตือนบนฟอร์ม (ก่อนบันทึก) ไม่อ้างว่า "บันทึกไว้แล้ว" (UAT BUG-083)', () => {
    expect(IMEI_MISMATCH_FORM_WARNING.message).not.toContain('บันทึกค่าที่ตรวจจริงไว้แล้ว')
  })
})
