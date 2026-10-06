import { emitAudit } from '@/lib/audit/audit'
import { formatBranch } from '@/lib/format/branch'
import { prisma } from '@/lib/prisma'
import {
  organizationAddressLine,
  organizationProfileIssues,
} from '@/lib/organization/profile'
import type { OrganizationProfileUpdateInput } from '@/lib/organization/schemas'
import type { OrganizationProfileDto } from '@/lib/organization/types'
import type { SettingsMutationContext } from '@/lib/settings/queries/shared'
import { organizationLogoRule } from '@/lib/uploads/rules'
import { createSignedDownloadUrl } from '@/lib/uploads/storage'
import { verifyUploadedFile } from '@/lib/uploads/verify'

/**
 * ชั้นข้อมูลหน้า "ข้อมูลองค์กร" (มติ PO 06/10/2569 U99)
 *
 * - แก้ได้เฉพาะผู้ถือ `manage_invoice_numbering` (Superadmin — ตรวจที่ route) · ทุกการแก้มีเหตุผล + audit before/after
 * - เอกสารที่ออกแล้ว **ไม่เปลี่ยน** — ใบกำกับ/ใบแจ้งหนี้/50 ทวิ snapshot ค่าตอนออกไว้บนแถวของตัวเอง
 * - ที่อยู่: เก็บ 5 ช่อง + บรรทัดรวม (`address`) ที่ประกอบจากช่องทุกครั้ง — snapshot ของเอกสารอ่านบรรทัดรวม
 * - โลโก้: ผูก path ที่ server ออกให้ (ตรวจชนิด/ขนาดจากเนื้อไฟล์ **นอก** transaction) · ลบ = ปลดลิงก์เท่านั้น
 *   ไม่ลบไฟล์ใน Storage (เอกสารที่ snapshot path เดิมยังพิมพ์โลโก้เดิมได้)
 */

const TARGET = 'organizations'

const PROFILE_SELECT = {
  id: true,
  name: true,
  nameEn: true,
  taxId: true,
  branchCode: true,
  address: true,
  addressDetail: true,
  addressSubdistrict: true,
  addressDistrict: true,
  addressProvince: true,
  addressPostalCode: true,
  phone: true,
  email: true,
  website: true,
  vatRegistered: true,
  logoUrl: true,
  updatedAt: true,
} as const

interface ProfileRow {
  id: string
  name: string
  nameEn: string | null
  taxId: string
  branchCode: string
  address: string
  addressDetail: string | null
  addressSubdistrict: string | null
  addressDistrict: string | null
  addressProvince: string | null
  addressPostalCode: string | null
  phone: string | null
  email: string | null
  website: string | null
  vatRegistered: boolean
  logoUrl: string | null
  updatedAt: Date
}

async function loadRow(organizationId: string): Promise<ProfileRow> {
  const row = await prisma.organization.findUnique({ where: { id: organizationId }, select: PROFILE_SELECT })
  // องค์กรของ session ต้องมีอยู่จริงเสมอ — ไม่มี = ข้อมูลเสีย ไม่ใช่ input ผิด
  if (row === null) throw new Error(`organization profile: ไม่พบองค์กร ${organizationId}`)
  return row
}

async function toDto(row: ProfileRow): Promise<OrganizationProfileDto> {
  return {
    organizationId: row.id,
    name: row.name,
    nameEn: row.nameEn,
    taxId: row.taxId,
    branchCode: row.branchCode,
    branchLabel: formatBranch(row.branchCode),
    address: row.address,
    addressDetail: row.addressDetail,
    addressSubdistrict: row.addressSubdistrict,
    addressDistrict: row.addressDistrict,
    addressProvince: row.addressProvince,
    addressPostalCode: row.addressPostalCode,
    phone: row.phone,
    email: row.email,
    website: row.website,
    vatRegistered: row.vatRegistered,
    logoPath: row.logoUrl,
    logoPreviewUrl: row.logoUrl === null ? null : await createSignedDownloadUrl(row.logoUrl),
    issues: organizationProfileIssues(row),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** ค่าที่ลง audit (snake_case ตามคอลัมน์) — ไม่มี signed URL/เวลา */
function auditValues(row: ProfileRow): Record<string, string | boolean | null> {
  return {
    name: row.name,
    name_en: row.nameEn,
    tax_id: row.taxId,
    branch_code: row.branchCode,
    address: row.address,
    address_detail: row.addressDetail,
    address_subdistrict: row.addressSubdistrict,
    address_district: row.addressDistrict,
    address_province: row.addressProvince,
    address_postal_code: row.addressPostalCode,
    phone: row.phone,
    email: row.email,
    website: row.website,
    vat_registered: row.vatRegistered,
    logo_url: row.logoUrl,
  }
}

export async function getOrganizationProfile(organizationId: string): Promise<OrganizationProfileDto> {
  return toDto(await loadRow(organizationId))
}

/** รายการที่ยังเป็นค่าตัวอย่าง — ใช้เตือนในความพร้อมปิดงวด (ไม่บล็อก) */
export async function getOrganizationProfileIssues(organizationId: string): Promise<string[]> {
  const row = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, taxId: true, address: true },
  })
  return row === null ? [] : organizationProfileIssues(row)
}

