import { describe, expect, it } from 'vitest'
import { API_CONTRACT } from '@/lib/api/contract'
import {
  assetIntakeSchema,
  COLOR_CAPACITY_CHOICE_REQUIRED_MESSAGE,
  COLOR_CAPACITY_NOTE_REQUIRED_MESSAGE,
  intakeColorCapacityMatched,
  intakeColorCapacityNote,
  assetListQuerySchema,
  assetRejectIntakeSchema,
  lotConfirmSchema,
  lotCreateSchema,
  lotCompanySummaryQuerySchema,
  lotListQuerySchema,
} from '@/lib/warehouse/schemas'

/** `44` §15 · `45` §6.4–6.5 — คีย์ query ต้องตรง contract เป๊ะ + ค่าที่ผิดรูปแบบต้องตกที่ schema */

const IMEI = '355000000000001'

describe('query ตรงกับ API_CONTRACT', () => {
  it('GET /api/assets ประกาศ filter ครบตาม contract', () => {
    expect(Object.keys(assetListQuerySchema.shape).sort()).toEqual([...API_CONTRACT['asset.list'].query].sort())
  })

  it('GET /api/handover-lots ประกาศ filter ครบตาม contract', () => {
    expect(Object.keys(lotListQuerySchema.shape).sort()).toEqual([...API_CONTRACT['lot.list'].query].sort())
  })

  it('มติ U142 — GET /api/handover-lots/company-summary ใช้ตัวกรองชุดเดียวกับ list (ไม่มี page/limit)', () => {
    expect(Object.keys(lotCompanySummaryQuerySchema.shape).sort()).toEqual(
      [...API_CONTRACT['lot.companySummary'].query].sort(),
    )
  })

  it('มติ U142 — ช่วงวันส่งมอบต้องเป็นวันที่จริง YYYY-MM-DD', () => {
    expect(lotListQuerySchema.parse({ handedOverFrom: '2026-10-01', handedOverTo: '2026-10-31' })).toMatchObject({
      handedOverFrom: '2026-10-01',
      handedOverTo: '2026-10-31',
    })
    expect(lotListQuerySchema.safeParse({ handedOverFrom: '2026-02-30' }).success).toBe(false)
    expect(lotListQuerySchema.safeParse({ handedOverTo: '10/2026' }).success).toBe(false)
  })
})

describe('assetListQuerySchema', () => {
  it('ค่า default ของ paging = หน้า 1 / 50 รายการ (§15)', () => {
    const parsed = assetListQuerySchema.parse({})
    expect(parsed).toMatchObject({ page: 1, limit: 50 })
  })

  it('status ส่งได้หลายค่าคั่นด้วย , (แท็บรับเข้าคลังรวม 2 สถานะ)', () => {
    expect(assetListQuerySchema.parse({ status: 'pending_intake,intake_rejected' }).status).toEqual([
      'pending_intake',
      'intake_rejected',
    ])
  })

  it('status ที่ไม่มีในระบบถูกปฏิเสธ', () => {
    expect(assetListQuerySchema.safeParse({ status: 'lost' }).success).toBe(false)
  })

  it('วันที่ต้องเป็น YYYY-MM-DD ที่มีอยู่จริง', () => {
    expect(assetListQuerySchema.parse({ dateFrom: '2026-07-10' }).dateFrom).toBe('2026-07-10')
    expect(assetListQuerySchema.safeParse({ dateFrom: '10/07/2569' }).success).toBe(false)
    expect(assetListQuerySchema.safeParse({ dateTo: '2026-02-31' }).success).toBe(false)
  })

  it('page/limit ที่ส่งมาเป็น string ถูกแปลงเป็นตัวเลข และมีเพดาน', () => {
    expect(assetListQuerySchema.parse({ page: '2', limit: '20' })).toMatchObject({ page: 2, limit: 20 })
    expect(assetListQuerySchema.safeParse({ limit: '1000' }).success).toBe(false)
    expect(assetListQuerySchema.safeParse({ page: '0' }).success).toBe(false)
  })
})

