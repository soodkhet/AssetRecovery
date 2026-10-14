import { describe, expect, it } from 'vitest'
import { IMEI_FORMAT_MESSAGE } from '@/lib/warehouse/imei'
import {
  SERIAL_ACTUAL_REQUIRED_MESSAGE,
  collectIntakeFieldErrors,
  hasIntakeFieldErrors,
  type IntakeFormInput,
} from '@/lib/warehouse/intake-form'
import { COLOR_CAPACITY_CHOICE_REQUIRED_MESSAGE, COLOR_CAPACITY_NOTE_REQUIRED_MESSAGE } from '@/lib/warehouse/schemas'

/** ตรวจ a11y staging SV5-B2-01 — ฟอร์มรับเข้าคลังคืนข้อผิดรายช่องครบในรอบเดียว */
const IMEI = '356789012345678'
const VALID: IntakeFormInput = {
  contract: { imeiContract: IMEI, serialContract: null },
  imeiActual: IMEI,
  serialActual: '',
  colorCapacityMatched: true,
  colorCapacityNote: '',
  condition: 'normal',
  conditionNote: '',
}

describe('collectIntakeFieldErrors()', () => {
  it('กรอกครบ ⇒ ไม่มีข้อผิด', () => {
    const errors = collectIntakeFieldErrors(VALID)
    expect(errors).toEqual({})
    expect(hasIntakeFieldErrors(errors)).toBe(false)
  })

  it('ว่างทุกช่อง ⇒ ข้อผิดขึ้นพร้อมกันทุกช่อง/กลุ่มบังคับ', () => {
    const errors = collectIntakeFieldErrors({ ...VALID, imeiActual: '', colorCapacityMatched: null, condition: null })
    expect(Object.keys(errors).sort()).toEqual(['colorCapacity', 'condition', 'imei'])
    expect(errors.colorCapacity).toBe(COLOR_CAPACITY_CHOICE_REQUIRED_MESSAGE)
    expect(errors.imei).toContain('IMEI')
    expect(hasIntakeFieldErrors(errors)).toBe(true)
  })

  it('ไม่ตรงแต่ไม่ระบุสิ่งที่พบ · ชำรุดแต่ไม่มีรายละเอียด ⇒ ข้อผิดของช่องรายละเอียดทั้งสอง', () => {
    const errors = collectIntakeFieldErrors({ ...VALID, colorCapacityMatched: false, colorCapacityNote: '  ', condition: 'damaged', conditionNote: ' ' })
    expect(errors).toEqual({
      colorCapacityNote: COLOR_CAPACITY_NOTE_REQUIRED_MESSAGE,
      conditionNote: expect.any(String),
    })
  })

  it('สัญญามีแค่ Serial ⇒ ไม่กรอก Serial = ข้อผิดใต้ช่อง Serial (ข้อความของ Serial ไม่ใช่ IMEI)', () => {
    const errors = collectIntakeFieldErrors({ ...VALID, contract: { imeiContract: null, serialContract: 'SN-1' }, imeiActual: '' })
    expect(errors).toEqual({ serial: SERIAL_ACTUAL_REQUIRED_MESSAGE })
  })

  it('สัญญาไม่มีทั้งคู่ ⇒ กรอก Serial อย่างเดียวผ่าน · ว่างทั้งคู่ = ข้อผิดที่ช่อง IMEI', () => {
    const contract = { imeiContract: null, serialContract: null }
    expect(collectIntakeFieldErrors({ ...VALID, contract, imeiActual: '', serialActual: 'SN-9' })).toEqual({})
    expect(Object.keys(collectIntakeFieldErrors({ ...VALID, contract, imeiActual: '' }))).toEqual(['imei'])
  })

  it('IMEI รูปแบบผิด ⇒ ข้อความรูปแบบที่ช่อง IMEI + ยังตรวจช่องบังคับอื่นในรอบเดียว (Serial)', () => {
    const errors = collectIntakeFieldErrors({
      ...VALID,
      contract: { imeiContract: null, serialContract: 'SN-1' },
      imeiActual: '12345',
      colorCapacityMatched: null,
    })
    expect(errors).toEqual({
      imei: IMEI_FORMAT_MESSAGE,
      serial: SERIAL_ACTUAL_REQUIRED_MESSAGE,
      colorCapacity: COLOR_CAPACITY_CHOICE_REQUIRED_MESSAGE,
    })
  })

  it('IMEI ไม่ตรงสัญญา (รูปแบบถูก) ไม่ใช่ข้อผิดของช่อง — ไปต่อที่ขั้นยืนยันทับคำเตือน', () => {
    expect(collectIntakeFieldErrors({ ...VALID, imeiActual: '356-789 012.345 670' })).toEqual({})
  })
})
