import { describe, expect, it } from 'vitest'
import {
  addMonthsToDateKey,
  companyDocumentCreateSchema,
  companyDocumentPath,
  companyDocumentPrefix,
  companyDocumentWarnings,
  currentCompanyDocuments,
  isCertificateOutdated,
  normalizeCompanyDocumentFields,
} from '@/lib/finance-companies/documents'
import { companyDocumentRule } from '@/lib/uploads/rules'
import { parseStoragePath } from '@/lib/uploads/targets'

/** มติ PO U132 — เอกสารบริษัทไฟแนนซ์ (เก็บทุกเวอร์ชัน + คำเตือนไม่บล็อก) */

const COMPANY = '00000000-0000-4000-8000-0000000000c1'
const KEY = '11111111-1111-4111-8111-111111111111'

describe('path ต่อเวอร์ชัน', () => {
  it('อยู่ใต้ prefix ของบริษัท+ชนิด และอ่านเจ้าของกลับได้', () => {
    const path = companyDocumentPath(COMPANY, 'company_certificate', 'หนังสือรับรอง.PDF', KEY)
    expect(path).toBe(`finance-companies/${COMPANY}/documents/certificate/${KEY}.pdf`)
    expect(path.startsWith(companyDocumentRule(COMPANY, 'company_certificate').prefix)).toBe(true)
    expect(parseStoragePath(path)).toEqual({ kind: 'finance_company', companyId: COMPANY })
    expect(companyDocumentPrefix(COMPANY, 'bank_book')).not.toBe(companyDocumentPrefix(COMPANY, 'other'))
  })
})

describe('addMonthsToDateKey / isCertificateOutdated', () => {
  it('clamp วันสิ้นเดือน', () => {
    expect(addMonthsToDateKey('2026-08-31', 6)).toBe('2027-02-28')
    expect(addMonthsToDateKey('2026-01-15', 6)).toBe('2026-07-15')
  })
  it('ครบ 6 เดือนพอดียังไม่เกิน · เลยไป 1 วัน = เกิน', () => {
    expect(isCertificateOutdated('2026-04-07', '2026-10-07')).toBe(false)
    expect(isCertificateOutdated('2026-04-07', '2026-10-08')).toBe(true)
  })
})

describe('currentCompanyDocuments', () => {
  it('เวอร์ชันปัจจุบัน = แถวที่ไม่มีใครแทนที่', () => {
    const rows = [
      { id: 'v1', documentType: 'company_certificate' as const, replacesDocumentId: null, issuedDate: '2026-01-01' },
      { id: 'v2', documentType: 'company_certificate' as const, replacesDocumentId: 'v1', issuedDate: '2026-09-01' },
      { id: 'o1', documentType: 'other' as const, replacesDocumentId: null, issuedDate: null },
    ]
    expect(currentCompanyDocuments(rows).map((row) => row.id)).toEqual(['v2', 'o1'])
  })
})

describe('companyDocumentWarnings', () => {
  const today = '2026-10-07'
  it('ไม่มีอะไรเลย + จด VAT = เตือน 2 ข้อ', () => {
    const kinds = companyDocumentWarnings({ currentDocs: [], vatRegistered: true, todayKey: today }).map((w) => w.kind)
    expect(kinds).toEqual(['missing_certificate', 'missing_vat_registration'])
  })
  it('ไม่จด VAT ไม่เตือน ภ.พ.20', () => {
    const kinds = companyDocumentWarnings({ currentDocs: [], vatRegistered: false, todayKey: today }).map((w) => w.kind)
    expect(kinds).toEqual(['missing_certificate'])
  })
  it('หนังสือรับรองเกิน 6 เดือน = เตือน · ใหม่ + มี ภ.พ.20 = ไม่เตือน', () => {
    const old = companyDocumentWarnings({
      currentDocs: [
        { documentType: 'company_certificate', issuedDate: '2026-01-01' },
        { documentType: 'vat_registration', issuedDate: null },
      ],
      vatRegistered: true,
      todayKey: today,
    })
    expect(old.map((w) => w.kind)).toEqual(['certificate_outdated'])
    const fresh = companyDocumentWarnings({
      currentDocs: [
        { documentType: 'company_certificate', issuedDate: '2026-09-01' },
        { documentType: 'vat_registration', issuedDate: null },
      ],
      vatRegistered: true,
      todayKey: today,
    })
    expect(fresh).toEqual([])
  })
  it('ข้อความเตือนไม่มีเลขอ้างอิงสเปค', () => {
    for (const warning of companyDocumentWarnings({ currentDocs: [], vatRegistered: true, todayKey: today })) {
      expect(warning.message).not.toMatch(/§|`\d{2}`|ไฟล์ \d/)
    }
  })
})

describe('companyDocumentCreateSchema', () => {
  const base = { path: 'p', originalName: 'a.pdf', reason: 'แนบหนังสือรับรองฉบับใหม่' }
  it('หนังสือรับรองต้องมีวันที่ออก · อื่น ๆ ต้องมีชื่อ', () => {
    expect(companyDocumentCreateSchema.safeParse({ ...base, documentType: 'company_certificate' }).success).toBe(false)
    expect(companyDocumentCreateSchema.safeParse({ ...base, documentType: 'other' }).success).toBe(false)
    expect(
      companyDocumentCreateSchema.safeParse({ ...base, documentType: 'company_certificate', issuedDate: '2026-09-01' }).success,
    ).toBe(true)
    expect(companyDocumentCreateSchema.safeParse({ ...base, documentType: 'other', title: 'หนังสือมอบอำนาจ' }).success).toBe(true)
  })
  it('normalize เก็บชื่อเฉพาะ "อื่น ๆ" และวันที่ออกเฉพาะหนังสือรับรอง (ตรง CHECK)', () => {
    const date = new Date(Date.UTC(2026, 8, 1))
    expect(normalizeCompanyDocumentFields({ documentType: 'bank_book', title: 'x', issuedDate: date })).toEqual({
      title: null,
      issuedDate: null,
    })
    expect(normalizeCompanyDocumentFields({ documentType: 'company_certificate', title: 'x', issuedDate: date })).toEqual({
      title: null,
      issuedDate: date,
    })
  })
})
