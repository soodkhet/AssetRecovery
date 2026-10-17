import { describe, expect, it } from 'vitest'
import { auditComposedFieldLabel, auditEnumValueLabel, auditFieldLabel } from '@/lib/audit/field-display'
import { auditValueDisplay } from '@/lib/audit/log-display'

/** mytester6 T-009 — ชื่อฟิลด์ในตาราง "ค่าก่อน / หลัง" เป็นภาษาไทย (ค่าตั้ง/แผนค่าตอบแทน/วันหยุด/นโยบาย/ผู้รับเงิน/เอกสาร) */
describe('auditFieldLabel()', () => {
  it('ฟิลด์จากรายงาน T-009 ⇒ ป้ายไทย (snake และ camel ได้ป้ายเดียวกัน)', () => {
    expect(auditFieldLabel('allowance_satang')).toBe('เบี้ยเลี้ยง')
    expect(auditFieldLabel('allowanceSatang')).toBe('เบี้ยเลี้ยง')
    expect(auditFieldLabel('holiday_date')).toBe('วันหยุด')
    expect(auditFieldLabel('supervisor_can_assign_outsource')).toBe('หัวหน้างานมอบหมายงานให้ Outsource ได้')
    expect(auditFieldLabel('account_name')).toBe('ชื่อบัญชี')
    expect(auditFieldLabel('fileName')).toBe('ชื่อไฟล์')
    expect(auditFieldLabel('fuel_mode')).toBe('วิธีคิดค่าน้ำมัน')
  })

  it('ไม่มีป้ายเฉพาะ ⇒ แปลทีละคำ (คำท้าย at/by/date/satang ขึ้นหน้า)', () => {
    expect(auditComposedFieldLabel('clear_reviewed_at')).toBe('เวลาเคลียร์ ตรวจ')
    expect(auditComposedFieldLabel('verified_by')).toBe('ผู้ยืนยัน')
    expect(auditComposedFieldLabel('due_clear_date')).toBe('วันที่ครบกำหนด เคลียร์')
    expect(auditComposedFieldLabel('bill_outstanding_satang')).toBe('ยอดบิล ค้าง')
    expect(auditComposedFieldLabel('is_editable')).toBe('แก้ไขได้')
    expect(auditComposedFieldLabel('companyId')).toBe('บริษัท')
  })

  it('มีคำที่ไม่รู้จัก ⇒ ชื่อเดิม (ไม่พัง)', () => {
    expect(auditComposedFieldLabel('custom_xyz')).toBeNull()
    expect(auditFieldLabel('custom_xyz')).toBe('custom_xyz')
    expect(auditFieldLabel('')).toBe('')
  })
})

/** mytester6 T-026 — ค่า enum/boolean ฝั่งธุรกรรมบัญชีเป็นภาษาไทย */
describe('auditEnumValueLabel() / auditValueDisplay()', () => {
  it('ค่าจากรายงาน T-026 ⇒ ไทยตามหน้าจอของโมดูล', () => {
    expect(auditValueDisplay('billing', 'source_module', 'exceptions')).toBe('วางบิล')
    expect(auditValueDisplay('generated', 'status', 'export_records')).toBe('สร้างไฟล์แล้ว')
    expect(auditValueDisplay('sent', 'status', 'export_records')).toBe('ส่งสำนักงานบัญชีแล้ว')
    expect(auditValueDisplay('cancelled', 'certificate_status', 'wht_certificates')).toBe('ยกเลิก')
    expect(auditValueDisplay('active', 'certificate_status', 'wht_certificates')).toBe('ใช้งาน')
    expect(auditValueDisplay('internal', 'channel', 'wht_certificates')).toBe('ดาวน์โหลดในระบบ')
    expect(auditValueDisplay('wht_certificate_pdf', 'document', 'wht_certificates')).toBe('หนังสือรับรองหัก ณ ที่จ่าย (PDF)')
    expect(auditValueDisplay('manual', 'mapping_rule', 'expense_records')).toBe('ระบุเอง (Manual)')
    expect(auditValueDisplay(['period_ended'], 'failed_checks', 'accounting_periods')).toBe('งวดสิ้นเดือนแล้ว')
    expect(auditValueDisplay(false, 'ready', 'accounting_periods')).toBe('ไม่ใช่')
    expect(auditValueDisplay(true, 'hotel_receipt_required', 'compensation_plans')).toBe('ใช่')
    expect(auditValueDisplay('DAILY_FLAT', 'fuel_mode', 'compensation_plans')).toBe('เหมาจ่ายรายวัน')
    expect(auditValueDisplay('outsource', 'side', 'compensation_plans')).toBe('Outsource')
    expect(auditValueDisplay('sent_to_accountant', 'status', 'accounting_periods')).toBe('ส่งสำนักงานบัญชีแล้ว')
    expect(auditValueDisplay('debit', 'note_type', 'credit_notes')).toBe('ใบเพิ่มหนี้')
  })

  it('สถานะใช้ชุดของเป้าหมายก่อน แล้วค่อยชุดทั่วไป · ไม่รู้จัก ⇒ null (แสดงดิบ)', () => {
    expect(auditEnumValueLabel('cancelled', 'status', 'payout_batches')).toBe('ยกเลิกแล้ว')
    expect(auditEnumValueLabel('active', 'status', null)).toBe('ใช้งาน')
    expect(auditEnumValueLabel('zzz', 'status', 'payout_batches')).toBeNull()
    expect(auditEnumValueLabel('zzz', 'free_text_field', null)).toBeNull()
    expect(auditEnumValueLabel(42, 'status', null)).toBeNull()
  })

  it('รายการ enum แปลทีละตัว · ตัวที่ไม่รู้จักคงค่าเดิม · รายการ id ไม่แปล', () => {
    expect(auditEnumValueLabel(['period_ended', 'bank_reconcile', 'x_new'], 'failed_checks', null)).toBe(
      'งวดสิ้นเดือนแล้ว, กระทบยอดธนาคารครบ 100%, x_new',
    )
    expect(auditEnumValueLabel(['0a1b2c3d-0000-4000-8000-0000000000c1'], 'company_ids', null)).toBeNull()
    expect(auditEnumValueLabel([], 'failed_checks', null)).toBeNull()
  })
})

describe('คีย์จากข้อมูลที่ชนชื่อใน prototype (mytester6 รีวิว)', () => {
  it('ค่า enum/ฟิลด์ชื่อ constructor · toString · __proto__ ⇒ ไม่ได้ฟังก์ชันจาก prototype', () => {
    for (const value of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(auditEnumValueLabel(value, 'status', 'expenses')).toBeNull()
      expect(auditEnumValueLabel(value, 'status', null)).toBeNull()
      expect(auditEnumValueLabel(value, 'expense_type', null)).toBeNull()
      expect(auditEnumValueLabel('approved', 'status', value)).toBe(auditEnumValueLabel('approved', 'status', null))
      expect(auditComposedFieldLabel(value)).toBeNull()
      expect(auditFieldLabel(value)).toBe(value)
    }
    expect(auditComposedFieldLabel('amount_constructor')).toBeNull()
  })
})
