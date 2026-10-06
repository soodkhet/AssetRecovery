import { describe, expect, it } from 'vitest'
import { buildAuditRecord } from '@/lib/audit/audit'
import { buildPersonalFileViewAudit, personalDataFileOf } from '@/lib/uploads/personal-data'

const CASE_ID = '00000000-0000-4000-8000-000000000011'
const WHT_ID = '00000000-0000-4000-8000-000000000301'
const actor = { id: '00000000-0000-4000-8000-0000000000b1', organizationId: 'org-1', roleName: 'ธุรการ' }

describe('ไฟล์ข้อมูลส่วนบุคคล (มติ PO U90)', () => {
  it.each(['contract_doc', 'national_id_doc', 'bundle_doc', 'other_doc'])('เอกสารเคส %s = บันทึก', (slot) => {
    expect(personalDataFileOf(`cases/${CASE_ID}/${slot}/k-a.pdf`)).toEqual({
      kind: 'case_document',
      targetType: 'cases',
      targetId: CASE_ID,
      slot,
      fileName: 'k-a.pdf',
    })
  })

  it('50 ทวิ ลูกค้า = บันทึก', () => {
    expect(personalDataFileOf(`customer-wht/${WHT_ID}/k.pdf`)).toMatchObject({
      kind: 'customer_wht',
      targetType: 'customer_wht_certificates',
      targetId: WHT_ID,
    })
  })

  it('ฉบับเซ็นใบรับรองแทนใบเสร็จ = บันทึก (U141)', () => {
    expect(personalDataFileOf(`substitute-receipts/${WHT_ID}/signed/k.pdf`)).toEqual({
      kind: 'substitute_receipt_signed',
      targetType: 'substitute_receipts',
      targetId: WHT_ID,
      fileName: 'k.pdf',
    })
    const entry = buildPersonalFileViewAudit({
      actor,
      path: `substitute-receipts/${WHT_ID}/signed/k.pdf`,
      ipAddress: null,
      userAgent: null,
    })
    expect(entry).toMatchObject({ action: 'view', targetType: 'substitute_receipts', targetId: WHT_ID })
  })

  it.each([
    `cases/${CASE_ID}/product_photo/k.jpg`,
    `cases/${CASE_ID}/field_evidence/photo/k.jpg`,
    `cases/${CASE_ID}/field_evidence/national_id_doc/k.jpg`,
    `expenses/${CASE_ID}/receipts/k.pdf`,
    `assets/${CASE_ID}/intake/front/k.jpg`,
    `handover-lots/${CASE_ID}/signed_doc/k.pdf`,
    `cases/${CASE_ID}/../national_id_doc/k.pdf`,
    'national_id_doc/k.pdf',
  ])('ไม่บันทึก: %s', (path) => {
    expect(personalDataFileOf(path)).toBeNull()
  })

  it('entry ผ่านกติกา audit กลาง (action view + เหตุผลมาตรฐาน) และไม่มี URL', () => {
    const entry = buildPersonalFileViewAudit({
      actor,
      path: `customer-wht/${WHT_ID}/k.pdf`,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    })
    expect(entry).not.toBeNull()
    if (entry === null) throw new Error('ต้องได้ entry')
    const record = buildAuditRecord(entry)
    expect(record).toMatchObject({
      action: 'view',
      targetType: 'customer_wht_certificates',
      targetId: WHT_ID,
      reason: 'เปิดดูเอกสารข้อมูลส่วนบุคคล',
    })
    expect(record.afterData).toEqual({ kind: 'customer_wht', path: `customer-wht/${WHT_ID}/k.pdf`, fileName: 'k.pdf' })
  })

  it('ไฟล์ทั่วไป → ไม่มี entry', () => {
    expect(
      buildPersonalFileViewAudit({ actor, path: `cases/${CASE_ID}/product_photo/k.jpg`, ipAddress: null, userAgent: null }),
    ).toBeNull()
  })
})
