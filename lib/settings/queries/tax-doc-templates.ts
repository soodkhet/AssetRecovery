import type { TaxDocumentType } from '@/lib/generated/prisma/enums'
import { emitAudit } from '@/lib/audit/audit'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import {
  DEFAULT_TAX_DOC_TEMPLATE,
  TAX_DOCUMENT_TYPES,
  TAX_DOCUMENT_TYPE_LABEL,
  normalizeTaxDocTemplateValues,
  toTaxDocTemplateAuditPayload,
  type TaxDocTemplateValues,
} from '@/lib/settings/tax-doc-template'
import type { TaxDocTemplateDto } from '@/lib/settings/types'

/**
 * รูปแบบเอกสารภาษีทางการ (`13` §6.13) — ชั้น DB · **1 record ต่อ (องค์กร, ชนิดเอกสาร)**
 *
 * ยังไม่เคยตั้งค่า = คืนค่าเริ่มต้นโดย**ไม่**สร้างแถว (ตัว render PDF ใช้ default ได้เลย) —
 * แถวเกิดตอน PATCH ครั้งแรกผ่าน upsert · ฟิลด์บังคับตามกฎหมายปิดไม่ได้ ไม่มีค่าตั้งใดให้ปิด
 */

const TARGET = 'tax_document_template_settings'

const templateSelect = {
  id: true,
  documentType: true,
  logoUrl: true,
  footerNote: true,
  signatureImageUrl: true,
  paperSize: true,
  language: true,
  updatedAt: true,
} as const

type TemplateRow = Prisma.TaxDocumentTemplateSettingsGetPayload<{ select: typeof templateSelect }>

function toDto(documentType: TaxDocumentType, row: TemplateRow | null): TaxDocTemplateDto {
  const values: TaxDocTemplateValues = row === null ? DEFAULT_TAX_DOC_TEMPLATE : row
  return {
    documentType,
    documentTypeLabel: TAX_DOCUMENT_TYPE_LABEL[documentType],
    logoUrl: values.logoUrl,
    footerNote: values.footerNote,
    signatureImageUrl: values.signatureImageUrl,
    paperSize: values.paperSize,
    language: values.language,
    updatedAt: row === null ? null : toIso(row.updatedAt),
  }
}

/** ทั้ง 2 ชนิดเสมอ — ชนิดที่ยังไม่ตั้งค่าแสดงค่าเริ่มต้น (UI ไม่ต้องเดาว่ามีแถวหรือยัง) */
export async function listTaxDocTemplates(organizationId: string): Promise<TaxDocTemplateDto[]> {
  const rows = await prisma.taxDocumentTemplateSettings.findMany({
    where: { organizationId },
    select: templateSelect,
  })
  return TAX_DOCUMENT_TYPES.map((documentType) =>
    toDto(documentType, rows.find((row) => row.documentType === documentType) ?? null),
  )
}

export async function getTaxDocTemplate(
  organizationId: string,
  documentType: TaxDocumentType,
): Promise<TaxDocTemplateDto> {
  const row = await prisma.taxDocumentTemplateSettings.findUnique({
    where: { organizationId_documentType: { organizationId, documentType } },
    select: templateSelect,
  })
  return toDto(documentType, row)
}

export async function updateTaxDocTemplate(
  context: SettingsMutationContext,
  documentType: TaxDocumentType,
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
