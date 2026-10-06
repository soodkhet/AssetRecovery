import { emitAudit } from '@/lib/audit/audit'
import {
  DOCUMENT_NUMBER_DEFAULTS,
  DOCUMENT_NUMBER_ISSUED_WHEN,
  DOCUMENT_NUMBER_LABEL,
  DOCUMENT_NUMBER_TYPES,
  describeDocumentNumberPattern,
  documentNumberHead,
  documentYear,
  effectiveLastSequence,
  isTaxDocumentType,
  previewNextDocumentNumber,
  sameDocumentNumberFormat,
  type DocumentNumberFormat,
  type DocumentNumberState,
} from '@/lib/document-numbering/format'
import type { DocumentNumberingDto } from '@/lib/document-numbering/types'
import type { DocumentNumberType } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'
import type { SettingsMutationContext, SettingsTxClient } from '@/lib/settings/queries/shared'

/**
 * เลขที่เอกสาร (มติ PO 06/10/2569 U102 · `13` §6.12) — ชั้น DB
 *
 * ### กติกาที่ห้ามหลุด
 * - **ตัวเดินเลขมีที่เดียว** = SQL `next_document_number_full()` (ล็อกแถว `document_number_series` FOR UPDATE)
 *   ⇒ ห้ามอ่านตัวนับมาบวกในโค้ดแล้วเขียนกลับ · ต้องเรียกภายใน `$transaction` เดียวกับ INSERT เอกสารเสมอ
 *   (rollback = ตัวนับ rollback ⇒ ไม่มีเลขขาด)
 * - BL / ADV / RAV ออกเลขโดย trigger ตอน INSERT (ไม่ต้องเรียกจากแอป)
 * - เอกสารภาษี (INV/WHT) ล็อกรูปแบบหลังออกฉบับแรก (`NUMBERING_FORMAT_LOCKED`) และตั้งเลขเองไม่ได้
 * - ชนิดอื่นเปลี่ยนรูปแบบได้ มีผลฉบับถัดไป · ตั้ง "เลขถัดไป" ได้แต่ห้ามต่ำกว่าเลขที่ใช้แล้ว
 */

const TARGET = 'document_number_series'

/** client ใดก็ได้ที่ยิง raw SQL ได้ (tx ของทุกโมดูล หรือ `prisma`) */
export type DocumentNumberingClient = Pick<SettingsTxClient, '$queryRaw'>

export interface IssuedDocumentNumber {
  number: string
  sequence: number
  /** ปี พ.ศ. ของเลข */
  beYear: number
}

/**
 * **ออกเลขเอกสารถัดไปแบบ atomic** — ปีตามวันที่เอกสาร (`at`) เวลาไทย
 * ⚠️ เรียกใน `$transaction` เดียวกับการสร้างเอกสารเสมอ ไม่งั้น rollback ของเอกสารทิ้งเลขเป็นช่องว่าง
 */
export async function nextDocumentNumber(
  client: DocumentNumberingClient,
  organizationId: string,
  docType: DocumentNumberType,
  at: Date,
): Promise<IssuedDocumentNumber> {
  const rows = await client.$queryRaw<Array<{ number: string; seq: number; be_year: number }>>`
    SELECT number, seq, be_year
      FROM next_document_number_full(${organizationId}::uuid, ${docType}::document_number_type, ${at}::timestamptz)
  `
  const row = rows[0]
  if (row === undefined) throw new Error(`nextDocumentNumber: ไม่ได้เลข ${docType} ขององค์กร ${organizationId}`)
  return { number: row.number, sequence: Number(row.seq), beYear: Number(row.be_year) }
}

interface SeriesRow {
  id: string
  doc_type: DocumentNumberType
  prefix: string
  include_year: boolean
  digits: number
  reset_yearly: boolean
  current_seq: number
  current_year: number | null
  last_issued_number: string | null
  last_issued_at: Date | null
  updated_at: Date
}

function toState(row: SeriesRow): DocumentNumberState {
  return {
    prefix: row.prefix,
    includeYear: row.include_year,
    digits: Number(row.digits),
    resetYearly: row.reset_yearly,
    currentSeq: Number(row.current_seq),
    currentYear: row.current_year === null ? null : Number(row.current_year),
  }
}

/**
 * ล็อกแถวชุดเลข (สร้างค่าเริ่มต้นถ้ายังไม่มี) แล้วคืนสถานะ ณ ตอนได้ล็อก — ใช้ก่อนออกเลขเมื่อต้องตรวจ
 * อะไรเทียบกับเลขก่อนหน้า (เช่น วันที่ใบกำกับภาษีห้ามย้อนเลขก่อนหน้า) · ล็อกค้างถึงจบทรานแซกชัน
 */
