import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { BillingInvoiceSource } from '@/lib/revenue/billing-invoice'
import type { TaxInvoiceDocSource } from '@/lib/sales/sales'
import {
  buildLetterhead,
  EMPTY_SELLER_PROFILE,
  LETTERHEAD_ORGANIZATION_SELECT,
  organizationLetterheadSnapshotJson,
  organizationLetterheadSnapshotOf,
  parseOrganizationLetterheadSnapshot,
  sellerProfileOf,
  type OrganizationLetterheadSnapshot,
  type DocLetterhead,
  type LetterheadCore,
  type LetterheadLogo,
  type SellerProfileSnapshot,
} from '@/lib/organization/profile'
import { loadDocumentTemplateSnapshot } from '@/lib/settings/queries/tax-doc-templates'
import {
  NO_DOC_TEMPLATE,
  TEMPLATE_SIGNATURE_SLOT,
  type DocTemplateRender,
  type DocumentTemplateSnapshot,
} from '@/lib/settings/tax-doc-template'
import type { TemplateDocumentType } from '@/lib/generated/prisma/enums'
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
 * - **เอกสารภายในที่ออกให้คน** (ใบสำคัญจ่าย/สลิป · ใบเบิก/ใบรับคืนเงินทดรอง · ใบรับรองแทนใบเสร็จ):
 *   `letterhead_snapshot` ตอนออก (มติ PO 07/10/2569 U130 — `issuedDocumentLetterhead()`) · ไม่มี snapshot = ค่าปัจจุบัน
 * - **เอกสารภายในอื่น** (สรุปรอบจ่าย/รายงาน/หน้าปก): ค่าปัจจุบันขององค์กร
 *
 * โลโก้: ดาวน์โหลดจาก Storage ด้วย service role แล้วฝังเป็นรูป · โหลดไม่ได้/ไม่ใช่ PNG-JPG = พิมพ์โดยไม่มีโลโก้
 * · snapshot มี `logo_sha256` แล้วไฟล์ไม่ตรง hash = พิมพ์โดยไม่มีโลโก้ (ไม่พิมพ์รูปอื่นแทนรูปตอนออก — U110)
 * (ไม่ทำให้การออกเอกสารล้ม — โลโก้เป็นส่วนประกอบ ไม่ใช่ข้อมูลบังคับทางภาษี)
 *
 * เทมเพลตเอกสาร (มติ PO U122 — ข้อความท้าย + รูปลายเซ็น): อ่านจาก `document_template_snapshot` ของเอกสาร
 * · ไม่มี snapshot (เอกสารก่อน U122) = ไม่พิมพ์ · ใบส่งมอบที่ยังไม่ยืนยัน = ค่าตั้งปัจจุบัน
 * · รูปลายเซ็นโหลดด้วยตัวเดียวกับโลโก้ (ตรวจ hash) — โหลดไม่ได้/ไม่ตรง = เว้นช่องเซ็นมือ ไม่ทำให้ออกเอกสารล้ม
 */


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
  template: (documentType: TemplateDocumentType, snapshot: DocumentTemplateSnapshot | null) => Promise<DocTemplateRender>
  currentTemplate: (documentType: TemplateDocumentType) => Promise<DocTemplateRender>
} {
  let organization: Promise<OrganizationLetterheadRow> | null = null
  const logos = new Map<string, Promise<LetterheadLogo | null>>()

  const loadOrganization = (): Promise<OrganizationLetterheadRow> =>
    (organization ??= prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: LETTERHEAD_ORGANIZATION_SELECT }))

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

  const template = async (
    documentType: TemplateDocumentType,
    snapshot: DocumentTemplateSnapshot | null,
  ): Promise<DocTemplateRender> => {
    // มติ PO U122 — เอกสารก่อน U122 ไม่มี snapshot ⇒ ไม่พิมพ์ข้อความท้าย/ลายเซ็น (ห้ามดึงค่าปัจจุบัน)
    if (snapshot === null) return NO_DOC_TEMPLATE
    return {
      footerNote: snapshot.footerNote,
      signature: await loadLogo(snapshot.signaturePath, snapshot.signatureSha256),
      signatureSlot: TEMPLATE_SIGNATURE_SLOT[documentType],
    }
  }

  return {
    current,
    template,
    async currentTemplate(documentType) {
      return template(documentType, await loadDocumentTemplateSnapshot(prisma, organizationId, documentType))
    },
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

/** client ขั้นต่ำที่การ snapshot หัวกระดาษต้องใช้ — รับ `tx` ของ `$transaction` ได้ทุกโมดูล */
export interface LetterheadSnapshotReader {
  organization: {
    findUniqueOrThrow(args: {
      where: { id: string }
      select: typeof LETTERHEAD_ORGANIZATION_SELECT
    }): Promise<OrganizationLetterheadRow>
  }
}

/**
 * snapshot หัวกระดาษองค์กรทั้งชุด ณ ตอนออกเอกสาร (มติ PO 07/10/2569 U130 — แนวเดียวกับ U110/U111)
 * → ค่า JSONB สำหรับคอลัมน์ `letterhead_snapshot` · เรียกใน `$transaction` เดียวกับการออกเอกสาร
 */
export async function captureLetterheadSnapshot(
  client: LetterheadSnapshotReader,
  organizationId: string,
): Promise<ReturnType<typeof organizationLetterheadSnapshotJson>> {
  const row = await client.organization.findUniqueOrThrow({ where: { id: organizationId }, select: LETTERHEAD_ORGANIZATION_SELECT })
  return organizationLetterheadSnapshotJson(organizationLetterheadSnapshotOf(row))
}

/**
 * หัวกระดาษของเอกสารภายในที่มี snapshot (ใบสำคัญจ่าย/สลิป/ADV/RAV/CRT — U130) · ไม่มี snapshot
 * (เอกสารก่อน U130 หรือยังไม่ถึงจังหวะออก) = ค่าปัจจุบัน (พฤติกรรมเดิม)
 */
export function issuedDocumentLetterhead(organizationId: string, snapshot: unknown): Promise<DocLetterhead> {
  return createLetterheadResolver(organizationId).forOrganizationSnapshot(parseOrganizationLetterheadSnapshot(snapshot))
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

/** ข้อความท้าย + ลายเซ็นของใบกำกับภาษี/ใบเสร็จรับเงิน — snapshot ตอนออกใบ (มติ PO U122) */
export function taxInvoiceTemplate(resolver: LetterheadResolver, source: TaxInvoiceDocSource): Promise<DocTemplateRender> {
  return resolver.template('tax_invoice', source.templateSnapshot)
}

/** ข้อความท้าย + ลายเซ็นของใบแจ้งหนี้/ใบวางบิล — snapshot ตอนส่งรอบ (มติ PO U122) */
export function billingInvoiceTemplate(resolver: LetterheadResolver, source: BillingInvoiceSource): Promise<DocTemplateRender> {
  return resolver.template('billing_invoice', source.templateSnapshot)
}

/**
 * ข้อความท้าย + ลายเซ็นของใบส่งมอบ (มติ PO U122) — ล็อตยืนยันแล้ว = snapshot ตอนยืนยัน (ไม่มี = ไม่พิมพ์)
 * · ล็อตที่ยังไม่ยืนยัน (`'current'`) = ค่าตั้งปัจจุบัน (ใบที่พิมพ์ให้ลูกค้าเซ็นก่อนยืนยัน)
 */
export function handoverTemplate(
  organizationId: string,
  documentTemplate: DocumentTemplateSnapshot | null | 'current',
): Promise<DocTemplateRender> {
  const resolver = createLetterheadResolver(organizationId)
  return documentTemplate === 'current'
    ? resolver.currentTemplate('handover_note')
    : resolver.template('handover_note', documentTemplate)
}
