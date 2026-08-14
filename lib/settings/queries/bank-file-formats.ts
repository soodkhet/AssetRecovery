import { emitAudit } from '@/lib/audit/audit'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  parseColumnMapping,
  runBankFileTest,
  testStatusAfterEdit,
  type BankFileFormatValues,
  type BankFileTestResult,
} from '@/lib/settings/bank-file'
import { SettingsError } from '@/lib/settings/errors'
import { statusFilter, toIso, type SettingsMutationContext } from '@/lib/settings/queries/shared'
import type { BankFileFormatDto } from '@/lib/settings/types'

/**
 * รูปแบบไฟล์ธนาคาร (`13` §6.8) — ชั้น DB
 *
 * State machine เดียวของไฟล์ 13 (`13` §8): `pending → passed|failed → (แก้ mapping) → pending`
 * — เปลี่ยน `test_status` ได้ทางเดียวคือ `POST /:id/test` (Rule 04: transition = endpoint แยก)
 * ส่วน gate ตอนสร้างไฟล์โอนจริงอยู่ที่ `assertBankFileUsable()` (Phase 3.4 เรียก)
 */

const TARGET = 'bank_file_formats'

const formatSelect = {
  id: true,
  bankName: true,
  fileType: true,
  encoding: true,
  columnMapping: true,
  testStatus: true,
  deletedAt: true,
  updatedAt: true,
} as const

type FormatRow = Prisma.BankFileFormatGetPayload<{ select: typeof formatSelect }>

function toDto(row: FormatRow): BankFileFormatDto {
  return {
    id: row.id,
    bankName: row.bankName,
    fileType: row.fileType,
    encoding: row.encoding,
    columnMapping: row.columnMapping,
    columns: parseColumnMapping(row.columnMapping),
    testStatus: row.testStatus,
    usable: row.testStatus === 'passed' && row.deletedAt === null,
    isActive: row.deletedAt === null,
    updatedAt: toIso(row.updatedAt),
  }
}

function toValues(dto: BankFileFormatDto): BankFileFormatValues {
  return {
    bankName: dto.bankName,
    fileType: dto.fileType,
    encoding: dto.encoding,
    columnMapping: dto.columnMapping,
  }
}

function toAuditPayload(values: BankFileFormatValues, testStatus: string): Record<string, unknown> {
  return {
    bank_name: values.bankName.trim(),
    file_type: values.fileType,
    encoding: values.encoding,
    column_mapping: values.columnMapping.trim(),
    test_status: testStatus,
  }
}

export async function listBankFileFormats(
  organizationId: string,
  status: 'active' | 'inactive' | 'all' = 'active',
): Promise<BankFileFormatDto[]> {
  const rows = await prisma.bankFileFormat.findMany({
    where: { organizationId, ...statusFilter(status) },
    select: formatSelect,
    orderBy: [{ bankName: 'asc' }, { fileType: 'asc' }],
  })
  return rows.map(toDto)
}

export async function getBankFileFormat(organizationId: string, formatId: string): Promise<BankFileFormatDto> {
  const row = await prisma.bankFileFormat.findFirst({ where: { id: formatId, organizationId }, select: formatSelect })
  if (!row) throw new SettingsError('BANK_FILE_FORMAT_NOT_FOUND', { detail: `bank_file_format=${formatId}` })
  return toDto(row)
}

export async function createBankFileFormat(
  context: SettingsMutationContext,
  values: BankFileFormatValues,
): Promise<BankFileFormatDto> {
  const organizationId = context.actor.organizationId

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.bankFileFormat.create({
      data: {
        organizationId,
        bankName: values.bankName.trim(),
        fileType: values.fileType,
        encoding: values.encoding,
        columnMapping: values.columnMapping.trim(),
        // รูปแบบใหม่เริ่มที่ `pending` เสมอ — ใช้ตัดโอนจริงไม่ได้จนกว่าจะทดสอบผ่าน (`13` §6.8)
        testStatus: 'pending',
        createdBy: context.actor.id,
      },
      select: formatSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'create',
        targetType: TARGET,
        targetId: row.id,
        after: toAuditPayload(values, 'pending'),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(created)
}

/** แก้ mapping/ชนิดไฟล์/encoding = ผลทดสอบเดิมใช้ไม่ได้ → กลับไป `pending` อัตโนมัติ (`13` §8) */
export async function updateBankFileFormat(
  context: SettingsMutationContext,
  current: BankFileFormatDto,
  values: BankFileFormatValues,
): Promise<BankFileFormatDto> {
  const organizationId = context.actor.organizationId
  const nextStatus = testStatusAfterEdit(toValues(current), values, current.testStatus)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.bankFileFormat.update({
      where: { id: current.id },
      data: {
        bankName: values.bankName.trim(),
        fileType: values.fileType,
        encoding: values.encoding,
        columnMapping: values.columnMapping.trim(),
        testStatus: nextStatus,
        updatedBy: context.actor.id,
      },
      select: formatSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'update',
        targetType: TARGET,
        targetId: row.id,
        before: toAuditPayload(toValues(current), current.testStatus),
        after: toAuditPayload(values, nextStatus),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
      },
      tx,
    )

    return row
  })

  return toDto(updated)
}

export async function deleteBankFileFormat(
  context: SettingsMutationContext,
  current: BankFileFormatDto,
): Promise<BankFileFormatDto> {
  const organizationId = context.actor.organizationId

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.bankFileFormat.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), updatedBy: context.actor.id },
      select: formatSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'delete',
        targetType: TARGET,
        targetId: row.id,
        before: toAuditPayload(toValues(current), current.testStatus),
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return toDto(updated)
}

/**
 * `POST /api/settings/bank-file-formats/:id/test` (`13` §13) — ทดสอบไฟล์ตัวอย่างแล้วบันทึกผล
 * ผลลัพธ์ deterministic (`runBankFileTest`) ⇒ กดซ้ำได้ผลเดิม ไม่ต้องกัน idempotency แยก
 */
export async function testBankFileFormat(
  context: SettingsMutationContext,
  current: BankFileFormatDto,
): Promise<{ format: BankFileFormatDto; result: BankFileTestResult }> {
  const organizationId = context.actor.organizationId
  const result = runBankFileTest(toValues(current))

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.bankFileFormat.update({
      where: { id: current.id },
      data: { testStatus: result.status, updatedBy: context.actor.id },
      select: formatSelect,
    })

    await emitAudit(
      {
        organizationId,
        actorId: context.actor.id,
        actorRole: context.actor.roleName,
        action: 'status_change',
        targetType: TARGET,
        targetId: row.id,
        before: { test_status: current.testStatus },
        after: { test_status: result.status, issues: result.issues },
        reason: context.reason,
        ipAddress: context.meta.ipAddress,
        userAgent: context.meta.userAgent,
        diffOnly: false,
      },
      tx,
    )

    return row
  })

  return { format: toDto(updated), result }
}
