import { formatThaiAddressLine, type AddressDtoLike } from '@/lib/address/address-value'
import { formatBranch } from '@/lib/format/branch'
import { documentExtension } from '@/lib/warehouse/lot-documents'

/**
 * ข้อมูลองค์กร (ผู้ให้บริการเอง) + หัวเอกสารกลาง — มติ PO 06/10/2569 U99 · **pure ล้วน** (ใช้ร่วม FE/BE/PDF)
 *
 * - ข้อมูลชุดนี้คือ "ผู้ขาย" บนใบกำกับภาษี/ใบแจ้งหนี้ และ "ผู้ออกเอกสาร" บนเอกสารภายในทุกใบ
 * - เอกสารภาษี/เอกสารที่ส่งลูกค้าแล้ว **อ่านจาก snapshot** เสมอ — ค่าปัจจุบันใช้กับเอกสารภายในเท่านั้น
 * - โลโก้เก็บเป็น **path** ใน bucket `case-documents` (อัปโหลดผ่าน server) · เปลี่ยนโลโก้ = path ใหม่ ไฟล์เดิมไม่ถูกลบ
 */

// ── โลโก้ ─────────────────────────────────────────────────────────────────

/** เพดานไฟล์โลโก้ 1 MB (มติ PO U99) — ตัวบังคับจริงคือการตรวจไฟล์ฝั่ง server ตอนผูกโลโก้ */
export const ORGANIZATION_LOGO_MAX_BYTES = 1024 * 1024

/** ชนิดไฟล์โลโก้ที่รับ — PNG/JPG เท่านั้น (ฝังลง PDF ได้ตรง ๆ · ไม่รับ SVG/WEBP/HEIC) */
export const ORGANIZATION_LOGO_ACCEPT = 'image/png,image/jpeg'

export function organizationLogoPrefix(organizationId: string): string {
  return `organization/${organizationId}/logo/`
}

/** path ต่อเวอร์ชัน `organization/<orgId>/logo/<uuid>.<ext>` — ไม่ทับไฟล์เดิม (เอกสารเก่าอ้าง path เดิมได้) */
export function organizationLogoPath(organizationId: string, fileName: string, uniqueKey: string): string {
  return `${organizationLogoPrefix(organizationId)}${uniqueKey}.${documentExtension(fileName)}`
}

// ── ค่าตัวอย่างจาก seed (ต้องแก้ก่อน go-live) ─────────────────────────────

/** เลขผู้เสียภาษีตัวอย่างของ seed — ยังเป็นค่านี้ = ยังไม่ได้กรอกข้อมูลจริง */
export const PLACEHOLDER_TAX_ID = '0000000000000'

/** ข้อความที่ seed ใส่แทนที่อยู่จริง — ตรวจแบบ "มีคำนี้" เพื่อจับทั้งค่าเดิมและค่าที่ถูกแก้บางส่วน */
const PLACEHOLDER_ADDRESS_MARKER = 'รอกรอก'

export interface OrganizationProfileCore {
  name: string
  taxId: string
  address: string
}

/**
 * รายการที่ยังไม่พร้อมใช้ออกเอกสารจริง — ว่าง = พร้อม · **เตือน ไม่บล็อก** (หน้าข้อมูลองค์กร/ความพร้อมปิดงวด/
 * หน้าออกเอกสารภาษี) · ยามบล็อกจริงของใบกำกับยังเป็น `assertTaxInvoiceFieldsComplete()` เหมือนเดิม
 */
export function organizationProfileIssues(profile: OrganizationProfileCore): string[] {
  const issues: string[] = []
  if (profile.name.trim() === '') issues.push('ยังไม่ได้กรอกชื่อบริษัท')
  if (profile.taxId === PLACEHOLDER_TAX_ID || !/^\d{13}$/.test(profile.taxId)) {
    issues.push('เลขประจำตัวผู้เสียภาษียังเป็นค่าตัวอย่าง — กรอกเลขจริง 13 หลัก')
  }
  if (profile.address.trim() === '' || profile.address.includes(PLACEHOLDER_ADDRESS_MARKER)) {
    issues.push('ที่อยู่ตามที่จดทะเบียนยังเป็นค่าตัวอย่าง — กรอกที่อยู่จริง')
  }
  return issues
}

/** ข้อความเตือนรวม (ความพร้อมปิดงวด / หน้าออกเอกสารภาษี) — `null` = ข้อมูลครบแล้ว */
export function organizationProfileWarning(issues: readonly string[]): string | null {
  if (issues.length === 0) return null
  return `ข้อมูลองค์กรยังไม่ครบ (${issues.join(' · ')}) — เอกสารที่ออกจะพิมพ์ค่านี้ แก้ได้ที่ การตั้งค่า → ข้อมูลองค์กร`
}

// ── ที่อยู่แยกช่อง ────────────────────────────────────────────────────────

