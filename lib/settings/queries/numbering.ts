import { emitAudit } from '@/lib/audit/audit'
import { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { SettingsError } from '@/lib/settings/errors'
import {
  documentYear,
  formatInvoiceNumber,
  numberingChangeWarning,
  previewNextNumber,
  type NumberingFormat,
  type NumberingState,
} from '@/lib/settings/numbering'
import type { SettingsMutationContext, SettingsTxClient } from '@/lib/settings/queries/shared'
import type { NumberingDto } from '@/lib/settings/types'

/**
 * รูปแบบเลขที่ใบกำกับภาษี (`13` §6.12) — ชั้น DB · ฟิลด์ทั้งชุดอยู่บน `organizations` (DEC-006/D1)
 *
 * **เลขต้องไม่ซ้ำและไม่ข้าม (gap) ภายใต้ concurrency** เพราะกฎหมายบังคับความต่อเนื่อง
 * (`INVOICE_NUMBER_GAP` — `24` §6.8) ⇒ `reserveNextInvoiceNumber()` เดินเลขด้วย **UPDATE ... RETURNING
 * ครั้งเดียว** ซึ่งล็อกแถว `organizations` ให้เอง ห้ามอ่านค่ามาบวกในโค้ดแล้วเขียนกลับเด็ดขาด
 *
 * `tax_invoice_seq`/`tax_invoice_last_reset_year` **ห้ามแก้มือ** (`NUMBERING_SEQ_NOT_EDITABLE`)
 */

const TARGET = 'organizations'

const numberingSelect = {
  taxInvoiceNumberingMode: true,
  taxInvoicePrefix: true,
  taxInvoiceDigitLength: true,
  taxInvoiceSeq: true,
  taxInvoiceLastResetYear: true,
} as const

type NumberingRow = Prisma.OrganizationGetPayload<{ select: typeof numberingSelect }>

function toState(row: NumberingRow): NumberingState {
  return {
    mode: row.taxInvoiceNumberingMode,
    prefix: row.taxInvoicePrefix,
    digitLength: row.taxInvoiceDigitLength,
    lastNumber: row.taxInvoiceSeq,
    lastResetYear: row.taxInvoiceLastResetYear,
  }
}

function toDto(row: NumberingRow, issuedInvoiceCount: number, now: Date): NumberingDto {
  const state = toState(row)
  return {
    mode: state.mode,
    prefix: state.prefix,
    digitLength: state.digitLength,
    lastNumber: state.lastNumber,
    lastResetYear: state.lastResetYear,
    nextNumberPreview: previewNextNumber(state, now),
    issuedInvoiceCount,
  }
}

function toAuditPayload(format: NumberingFormat): Record<string, unknown> {
  return {
    tax_invoice_numbering_mode: format.mode,
    tax_invoice_prefix: format.prefix,
    tax_invoice_digit_length: format.digitLength,
  }
}

async function loadRow(organizationId: string): Promise<NumberingRow> {
  const row = await prisma.organization.findUnique({ where: { id: organizationId }, select: numberingSelect })
  // องค์กรของ session ต้องมีอยู่จริงเสมอ — ถ้าไม่มีคือข้อมูลเสีย ไม่ใช่ input ผิด
  if (!row) throw new Error(`getInvoiceNumbering: ไม่พบองค์กร ${organizationId}`)
  return row
}

export async function getInvoiceNumbering(organizationId: string, now: Date = new Date()): Promise<NumberingDto> {
  const [row, issuedInvoiceCount] = await Promise.all([
    loadRow(organizationId),
    prisma.taxInvoice.count({ where: { organizationId } }),
  ])
  return toDto(row, issuedInvoiceCount, now)
}

export interface NumberingUpdateResult {
  numbering: NumberingDto
  /** "เปลี่ยนรูปแบบหลังออกเอกสารไปแล้ว" = เตือน ไม่ block (`13` §6.12) */
  warning: string | null
}

export async function updateInvoiceNumbering(
  context: SettingsMutationContext,
  format: NumberingFormat,
  now: Date = new Date(),
): Promise<NumberingUpdateResult> {
  const organizationId = context.actor.organizationId
  const [current, issuedInvoiceCount] = await Promise.all([
    loadRow(organizationId),
    prisma.taxInvoice.count({ where: { organizationId } }),
  ])
  const before = toState(current)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.organization.update({
      where: { id: organizationId },
      // ไม่แตะ `taxInvoiceSeq`/`taxInvoiceLastResetYear` — ตัวเดินเลขเป็นของระบบเท่านั้น
      data: {
        taxInvoiceNumberingMode: format.mode,
        taxInvoicePrefix: format.prefix,
        taxInvoiceDigitLength: format.digitLength,
      },
      select: numberingSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: organizationId,
        before: toAuditPayload(before),
        after: toAuditPayload(format),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return {
    numbering: toDto(updated, issuedInvoiceCount, now),
    warning: numberingChangeWarning(before, format, issuedInvoiceCount),
  }
}

/** ยาม: ถ้า body พยายามส่งตัวเดินเลขมาเอง ต้องตอบ `NUMBERING_SEQ_NOT_EDITABLE` ไม่ใช่เงียบ ๆ ทิ้ง */
export function assertNumberingSequenceUntouched(touched: boolean): void {
  if (!touched) return
  throw new SettingsError('NUMBERING_SEQ_NOT_EDITABLE', { detail: 'body มีฟิลด์ตัวเดินเลข' })
}

interface ReserveRow {
  tax_invoice_seq: number
  tax_invoice_numbering_mode: 'continuous' | 'yearly_reset'
  tax_invoice_prefix: string
  tax_invoice_digit_length: number
  tax_invoice_last_reset_year: number | null
}

/**
 * **เดินเลขใบกำกับภาษีถัดไปแบบ atomic** (`31` §6.2 · Phase 4.3 เป็นผู้เรียกจริง)
 *
 * ทำใน UPDATE เดียว: PostgreSQL ล็อกแถว `organizations` ตลอด statement ⇒ คำขอที่เข้ามาพร้อมกัน
 * ต่อคิวกันเอง ได้เลขไม่ซ้ำและไม่ข้าม · โหมด `yearly_reset` รีเซ็ตเป็น 1 เมื่อปี **พ.ศ.** เปลี่ยน
 *
 * ⚠️ ต้องเรียกภายใน `$transaction` เดียวกับการสร้าง `tax_invoices` เสมอ (ส่ง `tx` เข้ามา) —
 * ไม่งั้น rollback ของใบกำกับจะทิ้งเลขที่จองไว้เป็น gap
 */
export async function reserveNextInvoiceNumber(
  organizationId: string,
  issuedAt: Date,
  client: SettingsTxClient = prisma,
): Promise<{ sequence: number; number: string; year: number }> {
  const year = documentYear(issuedAt)

  const rows = await client.$queryRaw<ReserveRow[]>`
    UPDATE organizations
       SET tax_invoice_seq = CASE
             WHEN tax_invoice_numbering_mode = 'yearly_reset'::invoice_numbering_mode
              AND COALESCE(tax_invoice_last_reset_year, -1) <> ${year}
             THEN 1
             ELSE tax_invoice_seq + 1
           END,
           tax_invoice_last_reset_year = CASE
             WHEN tax_invoice_numbering_mode = 'yearly_reset'::invoice_numbering_mode THEN ${year}
             ELSE tax_invoice_last_reset_year
           END,
           updated_at = NOW()
     WHERE id = ${organizationId}::uuid
    RETURNING tax_invoice_seq,
              tax_invoice_numbering_mode,
              tax_invoice_prefix,
              tax_invoice_digit_length,
              tax_invoice_last_reset_year
  `

  const row = rows[0]
  if (!row) throw new Error(`reserveNextInvoiceNumber: ไม่พบองค์กร ${organizationId}`)

  return {
    sequence: row.tax_invoice_seq,
    number: formatInvoiceNumber(
      {
        mode: row.tax_invoice_numbering_mode,
        prefix: row.tax_invoice_prefix,
        digitLength: row.tax_invoice_digit_length,
      },
      row.tax_invoice_seq,
      issuedAt,
    ),
    year,
  }
}
