import { describe, expect, it } from 'vitest'
import { evaluateReadiness } from '@/lib/accounting/period'
import {
  buildLetterhead,
  letterheadContactLine,
  organizationAddressLine,
  organizationLogoPath,
  organizationProfileIssues,
  organizationProfileWarning,
  organizationLetterheadSnapshotJson,
  organizationLetterheadSnapshotOf,
  parseOrganizationLetterheadSnapshot,
  parseSellerProfileSnapshot,
  sellerProfileOf,
  sellerProfileSnapshotJson,
} from '@/lib/organization/profile'
import { organizationLogoSetSchema, organizationProfileUpdateSchema } from '@/lib/organization/schemas'

/** มติ PO U99 — หน้าข้อมูลองค์กร + หัวเอกสารกลาง (ส่วน pure) */

const VALID = {
  name: 'บริษัท ใจดี โมบาย จำกัด',
  nameEn: '',
  taxId: '0-1055-60123-45-6',
  branchCode: '00000',
  addressDetail: '123/45 ถ.พระราม 1',
  addressSubdistrict: 'ปทุมวัน',
  addressDistrict: 'ปทุมวัน',
  addressProvince: 'กรุงเทพมหานคร',
  addressPostalCode: '10330',
  phone: '02-000-1234',
  email: '',
  website: '',
  vatRegistered: true,
  reason: 'กรอกข้อมูลจริงก่อน go-live',
}

describe('organizationProfileIssues — ค่าตัวอย่างของ seed (เตือน ไม่บล็อก)', () => {
  it('seed เดิม: เลขผู้เสียภาษี 0000000000000 + ที่อยู่ "(รอกรอกที่อยู่จริงก่อน go-live)" ⇒ 2 รายการ', () => {
    const issues = organizationProfileIssues({
      name: 'AssetRecovery Co., Ltd.',
      taxId: '0000000000000',
      address: '(รอกรอกที่อยู่จริงก่อน go-live)',
    })
    expect(issues).toHaveLength(2)
    expect(organizationProfileWarning(issues)).toContain('ข้อมูลองค์กรยังไม่ครบ')
  })

  it('ข้อมูลจริงครบ ⇒ ไม่มีคำเตือน', () => {
    const issues = organizationProfileIssues({ name: 'บริษัท ก', taxId: '0105560123456', address: '1 ถนนสีลม' })
    expect(issues).toEqual([])
    expect(organizationProfileWarning(issues)).toBeNull()
  })

  it('ความพร้อมปิดงวด: ข้อมูลองค์กรไม่ครบ = คำเตือน ไม่บล็อก', () => {
    const result = evaluateReadiness({
      criticalOpen: [],
      warningOpenCount: 0,
      unmatchedBankCount: 0,
      billingMismatches: [],
      organizationProfileIssues: ['เลขประจำตัวผู้เสียภาษียังเป็นค่าตัวอย่าง — กรอกเลขจริง 13 หลัก'],
    })
    expect(result.ready).toBe(true)
    expect(result.warnings.some((warning) => warning.startsWith('ข้อมูลองค์กรยังไม่ครบ'))).toBe(true)
    // ข้อความที่ผู้ใช้เห็นห้ามมีเลขอ้างอิงสเปค (Rule 05)
    expect(result.warnings.join(' ')).not.toMatch(/§|มติ PO/)
  })
})

describe('organizationProfileUpdateSchema — Zod ชุดเดียว FE/BE', () => {
  it('ผ่าน: normalize เลขผู้เสียภาษี · ช่องไม่บังคับว่าง = null', () => {
    const parsed = organizationProfileUpdateSchema.parse(VALID)
    expect(parsed.taxId).toBe('0105560123456')
    expect(parsed.nameEn).toBeNull()
    expect(parsed.email).toBeNull()
    expect(parsed.website).toBeNull()
  })

  it.each([
    [{ taxId: '0000000000000' }, 'taxId'],
    [{ taxId: '12345' }, 'taxId'],
    [{ branchCode: '1' }, 'branchCode'],
    [{ addressPostalCode: '1033' }, 'addressPostalCode'],
    [{ addressProvince: '' }, 'addressProvince'],
    [{ phone: '' }, 'phone'],
    [{ email: 'not-email' }, 'email'],
    [{ website: 'ไม่ใช่ เว็บ' }, 'website'],
    [{ name: '' }, 'name'],
    [{ reason: '' }, 'reason'],
  ])('%j ⇒ ผิดที่ %s', (patch, field) => {
    const result = organizationProfileUpdateSchema.safeParse({ ...VALID, ...patch })
    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.path[0] === field)).toBe(true)
  })

  it('เว็บไซต์รับทั้งมี/ไม่มี https://', () => {
    expect(organizationProfileUpdateSchema.safeParse({ ...VALID, website: 'www.jaidee.co.th' }).success).toBe(true)
    expect(organizationProfileUpdateSchema.safeParse({ ...VALID, website: 'https://jaidee.co.th/th' }).success).toBe(true)
  })

  it('ผูกโลโก้ต้องมี path + เหตุผล', () => {
    expect(organizationLogoSetSchema.safeParse({ path: 'organization/x/logo/a.png', reason: 'โลโก้ใหม่ของบริษัท' }).success).toBe(true)
    expect(organizationLogoSetSchema.safeParse({ path: 'organization/x/logo/a.png' }).success).toBe(false)
    expect(organizationLogoSetSchema.safeParse({ path: '', reason: 'โลโก้ใหม่ของบริษัท' }).success).toBe(false)
  })
})