export interface OrganizationAddressParts {
  addressDetail: string | null
  addressSubdistrict: string | null
  addressDistrict: string | null
  addressProvince: string | null
  addressPostalCode: string | null
}

export function organizationAddressDto(parts: OrganizationAddressParts): AddressDtoLike {
  return {
    detail: parts.addressDetail,
    subdistrict: parts.addressSubdistrict,
    district: parts.addressDistrict,
    province: parts.addressProvince,
    postalCode: parts.addressPostalCode,
  }
}

/** ที่อยู่บรรทัดเดียวที่เก็บคู่กับช่องแยก (`organizations.address`) — snapshot ของเอกสารอ่านบรรทัดนี้ */
export function organizationAddressLine(parts: OrganizationAddressParts): string {
  return formatThaiAddressLine(organizationAddressDto(parts)) ?? ''
}

// ── snapshot หัวเอกสารส่วนที่เพิ่ม (ใบกำกับภาษี · ใบแจ้งหนี้) ──────────────

/**
 * ฟิลด์หัวเอกสารที่เพิ่มตาม U99 — ชื่อ/เลขผู้เสียภาษี/ที่อยู่/โทร/สาขา snapshot แยกคอลัมน์อยู่แล้วตั้งแต่ก่อน
 * เก็บเป็น JSONB `seller_profile_snapshot`
 * มติ PO U110 — พิมพ์ซ้ำใช้ snapshot เท่านั้น: NULL (เอกสารก่อน U99) ⇒ ฟิลด์ชุดนี้**ว่าง** (ไม่ดึงค่าปัจจุบัน)
 * + เก็บ SHA-256 ของไฟล์โลโก้ (`logo_sha256`) — ไฟล์ที่ path เดิมไม่ตรง hash = พิมพ์โดยไม่มีโลโก้
 */
export interface SellerProfileSnapshot {
  nameEn: string | null
  email: string | null
  website: string | null
  logoPath: string | null
  /** SHA-256 ของไฟล์โลโก้ ณ ตอนออก (U110) — `null` = snapshot ก่อน U110/องค์กรยังไม่มี hash (ไม่ตรวจ) */
  logoSha256: string | null
}

/** ฟิลด์หัวเอกสารว่างทั้งชุด — เอกสารที่ไม่มี snapshot ชุดเพิ่ม (มติ PO U110) */
export const EMPTY_SELLER_PROFILE: SellerProfileSnapshot = {
  nameEn: null,
  email: null,
  website: null,
  logoPath: null,
  logoSha256: null,
}

/** ค่าปัจจุบันขององค์กร → ชุดที่ snapshot ลงเอกสาร (ใช้ตอน**ออก**เอกสารเท่านั้น) */
export function sellerProfileOf(row: {
  nameEn: string | null
  email: string | null
  website: string | null
  logoUrl: string | null
  logoSha256: string | null
}): SellerProfileSnapshot {
  return {
    nameEn: row.nameEn,
    email: row.email,
    website: row.website,
    logoPath: row.logoUrl,
    logoSha256: row.logoUrl === null ? null : row.logoSha256,
  }
}