export async function lockDocumentSeries(
  client: DocumentNumberingClient,
  organizationId: string,
  docType: DocumentNumberType,
): Promise<DocumentNumberState & { id: string }> {
  await client.$queryRaw`
    SELECT ensure_document_number_series(${organizationId}::uuid, ${docType}::document_number_type)::text`
  const rows = await client.$queryRaw<SeriesRow[]>`
    SELECT id, doc_type, prefix, include_year, digits, reset_yearly, current_seq, current_year,
           last_issued_number, last_issued_at, updated_at
      FROM document_number_series
     WHERE organization_id = ${organizationId}::uuid AND doc_type = ${docType}::document_number_type
       FOR UPDATE`
  const row = rows[0]
  if (row === undefined) throw new Error(`lockDocumentSeries: ไม่พบชุดเลข ${docType} ขององค์กร ${organizationId}`)
  return { id: row.id, ...toState(row) }
}

/** ลำดับสูงสุดที่มีอยู่จริงของเลขที่ขึ้นต้นด้วย `head` (SQL `document_number_max_seq`) */
async function maxIssuedSequence(
  client: DocumentNumberingClient,
  organizationId: string,
  docType: DocumentNumberType,
  head: string,
): Promise<number> {
  const rows = await client.$queryRaw<Array<{ value: number }>>`
    SELECT document_number_max_seq(${organizationId}::uuid, ${docType}::document_number_type, ${head}) AS value`
  return Number(rows[0]?.value ?? 0)
}

async function issuedTaxDocumentCount(organizationId: string): Promise<Record<'tax_invoice' | 'wht_certificate', number>> {
  const [invoices, certificates] = await Promise.all([
    prisma.taxInvoice.count({ where: { organizationId } }),
    prisma.whtCertificate.count({ where: { organizationId } }),
  ])
  return { tax_invoice: invoices, wht_certificate: certificates }
}

function issuedCountOf(
  docType: DocumentNumberType,
  counts: Record<'tax_invoice' | 'wht_certificate', number>,
): number | null {
  if (docType === 'tax_invoice' || docType === 'wht_certificate') return counts[docType]
  return null
}

function isFormatLocked(docType: DocumentNumberType, state: DocumentNumberState, issuedCount: number | null): boolean {
  return isTaxDocumentType(docType) && ((issuedCount ?? 0) > 0 || state.currentSeq > 0)
}

function toDto(row: SeriesRow, issuedCount: number | null, now: Date): DocumentNumberingDto {
  const state = toState(row)
  return {
    docType: row.doc_type,
    label: DOCUMENT_NUMBER_LABEL[row.doc_type],
    issuedWhen: DOCUMENT_NUMBER_ISSUED_WHEN[row.doc_type],
    isTaxDocument: isTaxDocumentType(row.doc_type),
    prefix: state.prefix,
    includeYear: state.includeYear,
    digits: state.digits,
    resetYearly: state.resetYearly,
    currentSeq: state.currentSeq,
    currentYear: state.currentYear,
    lastIssuedNumber: row.last_issued_number,
    lastIssuedAt: row.last_issued_at?.toISOString() ?? null,
    pattern: describeDocumentNumberPattern(state),
    nextNumberPreview: previewNextDocumentNumber(state, now),
    minNextSequence: effectiveLastSequence(state, documentYear(now)) + 1,
    issuedCount,
    formatLocked: isFormatLocked(row.doc_type, state, issuedCount),
    updatedAt: row.updated_at.toISOString(),
  }
}

async function loadSeriesRows(client: DocumentNumberingClient, organizationId: string): Promise<SeriesRow[]> {
  return client.$queryRaw<SeriesRow[]>`
    SELECT id, doc_type, prefix, include_year, digits, reset_yearly, current_seq, current_year,
           last_issued_number, last_issued_at, updated_at
      FROM document_number_series
     WHERE organization_id = ${organizationId}::uuid AND deleted_at IS NULL`
}

/**
 * `GET /api/settings/document-numbering` — ครบทุกชนิดตามลำดับคงที่ · ชนิดที่ยังไม่เคยมีแถว (องค์กรใหม่)
 * แสดงค่าเริ่มต้นโดยไม่เขียน DB (แถวจริงเกิดตอนออกเลขครั้งแรกหรือบันทึกค่าตั้ง)
 */
export async function listDocumentNumbering(organizationId: string, now: Date = new Date()): Promise<DocumentNumberingDto[]> {
  const [rows, counts] = await Promise.all([loadSeriesRows(prisma, organizationId), issuedTaxDocumentCount(organizationId)])
  const byType = new Map(rows.map((row) => [row.doc_type, row]))
  return DOCUMENT_NUMBER_TYPES.map((docType) => {
    const row: SeriesRow = byType.get(docType) ?? defaultRow(docType, now)
    return toDto(row, issuedCountOf(docType, counts), now)
  })
}