describe('ที่อยู่แยกช่อง → บรรทัดเดียว (reuse formatThaiAddressLine)', () => {
  it('กรุงเทพฯ ใช้แขวง/เขต', () => {
    expect(organizationAddressLine(VALID)).toBe('123/45 ถ.พระราม 1 แขวงปทุมวัน เขตปทุมวัน กรุงเทพมหานคร 10330')
  })
})

describe('snapshot หัวเอกสาร (ใบกำกับ/ใบแจ้งหนี้)', () => {
  const SHA = 'a'.repeat(64)
  const org = { nameEn: 'Jaidee Mobile', email: 'a@b.co', website: null, logoUrl: 'organization/x/logo/1.png', logoSha256: SHA }

  it('ค่าปัจจุบัน → JSON → อ่านกลับได้ค่าเดิม (รวม hash โลโก้ — มติ PO U110)', () => {
    const json = sellerProfileSnapshotJson(sellerProfileOf(org))
    expect(json).toEqual({
      name_en: 'Jaidee Mobile',
      email: 'a@b.co',
      website: null,
      logo_path: 'organization/x/logo/1.png',
      logo_sha256: SHA,
    })
    expect(parseSellerProfileSnapshot(json)).toEqual({
      nameEn: 'Jaidee Mobile',
      email: 'a@b.co',
      website: null,
      logoPath: 'organization/x/logo/1.png',
      logoSha256: SHA,
    })
  })

  it('ไม่มีโลโก้ ⇒ ไม่เก็บ hash ค้าง · snapshot ก่อน U110 (ไม่มี logo_sha256) ⇒ hash = null', () => {
    expect(sellerProfileOf({ ...org, logoUrl: null }).logoSha256).toBeNull()
    expect(parseSellerProfileSnapshot({ name_en: 'X', logo_path: 'p' })?.logoSha256).toBeNull()
    expect(parseSellerProfileSnapshot({ logo_sha256: 'not-a-hash' })?.logoSha256).toBeNull()
  })

  it('เอกสารก่อน U99 (NULL) = ไม่มี snapshot · ค่ารูปผิด = ค่าว่าง', () => {
    expect(parseSellerProfileSnapshot(null)).toBeNull()
    expect(parseSellerProfileSnapshot([1, 2])).toBeNull()
    expect(parseSellerProfileSnapshot({ name_en: 5, email: '' })).toEqual({
      nameEn: null,
      email: null,
      website: null,
      logoPath: null,
      logoSha256: null,
    })
  })
})

describe('snapshot หัวกระดาษทั้งชุด (ใบส่งมอบ — มติ PO U111)', () => {
  const row = {
    name: 'บริษัท ใจดี โมบาย จำกัด',
    nameEn: 'Jaidee Mobile',
    taxId: '0105560123456',
    address: '1 ถนนสีลม',
    phone: '02-000-0000',
    email: 'a@b.co',
    website: 'www.jaidee.co.th',
    branchCode: '00001',
    logoUrl: 'organization/x/logo/1.png',
    logoSha256: 'b'.repeat(64),
  }

  it('ค่าปัจจุบัน → JSON → อ่านกลับได้ครบทุกช่อง', () => {
    const json = organizationLetterheadSnapshotJson(organizationLetterheadSnapshotOf(row))
    expect(json).toMatchObject({ name: row.name, tax_id: row.taxId, branch_code: '00001', logo_sha256: row.logoSha256 })
    expect(parseOrganizationLetterheadSnapshot(json)).toEqual({
      name: row.name,
      taxId: row.taxId,
      address: row.address,
      phone: row.phone,
      branchCode: '00001',
      nameEn: row.nameEn,
      email: row.email,
      website: row.website,
      logoPath: row.logoUrl,
      logoSha256: row.logoSha256,
    })
  })

  it('NULL/ไม่มีชื่อหรือเลขผู้เสียภาษี ⇒ ไม่มี snapshot (ใช้ค่าปัจจุบัน)', () => {
    expect(parseOrganizationLetterheadSnapshot(null)).toBeNull()
    expect(parseOrganizationLetterheadSnapshot({ name: 'ก' })).toBeNull()
  })
})

describe('buildLetterhead / บรรทัดติดต่อ', () => {
  it('ตัดช่องว่าง · ช่องว่าง = null · สาขาเป็นข้อความ', () => {
    const letterhead = buildLetterhead(
      { name: ' บริษัท ก ', taxId: '0105560123456', address: '1 ถนนสีลม', phone: ' ', branchCode: '00003' },
      { nameEn: '  ', email: 'a@b.co', website: 'www.b.co' },
      null,
    )
    expect(letterhead).toMatchObject({ nameTh: 'บริษัท ก', nameEn: null, phone: null, branchLabel: 'สาขาที่ 00003', logo: null })
    expect(letterheadContactLine(letterhead)).toBe('อีเมล a@b.co · เว็บไซต์ www.b.co')
    expect(letterheadContactLine({ phone: null, email: null, website: null })).toBeNull()
  })

  it('path โลโก้ต่อเวอร์ชัน (ไม่ทับไฟล์เดิม) · นามสกุลตามไฟล์', () => {
    expect(organizationLogoPath('org-1', 'Logo.PNG', 'k1')).toBe('organization/org-1/logo/k1.png')
  })
})