export async function updateOrganizationProfile(
  context: SettingsMutationContext,
  input: Omit<OrganizationProfileUpdateInput, 'reason'>,
): Promise<OrganizationProfileDto> {
  const organizationId = context.actor.organizationId

  const row = await prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: PROFILE_SELECT })
    const updated = await tx.organization.update({
      where: { id: organizationId },
      data: {
        name: input.name,
        nameEn: input.nameEn,
        taxId: input.taxId,
        branchCode: input.branchCode,
        addressDetail: input.addressDetail,
        addressSubdistrict: input.addressSubdistrict,
        addressDistrict: input.addressDistrict,
        addressProvince: input.addressProvince,
        addressPostalCode: input.addressPostalCode,
        // บรรทัดรวมประกอบจากช่องเสมอ — ห้ามรับจาก client (สองค่าห้ามหลุดกัน)
        address: organizationAddressLine(input),
        phone: input.phone,
        email: input.email,
        website: input.website,
        vatRegistered: input.vatRegistered,
      },
      select: PROFILE_SELECT,
    })

    // action `update` ⇒ `emitAudit()` เก็บเฉพาะฟิลด์ที่เปลี่ยน (diff) ให้เอง
    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: organizationId,
        before: auditValues(before),
        after: auditValues(updated),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )
    return updated
  })

  return toDto(row)
}

/** ผูกโลโก้ใหม่ — path ต้องอยู่ใต้ prefix ขององค์กรเอง + เป็น PNG/JPG ≤ 1 MB (ตรวจจากเนื้อไฟล์) */
export async function setOrganizationLogo(context: SettingsMutationContext, path: string): Promise<OrganizationProfileDto> {
  const organizationId = context.actor.organizationId
  // I/O เครือข่าย — ตรวจก่อนเปิด transaction (ไม่ถือ transaction ค้างระหว่างดาวน์โหลด)
  const verified = await verifyUploadedFile(path, organizationLogoRule(organizationId))

  const row = await prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { logoUrl: true } })
    const updated = await tx.organization.update({
      where: { id: organizationId },
      data: { logoUrl: path },
      select: PROFILE_SELECT,
    })
    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: organizationId,
        before: { logo_url: before.logoUrl },
        after: { logo_url: path, logo_sha256: verified.sha256, logo_mime_type: verified.mimeType, logo_size_bytes: verified.sizeBytes },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )
    return updated
  })
  return toDto(row)
}

/** ลบโลโก้ = ปลดลิงก์ (ไฟล์เดิมยังอยู่ให้เอกสารที่ snapshot ไว้) · ไม่มีโลโก้อยู่แล้ว = คืนค่าเดิมโดยไม่ลง audit */
export async function removeOrganizationLogo(context: SettingsMutationContext): Promise<OrganizationProfileDto> {
  const organizationId = context.actor.organizationId
  const row = await prisma.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: PROFILE_SELECT })
    if (before.logoUrl === null) return before
    const updated = await tx.organization.update({
      where: { id: organizationId },
      data: { logoUrl: null },
      select: PROFILE_SELECT,
    })
    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: organizationId,
        before: { logo_url: before.logoUrl },
        after: { logo_url: null },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )
    return updated
  })
  return toDto(row)
}