describe('assetIntakeSchema', () => {
  it('IMEI ต้องเป็นตัวเลข 15 หลัก (พิมพ์ไม่ครบ = พิมพ์ผิด ไม่ใช่ "ไม่ตรงสัญญา")', () => {
    expect(assetIntakeSchema.parse({ imeiActual: IMEI, condition: 'normal', colorCapacityMatched: true }).imeiActual).toBe(IMEI)
    expect(assetIntakeSchema.safeParse({ imeiActual: '35500000000', condition: 'normal', colorCapacityMatched: true }).success).toBe(false)
    expect(assetIntakeSchema.safeParse({ imeiActual: '35500000000000A', condition: 'normal', colorCapacityMatched: true }).success).toBe(false)
  })

  it('IMEI ที่ไม่ตรงกับสัญญายัง parse ผ่าน — การเตือนเป็นหน้าที่ของ service (`44` §12)', () => {
    expect(assetIntakeSchema.safeParse({ imeiActual: '355000000000999', condition: 'normal', colorCapacityMatched: true }).success).toBe(true)
  })

  it('ไม่เลือกสภาพก็ผ่าน schema — ให้ไปตกที่ INTAKE_MISSING_CONDITION แทน REQUIRED_MISSING', () => {
    const parsed = assetIntakeSchema.parse({ imeiActual: IMEI, colorCapacityMatched: true })
    expect(parsed.condition).toBeNull()
    expect(parsed.conditionNote).toBeNull()
  })

  it('photos ว่างได้ และไม่รับค่าเกินเพดาน', () => {
    expect(assetIntakeSchema.parse({ condition: 'normal', colorCapacityMatched: true }).photos).toEqual([])
    const many = Array.from({ length: 21 }, (_, index) => `https://storage/${index}.jpg`)
    expect(assetIntakeSchema.safeParse({ condition: 'normal', colorCapacityMatched: true, photos: many }).success).toBe(false)
  })

  it('ช่องข้อความว่างถูกเก็บเป็น null ไม่ใช่ "" (คอลัมน์ nullable)', () => {
    expect(assetIntakeSchema.parse({ condition: 'normal', colorCapacityMatched: true, serialActual: '   ' }).serialActual).toBeNull()
  })

  it('สี/ความจุตรงกับสัญญา (มติ O77) — ตัวเลือกบังคับ ตรง/ไม่ตรง · รับเฉพาะ boolean', () => {
    const missing = assetIntakeSchema.safeParse({ condition: 'normal' })
    expect(missing.success).toBe(false)
    expect(missing.error?.issues[0]?.message).toBe(COLOR_CAPACITY_CHOICE_REQUIRED_MESSAGE)
    expect(intakeColorCapacityMatched(assetIntakeSchema.parse({ condition: 'normal', colorCapacityMatched: true }))).toBe(true)
    expect(assetIntakeSchema.safeParse({ condition: 'normal', colorCapacityMatched: 'yes' }).success).toBe(false)
  })

  it('ไม่ตรง ⇒ ต้องระบุสิ่งที่พบ · ตรง ⇒ ไม่เก็บข้อความ', () => {
    const noNote = assetIntakeSchema.safeParse({ condition: 'normal', colorCapacityMatched: false, colorCapacityNote: '  ' })
    expect(noNote.success).toBe(false)
    expect(noNote.error?.issues[0]).toMatchObject({ path: ['colorCapacityNote'], message: COLOR_CAPACITY_NOTE_REQUIRED_MESSAGE })

    const mismatch = assetIntakeSchema.parse({ condition: 'normal', colorCapacityMatched: false, colorCapacityNote: ' สีขาว ' })
    expect(intakeColorCapacityMatched(mismatch)).toBe(false)
    expect(intakeColorCapacityNote(mismatch)).toBe('สีขาว')

    const matched = assetIntakeSchema.parse({ condition: 'normal', colorCapacityMatched: true, colorCapacityNote: 'ค้างจากก่อนหน้า' })
    expect(intakeColorCapacityNote(matched)).toBeNull()
  })
})

