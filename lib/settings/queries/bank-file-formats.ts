import { emitAudit } from '@/lib/audit/audit'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import {
  bankFileFormatLabel,
  bankNameOfCode,
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
  purpose: true,
  bankCode: true,
  bankName: true,
  fileType: true,
  encoding: true,
  columnMapping: true,
  includeHeader: true,
  testStatus: true,
  deletedAt: true,
  updatedAt: true,
} as const

type FormatRow = Prisma.BankFileFormatGetPayload<{ select: typeof formatSelect }>

function toDto(row: FormatRow): BankFileFormatDto {
  const columns = parseColumnMapping(row.columnMapping)
  return {
    id: row.id,
    purpose: row.purpose,
    bankCode: row.bankCode,
    bankName: row.bankName,
    label: bankFileFormatLabel({ ...row, columns }),
    fileType: row.fileType,
    encoding: row.encoding,
    columnMapping: row.columnMapping,
    includeHeader: row.includeHeader,
    columns,
    testStatus: row.testStatus,
    usable: row.testStatus === 'passed' && row.deletedAt === null,
    isActive: row.deletedAt === null,
    updatedAt: toIso(row.updatedAt),
  }
}

function toValues(dto: BankFileFormatDto): BankFileFormatValues {
  return {
    purpose: dto.purpose,
    bankCode: dto.bankCode,
    fileType: dto.fileType,
    encoding: dto.encoding,
    columnMapping: dto.columnMapping,
    includeHeader: dto.includeHeader,
  }
}

function toAuditPayload(values: BankFileFormatValues, testStatus: string): Record<string, unknown> {
  return {
    purpose: values.purpose,
    bank_code: values.bankCode,
    bank_name: bankNameOfCode(values.bankCode),
    file_type: values.fileType,
    encoding: values.encoding,
    column_mapping: values.columnMapping.trim(),
    include_header: values.purpose === 'payment' && values.includeHeader === true,
    test_status: testStatus,
  }
}

/** ชื่อธนาคารมาตรฐานของรหัส — Zod ตรวจแล้ว ตัวนี้เป็นยามของ service (ค่าไม่ผ่านฟอร์ม) */
function requireBankName(bankCode: string | null): string {
  const name = bankNameOfCode(bankCode)
  if (name === null) throw new RangeError(`bank_code ไม่อยู่ในรายการธนาคารมาตรฐาน: ${bankCode ?? ''}`)
  return name
}

/** บัญชีธนาคารที่ยังใช้งานซึ่งอ้างรูปแบบนี้ (มติ PO U147 — ลบรูปแบบที่บัญชีอ้างอยู่ไม่ได้) */
export async function countBankFileFormatUsage(organizationId: string, formatId: string): Promise<number> {
  return prisma.bankAccount.count({
    where: {
      organizationId,
      deletedAt: null,
      OR: [{ statementFormatId: formatId }, { paymentFileFormatId: formatId }],
    },
  })
}

export async function listBankFileFormats(
  organizationId: string,
  status: 'active' | 'inactive' | 'all' = 'active',
): Promise<BankFileFormatDto[]> {
  const rows = await prisma.bankFileFormat.findMany({
    where: { organizationId, ...statusFilter(status) },
    select: formatSelect,
    orderBy: [{ purpose: 'asc' }, { bankName: 'asc' }, { fileType: 'asc' }],
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
        purpose: values.purpose,
        bankCode: values.bankCode,
        bankName: requireBankName(values.bankCode),
        fileType: values.fileType,
        encoding: values.encoding,
        columnMapping: values.columnMapping.trim(),
        includeHeader: values.purpose === 'payment' && values.includeHeader === true,
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
        purpose: values.purpose,
        bankCode: values.bankCode,
        bankName: requireBankName(values.bankCode),
        fileType: values.fileType,
        encoding: values.encoding,
        columnMapping: values.columnMapping.trim(),
        includeHeader: values.purpose === 'payment' && values.includeHeader === true,
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
  const accounts = await countBankFileFormatUsage(organizationId, current.id)
  if (accounts > 0) {
    throw new SettingsError('BANK_FILE_FORMAT_IN_USE', {
      detail: `bank_file_format=${current.id} bank_accounts=${accounts}`,
      context: { bankAccounts: accounts },
    })
  }

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