/** แถวองค์กร → ค่า JSONB ที่บันทึกลงเอกสาร (คีย์ snake_case ตามธรรมเนียม DB) */
export function sellerProfileSnapshotJson(profile: SellerProfileSnapshot): {
  name_en: string | null
  email: string | null
  website: string | null
  logo_path: string | null
  logo_sha256: string | null
} {
  return {
    name_en: profile.nameEn,
    email: profile.email,
    website: profile.website,
    logo_path: profile.logoPath,
    logo_sha256: profile.logoSha256,
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function sha256OrNull(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) ? value : null
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** อ่าน JSONB กลับ — `null` = ไม่มี snapshot (เอกสารก่อน U99) · ค่าที่รูปไม่ตรงถือเป็นค่าว่างของฟิลด์นั้น */
export function parseSellerProfileSnapshot(value: unknown): SellerProfileSnapshot | null {
  const record = recordOf(value)
  if (record === null) return null
  return {
    nameEn: stringOrNull(record['name_en']),
    email: stringOrNull(record['email']),
    website: stringOrNull(record['website']),
    logoPath: stringOrNull(record['logo_path']),
    logoSha256: sha256OrNull(record['logo_sha256']),
  }
}

// ── snapshot หัวกระดาษทั้งชุด (ใบส่งมอบ LOT/DLV — มติ PO U111) ─────────────────

/** หัวกระดาษองค์กรครบทุกช่อง ณ ตอนยืนยันล็อต — เก็บเป็น JSONB `handover_lots.letterhead_snapshot` */
export type OrganizationLetterheadSnapshot = LetterheadCore & SellerProfileSnapshot

/** ค่าปัจจุบันขององค์กร → snapshot หัวกระดาษทั้งชุด (ใช้ตอน**ยืนยันล็อต**เท่านั้น) */
export function organizationLetterheadSnapshotOf(row: {
  name: string
  nameEn: string | null
  taxId: string
  address: string
  phone: string | null
  email: string | null
  website: string | null
  branchCode: string
  logoUrl: string | null
  logoSha256: string | null
}): OrganizationLetterheadSnapshot {
  return {
    name: row.name,
    taxId: row.taxId,
    address: row.address,
    phone: row.phone,
    branchCode: row.branchCode,
    ...sellerProfileOf(row),
  }
}

/** snapshot หัวกระดาษทั้งชุด → ค่า JSONB (คีย์ snake_case) */
export function organizationLetterheadSnapshotJson(snapshot: OrganizationLetterheadSnapshot): {
  name: string
  tax_id: string
  address: string
  phone: string | null
  branch_code: string
  name_en: string | null
  email: string | null
  website: string | null
  logo_path: string | null
  logo_sha256: string | null
} {
  return {
    name: snapshot.name,
    tax_id: snapshot.taxId,
    address: snapshot.address,
    phone: snapshot.phone,
    branch_code: snapshot.branchCode,
    ...sellerProfileSnapshotJson(snapshot),
  }
}

/** อ่าน JSONB กลับ — `null` = ไม่มี snapshot (ล็อตก่อน U111) หรือรูปไม่ครบ (ไม่มีชื่อ/เลขผู้เสียภาษี) */
export function parseOrganizationLetterheadSnapshot(value: unknown): OrganizationLetterheadSnapshot | null {
  const record = recordOf(value)
  const profile = parseSellerProfileSnapshot(value)
  if (record === null || profile === null) return null
  const name = stringOrNull(record['name'])
  const taxId = stringOrNull(record['tax_id'])
  if (name === null || taxId === null) return null
  return {
    name,
    taxId,
    address: typeof record['address'] === 'string' ? record['address'] : '',
    phone: stringOrNull(record['phone']),
    branchCode: stringOrNull(record['branch_code']) ?? '00000',
    ...profile,
  }
}

// ── หัวเอกสารกลาง ─────────────────────────────────────────────────────────

/** รูปโลโก้ที่โหลดจาก Storage แล้ว (ฝั่ง server) — ฝังลง PDF ตรง ๆ */
export interface LetterheadLogo {
  data: Buffer
  format: 'png' | 'jpg'
}

/** ข้อมูลหัวเอกสารที่ประกอบเสร็จแล้ว — component PDF แค่พิมพ์ (ห้าม format ซ้ำ) */
export interface DocLetterhead {
  nameTh: string
  nameEn: string | null
  address: string
  phone: string | null
  email: string | null
  website: string | null
  taxId: string
  /** "สำนักงานใหญ่" / "สาขาที่ 00001" */
  branchLabel: string
  logo: LetterheadLogo | null
}

/** ค่าหลักของผู้ออกเอกสาร — จาก snapshot บนเอกสาร หรือค่าปัจจุบันขององค์กร */
export interface LetterheadCore {
  name: string
  taxId: string
  address: string
  phone: string | null
  branchCode: string
}

/** ประกอบหัวเอกสาร — `extras` มาจาก snapshot (ถ้ามี) หรือค่าปัจจุบัน · โลโก้โหลดแยก (I/O) แล้วส่งเข้ามา */
export function buildLetterhead(
  core: LetterheadCore,
  extras: Pick<SellerProfileSnapshot, 'nameEn' | 'email' | 'website'>,
  logo: LetterheadLogo | null,
): DocLetterhead {
  const clean = (value: string | null): string | null => {
    const trimmed = (value ?? '').trim()
    return trimmed === '' ? null : trimmed
  }
  return {
    nameTh: core.name.trim(),
    nameEn: clean(extras.nameEn),
    address: core.address.trim(),
    phone: clean(core.phone),
    email: clean(extras.email),
    website: clean(extras.website),
    taxId: core.taxId,
    branchLabel: formatBranch(core.branchCode),
    logo,
  }
}

/** บรรทัดติดต่อ "โทร. … · อีเมล … · เว็บไซต์ …" — ไม่มีสักช่อง = `null` (ไม่พิมพ์บรรทัดว่าง) */
export function letterheadContactLine(letterhead: Pick<DocLetterhead, 'phone' | 'email' | 'website'>): string | null {
  const parts = [
    letterhead.phone === null ? null : `โทร. ${letterhead.phone}`,
    letterhead.email === null ? null : `อีเมล ${letterhead.email}`,
    letterhead.website === null ? null : `เว็บไซต์ ${letterhead.website}`,
  ].filter((part): part is string => part !== null)
  return parts.length === 0 ? null : parts.join(' · ')
}

/** บรรทัดภาษี "เลขประจำตัวผู้เสียภาษี … · สำนักงานใหญ่" */
export function letterheadTaxLine(letterhead: Pick<DocLetterhead, 'taxId' | 'branchLabel'>): string {
  return `เลขประจำตัวผู้เสียภาษี ${letterhead.taxId} · ${letterhead.branchLabel}`
}
