import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { BillingInvoiceSource } from '@/lib/revenue/billing-invoice'
import type { TaxInvoiceDocSource } from '@/lib/sales/sales'
import {
  buildLetterhead,
  EMPTY_SELLER_PROFILE,
  sellerProfileOf,
  type OrganizationLetterheadSnapshot,
  type DocLetterhead,
  type LetterheadCore,
  type LetterheadLogo,
  type SellerProfileSnapshot,
} from '@/lib/organization/profile'
import { detectFileKind } from '@/lib/uploads/inspect'
import { downloadUploadedFile } from '@/lib/uploads/storage'

/**
 * โหลดหัวเอกสารกลาง (มติ PO U99) — **ฝั่ง server เท่านั้น** (Prisma + Storage)
 *
 * แหล่งข้อมูลตามชนิดเอกสาร:
 * - **เอกสารภาษี/เอกสารที่ส่งลูกค้าแล้ว** (ใบกำกับภาษี · ใบแจ้งหนี้): ชื่อ/เลขผู้เสียภาษี/ที่อยู่/โทร/สาขา จาก snapshot
 *   บนแถวเอกสาร + ชื่ออังกฤษ/อีเมล/เว็บไซต์/โลโก้ จาก `seller_profile_snapshot` — **ใช้ snapshot เท่านั้น** (มติ PO U110):
 *   เอกสารก่อน U99 (ไม่มีชุดนี้) ⇒ 4 ฟิลด์นี้ว่าง ไม่ดึงค่าปัจจุบัน
 * - **ใบส่งมอบ LOT/DLV**: `handover_lots.letterhead_snapshot` ตอนยืนยันล็อต (มติ PO U111) — ล็อตที่ยังไม่ยืนยัน/
 *   ล็อตเก่าที่ไม่มี snapshot ใช้ค่าปัจจุบัน
 * - **เอกสารภายใน** (ใบสำคัญจ่าย/สลิป/สรุปรอบ/รายงาน/หน้าปก): ค่าปัจจุบันขององค์กร
 *
 * โลโก้: ดาวน์โหลดจาก Storage ด้วย service role แล้วฝังเป็นรูป · โหลดไม่ได้/ไม่ใช่ PNG-JPG = พิมพ์โดยไม่มีโลโก้
 * · snapshot มี `logo_sha256` แล้วไฟล์ไม่ตรง hash = พิมพ์โดยไม่มีโลโก้ (ไม่พิมพ์รูปอื่นแทนรูปตอนออก — U110)
 * (ไม่ทำให้การออกเอกสารล้ม — โลโก้เป็นส่วนประกอบ ไม่ใช่ข้อมูลบังคับทางภาษี)
 */

const ORGANIZATION_SELECT = {
  name: true,
  nameEn: true,
  taxId: true,
  address: true,
  phone: true,
  email: true,
  website: true,
  branchCode: true,
  logoUrl: true,
  logoSha256: true,
} as const

interface OrganizationLetterheadRow {
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
}

/**
 * โหลดไฟล์โลโก้เป็นรูปฝัง PDF — `null` เมื่อไม่มี path/ไฟล์หาย/ชนิดไม่รองรับ/Storage ล่ม
 * หรือส่ง `expectedSha256` มาแล้วไฟล์ไม่ตรง (มติ PO U110 — พิมพ์ซ้ำต้องเป็นรูปเดียวกับตอนออก)
 */
export async function loadLetterheadLogo(
  path: string | null,
  expectedSha256: string | null = null,
): Promise<LetterheadLogo | null> {
  if (path === null || path.trim() === '') return null
  try {
    const bytes = await downloadUploadedFile(path)
    if (bytes === null) return null
    if (expectedSha256 !== null && createHash('sha256').update(bytes).digest('hex') !== expectedSha256) return null
    const kind = detectFileKind(bytes)
    if (kind === 'png') return { data: Buffer.from(bytes), format: 'png' }
    if (kind === 'jpeg') return { data: Buffer.from(bytes), format: 'jpg' }
    return null
  } catch {
    return null
  }
}

/** core ของเอกสารภาษีที่ snapshot ไว้บนแถว (ชื่อ/เลขผู้เสียภาษี/ที่อยู่/โทร/สาขา) */
export type SnapshotCore = LetterheadCore

