import type { CapabilityAccessLevel, RoleGroup, UserStatus } from '@/lib/generated/prisma/enums'

/**
 * สิทธิ์หมวดของพอร์ทัลบริษัทไฟแนนซ์ (`97` §3.3, §13, §17 · มติ PO 05/10/2569 O43 D1/D2/D11) — pure
 *
 * - หมวด → capability `portal_*` (เก็บที่ `role_capabilities` · ไม่ใช่ "✅ only")
 * - พอร์ทัลอ่านอย่างเดียว ⇒ `manage` มีผลเท่ากับ `view`
 * - ดาวน์โหลด = `portal_download` **และ** สิทธิ์หมวดของเอกสารนั้น
 * - ผู้ใช้ที่ไม่ใช่ role กลุ่ม `finance_company` (รวม Superadmin — D11) ไม่มีสิทธิ์เลย
 */
export const PORTAL_SECTIONS = ['cases', 'finance', 'handover', 'profile'] as const
export type PortalSection = (typeof PORTAL_SECTIONS)[number]

export const PORTAL_SECTION_CAPABILITY: Readonly<Record<PortalSection, string>> = {
  cases: 'portal_cases',
  finance: 'portal_finance',
  handover: 'portal_handover',
  profile: 'portal_profile',
}

export const PORTAL_DOWNLOAD_CAPABILITY = 'portal_download'

export type PortalCapabilities = Readonly<Record<string, CapabilityAccessLevel | undefined>>

export interface PortalAccessOptions {
  /** ทรัพยากรเป็นไฟล์ดาวน์โหลด/รูป — ต้องมี `portal_download` เพิ่ม */
  download?: boolean
}

function hasLevel(capabilities: PortalCapabilities, code: string): boolean {
  const level = capabilities[code]
  return level === 'view' || level === 'manage'
}

/** ตรวจจาก capability อย่างเดียว (ไม่ดู role) */
export function canAccess(
  section: PortalSection,
  capabilities: PortalCapabilities,
  options: PortalAccessOptions = {},
): boolean {
  if (!hasLevel(capabilities, PORTAL_SECTION_CAPABILITY[section])) return false
  return options.download === true ? hasLevel(capabilities, PORTAL_DOWNLOAD_CAPABILITY) : true
}

export interface PortalViewer {
  roleGroup: RoleGroup
  isSuperadmin: boolean
  capabilities: PortalCapabilities
}

/** ผู้ใช้ฝั่งบริษัทไฟแนนซ์เท่านั้นที่เข้าพอร์ทัลได้ (D2/D11) */
export function isPortalViewer(viewer: PortalViewer): boolean {
  return !viewer.isSuperadmin && viewer.roleGroup === 'finance_company'
}

export function canViewerAccess(
  viewer: PortalViewer,
  section: PortalSection,
  options: PortalAccessOptions = {},
): boolean {
  return isPortalViewer(viewer) && canAccess(section, viewer.capabilities, options)
}

/** หมวดที่เห็นเมนู/การ์ด KPI ได้ (เรียงตามเมนู `97` §5) */
export function visiblePortalSections(viewer: PortalViewer): PortalSection[] {
  return PORTAL_SECTIONS.filter((section) => canViewerAccess(viewer, section))
}

export interface PortalGateInput {
  viewer: PortalViewer
  userStatus: UserStatus
  /** `finance_companies.status` — ไม่ใช่ `active` = ระงับ */
  companyStatus: string | null
}

export type PortalGateResult =
  | { ok: true }
  | { ok: false; code: 'PERMISSION_DENIED' | 'ACCOUNT_INACTIVE' | 'COMPANY_SUSPENDED' }

/**
 * ลำดับตรวจของทุก endpoint (`97` §17): role กลุ่ม `finance_company` → ผู้ใช้ active → บริษัท active →
 * capability ของหมวด (ขั้นสุดท้าย `company_id` ของแถวตรวจที่ query layer)
 */
export function evaluatePortalGate(
  input: PortalGateInput,
  section: PortalSection,
  options: PortalAccessOptions = {},
): PortalGateResult {
  if (!isPortalViewer(input.viewer)) return { ok: false, code: 'PERMISSION_DENIED' }
  if (input.userStatus !== 'active') return { ok: false, code: 'ACCOUNT_INACTIVE' }
  if (input.companyStatus !== 'active') return { ok: false, code: 'COMPANY_SUSPENDED' }
  if (!canAccess(section, input.viewer.capabilities, options)) return { ok: false, code: 'PERMISSION_DENIED' }
  return { ok: true }
}