describe('assetRejectIntakeSchema', () => {
  it('เหตุผลว่างผ่าน schema — ให้ไปตกที่ REJECT_MISSING_REASON (T04)', () => {
    expect(assetRejectIntakeSchema.parse({}).rejectReason).toBe('')
  })
})

describe('lotCreateSchema', () => {
  const base = { companyId: '00000000-0000-4000-8000-000000000001', type: 'finance_pickup' as const }

  it('assetIds ว่างผ่าน schema — ให้ไปตกที่ EMPTY_LOT (T06)', () => {
    expect(lotCreateSchema.parse(base).assetIds).toEqual([])
  })

  it('เลือกเครื่องซ้ำถูกปฏิเสธ (ตัวนับแถวที่ผูกสำเร็จจะเพี้ยน)', () => {
    const id = '00000000-0000-4000-8000-000000000002'
    expect(lotCreateSchema.safeParse({ ...base, assetIds: [id, id] }).success).toBe(false)
  })

  it('รับ ISO 8601 ที่มีโซนเวลา แล้วช่องที่ไม่ส่งมาเป็น null', () => {
    const parsed = lotCreateSchema.parse({ ...base, scheduledAt: '2026-07-10T10:00:00+07:00' })
    expect(parsed.scheduledAt).toBe('2026-07-10T10:00:00+07:00')
    expect(parsed).toMatchObject({ contactPerson: null, deliveryAddr: null, trackingNo: null, note: null })
  })

  it('ปี พ.ศ. ที่หลุดมาจากหน้าจอถูกปฏิเสธ (ระบบเก็บ UTC ค.ศ. — Rule 01)', () => {
    expect(lotCreateSchema.safeParse({ ...base, scheduledAt: '2569-07-10T10:00:00+07:00' }).success).toBe(false)
  })

  it('ชนิดการส่งมอบต้องเป็น 1 ใน 2 แบบของ §6.3', () => {
    expect(lotCreateSchema.safeParse({ ...base, type: 'courier' }).success).toBe(false)
  })

  it('we_deliver ต้องมีที่อยู่จัดส่ง (`44` §7.2) — finance_pickup ไม่ต้อง', () => {
    const missing = lotCreateSchema.safeParse({ ...base, type: 'we_deliver' })
    expect(missing.success).toBe(false)
    expect(missing.error?.issues[0]?.path).toEqual(['deliveryAddr'])

    expect(lotCreateSchema.safeParse({ ...base, type: 'we_deliver', deliveryAddr: '99 ถนนทดสอบ' }).success).toBe(true)
    expect(lotCreateSchema.safeParse({ ...base, type: 'we_deliver', deliveryAddr: '   ' }).success).toBe(false)
    expect(lotCreateSchema.safeParse(base).success).toBe(true)
  })
})

describe('lotConfirmSchema', () => {
  it('ไม่ส่ง url มา = null (ใช้ไฟล์ที่แนบไว้ก่อนหน้า)', () => {
    expect(lotConfirmSchema.parse({})).toEqual({ deliveredAt: null, signedDocUrl: null, deliveryProofUrl: null })
  })

  it('รับ url เอกสารและวันส่งมอบจริงได้', () => {
    const parsed = lotConfirmSchema.parse({
      deliveredAt: '2026-07-10T11:30:00+07:00',
      signedDocUrl: 'https://storage/signed.pdf',
    })
    expect(parsed.signedDocUrl).toBe('https://storage/signed.pdf')
    expect(parsed.deliveryProofUrl).toBeNull()
  })

  it('วันเวลาที่ไม่ใช่ ISO ถูกปฏิเสธ', () => {
    expect(lotConfirmSchema.safeParse({ deliveredAt: '10/07/2569 11:30' }).success).toBe(false)
  })
})
