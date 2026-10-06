import type { TemplateDocumentType } from '@/lib/generated/prisma/enums'
import { emitAudit } from '@/lib/audit/audit'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import {
  DEFAULT_TAX_DOC_TEMPLATE,
  TEMPLATE_DOCUMENT_SAMPLE,
  TEMPLATE_DOCUMENT_TYPES,
  TEMPLATE_DOCUMENT_TYPE_LABEL,
  TEMPLATE_SIGNATURE_SLOT_LABEL,
  documentTemplateSnapshotOf,
  normalizeTaxDocTemplateValues,
  toTaxDocTemplateAuditPayload,
  type DocumentTemplateSnapshot,
  type TaxDocTemplateValues,
} from '@/lib/settings/tax-doc-template'
import type { TaxDocTemplateDto } from '@/lib/settings/types'

/**
 * เทมเพลตเอกสาร (`13` §6.13 · มติ PO U122) — ชั้น DB · **1 record ต่อ (องค์กร, ชนิดเอกสาร)**
 *
 * ยังไม่เคยตั้งค่า = คืนค่าเริ่มต้นโดย**ไม่**สร้างแถว (ตัว render PDF ใช้ default ได้เลย) —
 * แถวเกิดตอน PATCH ครั้งแรกผ่าน upsert · ฟิลด์บังคับตามกฎหมายปิดไม่ได้ ไม่มีค่าตั้งใดให้ปิด
 * · ค่าที่ใช้จริงถูก snapshot ลงเอกสารตอนออกผ่าน {@link loadDocumentTemplateSnapshot}
 */

const TARGET = 'tax_document_template_settings'

const templateSelect = {
  id: true,
  documentType: true,
  footerNote: true,
  printSignature: true,
  updatedAt: true,
} as const

type TemplateRow = Prisma.TaxDocumentTemplateSettingsGetPayload<{ select: typeof templateSelect }>

function toDto(documentType: TemplateDocumentType, row: TemplateRow | null): TaxDocTemplateDto {
  const values: TaxDocTemplateValues = row === null ? DEFAULT_TAX_DOC_TEMPLATE : row
  return {
    documentType,
    documentTypeLabel: TEMPLATE_DOCUMENT_TYPE_LABEL[documentType],
    footerNote: values.footerNote,
    printSignature: values.printSignature,
    signatureSlotLabel: TEMPLATE_SIGNATURE_SLOT_LABEL[documentType],
    sampleType: TEMPLATE_DOCUMENT_SAMPLE[documentType],
    updatedAt: row === null ? null : toIso(row.updatedAt),
  }
}

/** ทั้ง 3 ชนิดเสมอ — ชนิดที่ยังไม่ตั้งค่าแสดงค่าเริ่มต้น (UI ไม่ต้องเดาว่ามีแถวหรือยัง) */
export async function listTaxDocTemplates(organizationId: string): Promise<TaxDocTemplateDto[]> {
  const rows = await prisma.taxDocumentTemplateSettings.findMany({
    where: { organizationId },
    select: templateSelect,
  })
  return TEMPLATE_DOCUMENT_TYPES.map((documentType) =>
    toDto(documentType, rows.find((row) => row.documentType === documentType) ?? null),
  )
}

/** องค์กรมีรูปลายเซ็นผู้มีอำนาจแล้วหรือไม่ — แท็บเทมเพลตแสดงสถานะคู่สวิตช์ (ไม่ส่ง path/URL ของรูป) */
export async function organizationHasSignature(organizationId: string): Promise<boolean> {
  const row = await prisma.organization.findUnique({ where: { id: organizationId }, select: { signaturePath: true } })
  return row?.signaturePath !== null && row?.signaturePath !== undefined
}

export async function getTaxDocTemplate(
  organizationId: string,
  documentType: TemplateDocumentType,
): Promise<TaxDocTemplateDto> {
  const row = await prisma.taxDocumentTemplateSettings.findUnique({
    where: { organizationId_documentType: { organizationId, documentType } },
    select: templateSelect,
  })
  return toDto(documentType, row)
}

export async function updateTaxDocTemplate(
  context: SettingsMutationContext,
  documentType: TemplateDocumentType,
  values: TaxDocTemplateValues,
): Promise<TaxDocTemplateDto> {
  const organizationId = context.actor.organizationId
  const normalized = normalizeTaxDocTemplateValues(values)
  const before = await getTaxDocTemplate(organizationId, documentType)
  const isFirstTime = before.updatedAt === null

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.taxDocumentTemplateSettings.upsert({
      where: { organizationId_documentType: { organizationId, documentType } },
      create: { organizationId, documentType, ...normalized, updatedBy: context.actor.id },
      update: { ...normalized, updatedBy: context.actor.id },
      select: templateSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: isFirstTime ? 'create' : 'update',
        targetType: TARGET,
        // `audit_logs.target_id` เป็น UUID — ใช้ id ของแถวที่ upsert คืนมา (ชนิดเอกสารอยู่ใน payload)
        targetId: row.id,
        ...(isFirstTime ? {} : { before: toTaxDocTemplateAuditPayload(documentType, before) }),
        after: toTaxDocTemplateAuditPayload(documentType, normalized),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(documentType, updated)
}

/** client ที่อ่านได้ทั้ง `prisma` และ transaction (`tx`) — ชนิดของ client ที่ต่อ extension แล้ว (กับดัก `Prisma.TransactionClient`) */
type ReadClient = Pick<typeof prisma, 'taxDocumentTemplateSettings' | 'organization'>

/**
 * ค่าเทมเพลต + รูปลายเซ็น**ปัจจุบัน**ที่จะ snapshot ลงเอกสารฉบับที่กำลังออก (มติ PO U122)
 * — เรียกตอนออกใบกำกับ/ใบเสร็จ · ส่งรอบวางบิล · ยืนยันล็อต (ใน transaction เดียวกับการออกได้)
 */
export async function loadDocumentTemplateSnapshot(
  client: ReadClient,
  organizationId: string,
  documentType: TemplateDocumentType,
  /** ผู้ลงนามฝั่งคู่ค้า (มติ PO U151 — ใบส่งมอบ: ผู้ลงนามของบริษัทไฟแนนซ์) */
  counterpartySignerName: string | null = null,
): Promise<DocumentTemplateSnapshot> {
  // ทีละคำสั่ง — ใช้ใน interactive transaction ได้ (ไม่ยิงขนานบน connection เดียว)
  const template = await client.taxDocumentTemplateSettings.findUnique({
    where: { organizationId_documentType: { organizationId, documentType } },
    select: { footerNote: true, printSignature: true },
  })
  const organization = await client.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { signaturePath: true, signatureSha256: true, authorizedSignerName: true, authorizedSignerTitle: true },
  })
  return documentTemplateSnapshotOf(template, organization, counterpartySignerName)
}
