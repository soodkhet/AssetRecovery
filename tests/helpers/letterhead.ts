import { NO_DOC_TEMPLATE } from '@/lib/settings/tax-doc-template'
import type { DocLetterhead } from '@/lib/organization/profile'

/**
 * หัวเอกสารกลางสำหรับเทสต์ PDF (มติ PO U99) — ไม่แตะ DB/Storage
 * `TINY_PNG` = รูป PNG 1×1 ของจริง (react-pdf ต้องถอดรหัสได้) ใช้ทดสอบทั้ง "มีโลโก้" และอัปโหลดโลโก้
 */
export const TINY_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
)

export function testLetterhead(overrides: Partial<DocLetterhead> = {}): DocLetterhead {
  return {
    nameTh: 'บริษัท ใจดี โมบาย จำกัด',
    nameEn: 'Jaidee Mobile Co., Ltd.',
    address: '123/45 ถ.พระราม 1 แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร 10330',
    phone: '02-000-1234',
    email: 'accounting@jaidee.co.th',
    website: 'www.jaidee.co.th',
    taxId: '0105560123456',
    branchLabel: 'สำนักงานใหญ่',
    logo: null,
    ...overrides,
  }
}

export function testLetterheadWithLogo(overrides: Partial<DocLetterhead> = {}): DocLetterhead {
  return testLetterhead({ logo: { data: Buffer.from(TINY_PNG), format: 'png' }, ...overrides })
}

/**
 * ตัวแทน `@/lib/organization/letterhead` สำหรับเทสต์ระดับ route ที่ไม่มี DB — คืนหัวเอกสารตัวอย่างเสมอ
 * ```ts
 * vi.mock('@/lib/organization/letterhead', async () => (await import('@/tests/helpers/letterhead')).fakeLetterheadModule())
 * ```
 */
export function fakeLetterheadModule(): typeof import('@/lib/organization/letterhead') {
  const resolver = {
    current: async () => testLetterhead(),
    forSnapshot: async () => testLetterhead(),
    forOrganizationSnapshot: async () => testLetterhead(),
    template: async () => NO_DOC_TEMPLATE,
    currentTemplate: async () => NO_DOC_TEMPLATE,
  }
  return {
    loadLetterheadLogo: async () => null,
    createLetterheadResolver: () => resolver,
    currentLetterhead: async () => testLetterhead(),
    taxInvoiceLetterhead: async () => testLetterhead(),
    billingInvoiceLetterhead: async () => testLetterhead(),
    handoverLetterhead: async () => testLetterhead(),
    taxInvoiceTemplate: async () => NO_DOC_TEMPLATE,
    billingInvoiceTemplate: async () => NO_DOC_TEMPLATE,
    handoverTemplate: async () => NO_DOC_TEMPLATE,
  }
}