function defaultRow(docType: DocumentNumberType, now: Date): SeriesRow {
  const format = DOCUMENT_NUMBER_DEFAULTS[docType]
  return {
    id: '',
    doc_type: docType,
    prefix: format.prefix,
    include_year: format.includeYear,
    digits: format.digits,
    reset_yearly: format.resetYearly,
    current_seq: 0,
    current_year: null,
    last_issued_number: null,
    last_issued_at: null,
    updated_at: now,
  }
}

export interface DocumentNumberingUpdate extends DocumentNumberFormat {
  nextSequence?: number | undefined
}

function toAuditPayload(state: DocumentNumberState): Record<string, unknown> {
  return {
    prefix: state.prefix,
    include_year: state.includeYear,
    digits: state.digits,
    reset_yearly: state.resetYearly,
    current_seq: state.currentSeq,
    current_year: state.currentYear,
  }
}

/**
 * `PATCH /api/settings/document-numbering/:docType` — ล็อกแถวก่อนตรวจ ⇒ ไม่แข่งกับการออกเลขที่กำลังเกิด
 */
export async function updateDocumentNumbering(
  context: SettingsMutationContext,
  docType: DocumentNumberType,
  input: DocumentNumberingUpdate,
  now: Date = new Date(),
): Promise<DocumentNumberingDto> {
  const organizationId = context.actor.organizationId
  const counts = await issuedTaxDocumentCount(organizationId)
  const issuedCount = issuedCountOf(docType, counts)
  const nowYear = documentYear(now)

  const updated = await prisma.$transaction(async (tx) => {
    const before = await lockDocumentSeries(tx, organizationId, docType)
    const format: DocumentNumberFormat = {
      prefix: input.prefix,
      includeYear: input.includeYear,
      digits: input.digits,
      resetYearly: input.resetYearly,
    }

    if (isTaxDocumentType(docType)) {
      if (input.nextSequence !== undefined) {
        throw new SettingsError('NUMBERING_SEQ_NOT_EDITABLE', { detail: `${docType} ตั้งเลขถัดไปเองไม่ได้` })
      }
      if (isFormatLocked(docType, before, issuedCount) && !sameDocumentNumberFormat(before, format)) {
        throw new SettingsError('NUMBERING_FORMAT_LOCKED', {
          detail: `${docType} ออกไปแล้ว ${issuedCount ?? 0} ฉบับ (ตัวนับ ${before.currentSeq})`,
        })
      }
    }

    let currentSeq = before.currentSeq
    let currentYear = before.currentYear
    if (input.nextSequence !== undefined) {
      // ฐานต่ำสุด = เลขที่ใช้แล้วของปีนี้ตามตัวนับ และเลขสูงสุดที่มีจริงในรูปแบบใหม่ (กันชนเลขชุดเก่า)
      const used = Math.max(
        effectiveLastSequence({ ...before, resetYearly: format.resetYearly }, nowYear),
        await maxIssuedSequence(tx, organizationId, docType, documentNumberHead(format, nowYear)),
      )
      if (input.nextSequence <= used) {
        throw new SettingsError('NUMBERING_SEQ_BELOW_ISSUED', {
          detail: `${docType} next=${input.nextSequence} used=${used}`,
          context: { minNextSequence: used + 1 },
        })
      }
      currentSeq = input.nextSequence - 1
      currentYear = format.resetYearly ? nowYear : (before.currentYear ?? nowYear)
    }

    const after: DocumentNumberState = { ...format, currentSeq, currentYear }
    await tx.documentNumberSeries.update({
      where: { id: before.id },
      data: {
        prefix: format.prefix,
        includeYear: format.includeYear,
        digits: format.digits,
        resetYearly: format.resetYearly,
        currentSeq,
        currentYear,
        updatedBy: context.actor.id,
      },
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: before.id,
        before: { doc_type: docType, ...toAuditPayload(before) },
        after: { doc_type: docType, ...toAuditPayload(after) },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    const rows = await loadSeriesRows(tx, organizationId)
    const row = rows.find((candidate) => candidate.id === before.id)
    if (row === undefined) throw new Error(`updateDocumentNumbering: ไม่พบชุดเลข ${before.id}`)
    return row
  })

  return toDto(updated, issuedCount, now)
}

/** ยาม: body ที่พยายามแก้ตัวนับเอง ต้องได้ `NUMBERING_SEQ_NOT_EDITABLE` ไม่ใช่เงียบ ๆ ทิ้ง */
export function assertNumberingSequenceUntouched(touched: boolean): void {
  if (!touched) return
  throw new SettingsError('NUMBERING_SEQ_NOT_EDITABLE', { detail: 'body มีฟิลด์ตัวเดินเลข' })
}
