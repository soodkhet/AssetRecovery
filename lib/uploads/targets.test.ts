import { describe, expect, it } from 'vitest'
import { DOCUMENT_SLOTS } from '@/lib/cases/case'
import { FIELD_MEDIA_KINDS } from '@/lib/field/media-upload'
import {
  caseDocumentRule,
  advanceReturnFileRule,
  creditNoteFileRule,
  expenseReceiptRule,
  fieldEvidenceRule,
  intakePhotoRule,
  lotDocumentRule,
  organizationLogoRule,
} from '@/lib/uploads/rules'
import { parseStoragePath, uploadTargetPath, uploadTargetSchema, type UploadTarget } from '@/lib/uploads/targets'
import { INTAKE_PHOTO_ANGLES } from '@/lib/warehouse/intake'
import { LOT_DOCUMENTS } from '@/lib/warehouse/lot-status'

/** BUG-143 — path ที่ server ประกอบต้องอยู่ใต้ prefix ที่ตัวตรวจตอนผูกไฟล์ยอมรับ + อ่านเจ้าของกลับได้ถูกตัว */

const CASE_ID = '00000000-0000-4000-8000-000000000011'
const ASSET_ID = '00000000-0000-4000-8000-000000000101'
const LOT_ID = '00000000-0000-4000-8000-000000000201'
const USER_ID = '00000000-0000-4000-8000-0000000000a1'
const INVOICE_ID = '00000000-0000-4000-8000-000000000301'
const ADVANCE_ID = '00000000-0000-4000-8000-000000000401'
const KEY = '11111111-1111-4111-8111-111111111111'
const ORG_ID = '00000000-0000-4000-8000-000000000501'

describe('uploadTargetPath ↔ rules prefix ↔ parseStoragePath', () => {
  const cases: Array<{ target: UploadTarget; prefix: string; owner: ReturnType<typeof parseStoragePath> }> = [
    ...DOCUMENT_SLOTS.map((slot) => ({
      target: { kind: 'case_document', caseId: CASE_ID, slot } as const,
      prefix: caseDocumentRule(CASE_ID, slot).prefix,
      owner: { kind: 'case', caseId: CASE_ID } as const,
    })),
    ...FIELD_MEDIA_KINDS.map((mediaKind) => ({
      target: { kind: 'field_evidence', caseId: CASE_ID, mediaKind } as const,
      prefix: fieldEvidenceRule(CASE_ID, mediaKind).prefix,
      owner: { kind: 'case', caseId: CASE_ID } as const,
    })),
    {
      target: { kind: 'expense_receipt' },
      prefix: expenseReceiptRule(USER_ID).prefix,
      owner: { kind: 'expense_receipt', userId: USER_ID },
    },
    ...INTAKE_PHOTO_ANGLES.map((angle) => ({
      target: { kind: 'intake_photo', assetId: ASSET_ID, angle } as const,
      prefix: intakePhotoRule(ASSET_ID).prefix,
      owner: { kind: 'asset', assetId: ASSET_ID } as const,
    })),
    ...LOT_DOCUMENTS.map((document) => ({
      target: { kind: 'lot_document', lotId: LOT_ID, document } as const,
      prefix: lotDocumentRule(LOT_ID, document).prefix,
      owner: { kind: 'lot', lotId: LOT_ID } as const,
    })),
    {
      target: { kind: 'credit_note', taxInvoiceId: INVOICE_ID },
      prefix: creditNoteFileRule(INVOICE_ID).prefix,
      owner: { kind: 'tax_invoice', taxInvoiceId: INVOICE_ID },
    },
    {
      target: { kind: 'advance_return', advanceId: ADVANCE_ID },
      prefix: advanceReturnFileRule(ADVANCE_ID).prefix,
      owner: { kind: 'advance', advanceId: ADVANCE_ID },
    },
    // มติ PO U99 — โลโก้บนหัวเอกสาร
    {
      target: { kind: 'organization_logo', organizationId: ORG_ID },
      prefix: organizationLogoRule(ORG_ID).prefix,
      owner: { kind: 'organization_logo', organizationId: ORG_ID },
    },
  ]

  it.each(cases)('$target.kind → path ใต้ $prefix', ({ target, prefix, owner }) => {
    expect(uploadTargetSchema.safeParse(target).success).toBe(true)
    const path = uploadTargetPath(target, USER_ID, '../../ชื่อ ไฟล์.pdf', KEY)
    expect(path.startsWith(prefix)).toBe(true)
    expect(path.includes('..')).toBe(false)
    expect(parseStoragePath(path)).toEqual(owner)
  })
})

describe('parseStoragePath', () => {
  it.each([
    '',
    '/cases/' + CASE_ID + '/a',
    `cases/${CASE_ID}/../x`,
    `cases/${CASE_ID}/./x`,
    `cases/${CASE_ID}//x`,
    `cases\\${CASE_ID}\\x`,
    `cases/${CASE_ID}/a\u0000b`,
    `cases/${CASE_ID}/`,
    `CASES/${CASE_ID}/a`,
    `cases/123/a`,
    `assets/${ASSET_ID}/other/a.jpg`,
    `expenses/${USER_ID}/other/a.pdf`,
    `payment-files/a.csv`,
    `tax-invoices/${INVOICE_ID}/other/a.pdf`,
    'x'.repeat(2000),
  ])('ปฏิเสธ %j', (path) => {
    expect(parseStoragePath(path)).toBeNull()
  })

  it('UUID ตัวพิมพ์ใหญ่ถูกปรับเป็นตัวเล็ก (ตรงกับ id ใน DB)', () => {
    expect(parseStoragePath(`cases/${CASE_ID.toUpperCase()}/contract_doc/a.pdf`)).toEqual({ kind: 'case', caseId: CASE_ID })
  })
})

describe('BUG-173 — id จาก seed (ไม่ใช่ UUID ตาม version RFC) ต้องผ่าน', () => {
  const SEED_ORG_ID = '00000000-0000-0000-0000-000000000001'

  it('organization_logo รับ id องค์กรจาก seed', () => {
    const parsed = uploadTargetSchema.safeParse({ kind: 'organization_logo', organizationId: SEED_ORG_ID })
    expect(parsed.success).toBe(true)
  })

  it('ยังปฏิเสธค่าที่ไม่ใช่รูปแบบ UUID', () => {
    expect(uploadTargetSchema.safeParse({ kind: 'organization_logo', organizationId: 'not-a-uuid' }).success).toBe(false)
    expect(
      uploadTargetSchema.safeParse({ kind: 'organization_logo', organizationId: '00000000-0000-0000-0000-00000000001' })
        .success,
    ).toBe(false)
  })
})
