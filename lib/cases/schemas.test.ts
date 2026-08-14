import { describe, expect, it } from 'vitest'
import { API_CONTRACT } from '@/lib/api/contract'
import { CAPABILITY_CODES } from '@/lib/roles/capability-catalog'
import { CASE_EDIT_CAPABILITIES, CASE_READ_CAPABILITIES, CASE_WRITE_CAPABILITY } from '@/lib/cases/permissions'
import {
  caseCreateSchema,
  caseDocumentUploadSchema,
  caseListQuerySchema,
  caseUpdateSchema,
} from '@/lib/cases/schemas'

const MINIMAL = { caseRef: 'SF-2026-0001', financeCompanyId: '11111111-1111-4111-8111-111111111111' }

describe('caseCreateSchema (`38` §6 · §11)', () => {
  it('payload จาก API ที่มีแค่เลขสัญญา + บริษัท ผ่านได้ (สร้าง draft เสมอ)', () => {
    const parsed = caseCreateSchema.safeParse({ ...MINIMAL, sourceChannel: 'api' })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.sourceChannel).toBe('api')
  })

  it('ไม่มีเลขที่สัญญา = ปฏิเสธ (สิ่งเดียวที่บังคับตั้งแต่ตอนสร้าง)', () => {
    expect(caseCreateSchema.safeParse({ financeCompanyId: MINIMAL.financeCompanyId }).success).toBe(false)
    expect(caseCreateSchema.safeParse({ ...MINIMAL, caseRef: '   ' }).success).toBe(false)
  })

  it('ช่องข้อความว่างจากฟอร์มถูกแปลงเป็น null ไม่ใช่ค่าว่าง', () => {
    const parsed = caseCreateSchema.parse({ ...MINIMAL, debtorName: '', debtorLineId: '  ' })
    expect(parsed.debtorName).toBeNull()
    expect(parsed.debtorLineId).toBeNull()
  })

  it('sourceChannel ดีฟอลต์เป็น manual', () => {
    expect(caseCreateSchema.parse(MINIMAL).sourceChannel).toBe('manual')
  })

  it('มูลหนี้เป็นสตางค์จำนวนเต็มเท่านั้น (Rule 01 — ห้ามส่งบาททศนิยม)', () => {
    expect(caseCreateSchema.safeParse({ ...MINIMAL, outstandingDebtSatang: 1_000_050 }).success).toBe(true)
    expect(caseCreateSchema.safeParse({ ...MINIMAL, outstandingDebtSatang: 10_000.5 }).success).toBe(false)
    expect(caseCreateSchema.safeParse({ ...MINIMAL, outstandingDebtSatang: -1 }).success).toBe(false)
  })

  it('รหัสไปรษณีย์ต้อง 5 หลัก · ผู้ติดต่อกรอกครบ 3 ช่อง', () => {
    expect(
      caseCreateSchema.safeParse({ ...MINIMAL, addressCurrent: { postalCode: '1010' } }).success,
    ).toBe(false)
    expect(
      caseCreateSchema.safeParse({
        ...MINIMAL,
        contacts: [{ contactName: 'สมหญิง', relationship: 'คู่สมรส', contactPhone: '0812345678' }],
      }).success,
    ).toBe(true)
    expect(
      caseCreateSchema.safeParse({ ...MINIMAL, contacts: [{ contactName: 'สมหญิง', relationship: 'คู่สมรส' }] })
        .success,
    ).toBe(false)
  })
})

describe('caseUpdateSchema (`38` §8)', () => {
  it('ทุกช่องเป็น optional (แก้ทีละช่องได้) และรับ editNote', () => {
    const parsed = caseUpdateSchema.safeParse({ debtorName: 'สมชาย', editNote: 'ไฟแนนซ์ส่งชื่อมาเพิ่ม' })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.editNote).toBe('ไฟแนนซ์ส่งชื่อมาเพิ่ม')
  })

  it('ไม่รับ sourceChannel (ช่องทางที่มาของเคสเปลี่ยนย้อนหลังไม่ได้)', () => {
    expect('sourceChannel' in caseUpdateSchema.parse({ debtorName: 'ก' })).toBe(false)
  })
})

describe('caseDocumentUploadSchema (`38` §6.3 · ไฟล์ 01)', () => {
  const base = {
    documentType: 'contract_doc',
    fileUrl: 'https://storage.local/cases/1/contract.pdf',
    fileHash: 'a'.repeat(64),
    originalName: 'contract.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
  }

  it('รับ slot ตามสเปคเท่านั้น', () => {
    expect(caseDocumentUploadSchema.safeParse(base).success).toBe(true)
    expect(caseDocumentUploadSchema.safeParse({ ...base, documentType: 'random_doc' }).success).toBe(false)
  })

  it('file_hash ต้องเป็น SHA-256 (hex 64 ตัว)', () => {
    expect(caseDocumentUploadSchema.safeParse({ ...base, fileHash: 'abc123' }).success).toBe(false)
  })

  it('ขนาดไฟล์ต้องมากกว่า 0', () => {
    expect(caseDocumentUploadSchema.safeParse({ ...base, sizeBytes: 0 }).success).toBe(false)
  })
})

describe('caseListQuerySchema', () => {
  it('คีย์ query ตรงกับที่ contract (`45` §6.1) ประกาศไว้', () => {
    const allowed = new Set<string>(API_CONTRACT['case.list'].query ?? [])
    for (const key of Object.keys(caseListQuerySchema.shape)) expect(allowed.has(key), key).toBe(true)
  })

  it('page/limit มีค่าเริ่มต้นและรับค่าจาก query string (string) ได้', () => {
    expect(caseListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20 })
    expect(caseListQuerySchema.parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 })
    expect(caseListQuerySchema.safeParse({ limit: '500' }).success).toBe(false)
  })
})

describe('capability ที่ endpoint ใช้ต้องมีอยู่จริงใน `02` §12', () => {
  it.each([...CASE_READ_CAPABILITIES, ...CASE_EDIT_CAPABILITIES, CASE_WRITE_CAPABILITY])(
    '`%s` อยู่ในทะเบียน capability',
    (code) => {
      expect(CAPABILITY_CODES).toContain(code)
    },
  )
})