/**
 * ตัวโหลดหัวเอกสารต่อองค์กร — cache ค่าปัจจุบัน + รูปโลโก้ต่อ path ภายในการเรียกหนึ่งครั้ง
 * (Export Pack พิมพ์เอกสารหลายสิบใบ ⇒ ไม่ดาวน์โหลดโลโก้ซ้ำทุกใบ)
 */
export function createLetterheadResolver(organizationId: string): {
  current: () => Promise<DocLetterhead>
  forSnapshot: (core: SnapshotCore, snapshot: SellerProfileSnapshot | null) => Promise<DocLetterhead>
  forOrganizationSnapshot: (snapshot: OrganizationLetterheadSnapshot | null) => Promise<DocLetterhead>
} {
  let organization: Promise<OrganizationLetterheadRow> | null = null
  const logos = new Map<string, Promise<LetterheadLogo | null>>()

  const loadOrganization = (): Promise<OrganizationLetterheadRow> =>
    (organization ??= prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: ORGANIZATION_SELECT }))

  const loadLogo = (path: string | null, sha256: string | null): Promise<LetterheadLogo | null> => {
    if (path === null) return Promise.resolve(null)
    const key = `${path}#${sha256 ?? ''}`
    let cached = logos.get(key)
    if (cached === undefined) {
      cached = loadLetterheadLogo(path, sha256)
      logos.set(key, cached)
    }
    return cached
  }

  const current = async (): Promise<DocLetterhead> => {
    const row = await loadOrganization()
    const extras = sellerProfileOf(row)
    // ค่าปัจจุบัน — ไม่บังคับ hash (ไฟล์ที่ path ปัจจุบันคือโลโก้ปัจจุบันเสมอ)
    return buildLetterhead(row, extras, await loadLogo(extras.logoPath, null))
  }

  return {
    current,
    async forSnapshot(core, snapshot) {
      // มติ PO U110 — เอกสารก่อน U99 ไม่มี snapshot ชุดนี้ ⇒ เว้นว่าง (ห้ามดึงค่าปัจจุบันขององค์กร)
      const extras = snapshot ?? EMPTY_SELLER_PROFILE
      return buildLetterhead(core, extras, await loadLogo(extras.logoPath, extras.logoSha256))
    },
    async forOrganizationSnapshot(snapshot) {
      // มติ PO U111 — ล็อตเก่า/ยังไม่ยืนยัน (ไม่มี snapshot) ⇒ ค่าปัจจุบัน
      if (snapshot === null) return current()
      return buildLetterhead(snapshot, snapshot, await loadLogo(snapshot.logoPath, snapshot.logoSha256))
    },
  }
}

/** หัวเอกสารจากค่าปัจจุบัน (เอกสารภายใน) — เรียกครั้งเดียวต่อเอกสาร */
export async function currentLetterhead(organizationId: string): Promise<DocLetterhead> {
  return createLetterheadResolver(organizationId).current()
}

type LetterheadResolver = ReturnType<typeof createLetterheadResolver>

/** ใบกำกับภาษี/ใบเสร็จรับเงิน — ผู้ขายจาก snapshot บนใบ (ชื่อ/เลขผู้เสียภาษี/ที่อยู่/โทร/สาขา + ชุด U99) */
export function taxInvoiceLetterhead(resolver: LetterheadResolver, source: TaxInvoiceDocSource): Promise<DocLetterhead> {
  return resolver.forSnapshot({ ...source.seller, branchCode: source.sellerBranchCode }, source.sellerProfile)
}

/** ใบแจ้งหนี้/ใบวางบิล — ผู้ให้บริการจาก snapshot ตอนส่งรอบ */
export function billingInvoiceLetterhead(resolver: LetterheadResolver, source: BillingInvoiceSource): Promise<DocLetterhead> {
  return resolver.forSnapshot(source.seller, source.sellerProfile)
}

/** ใบส่งมอบ LOT/DLV — หัวกระดาษจาก snapshot ตอนยืนยันล็อต (มติ PO U111) · ไม่มี snapshot = ค่าปัจจุบัน */
export function handoverLetterhead(
  organizationId: string,
  snapshot: OrganizationLetterheadSnapshot | null,
): Promise<DocLetterhead> {
  return createLetterheadResolver(organizationId).forOrganizationSnapshot(snapshot)
}
