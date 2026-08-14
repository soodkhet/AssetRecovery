import { emitAudit } from '@/lib/audit/audit'
import { normalizeCaseRef } from '@/lib/cases/case-ref'
import { CaseError } from '@/lib/cases/errors'
import { findDuplicateRefsInFile, parseCsv, planImport, unmappedHeaders } from '@/lib/cases/import'
import { createCase, type CaseMutationContext } from '@/lib/cases/queries'
import type { CaseImportInput } from '@/lib/cases/schemas'
import type { CaseImportResultDto, CaseImportRowResultDto } from '@/lib/cases/types'
import { ModuleError } from '@/lib/api/errors'
import { prisma } from '@/lib/prisma'

/**
 * `POST /api/cases/import` (ไฟล์ 38 §8 `import_cases` · §17.1) — ชั้น DB
 *
 * กติกา:
 * - **แถวผิด reject เฉพาะแถวนั้น ไม่ reject ทั้งไฟล์** (`38` §12) ⇒ ห้ามครอบทั้ง batch ด้วย `$transaction` เดียว
 *   แต่ละแถวเป็น `createCase()` ของตัวเอง (มี transaction + audit ของตัวเองอยู่แล้ว)
 * - เคสที่นำเข้าสำเร็จเป็น `draft` เสมอ (`38` §9) แม้ข้อมูลไม่ครบ — เว้น `case_ref` ซ้ำที่ต้อง reject (`38` §11)
 * - `dryRun` = ตรวจอย่างเดียวสำหรับหน้า preview ก่อนยืนยันนำเข้า (`38` §7.1)
 */

function headersOf(rows: readonly Record<string, unknown>[]): string[] {
  const headers = new Set<string>()
  for (const row of rows) for (const key of Object.keys(row)) headers.add(key)
  return [...headers]
}

export async function importCases(
  input: CaseImportInput,
  context: CaseMutationContext,
): Promise<CaseImportResultDto> {
  const organizationId = context.actor.organizationId
  const rawRows: Array<Record<string, unknown>> =
    input.rows ?? (input.csv === undefined ? [] : parseCsv(input.csv))

  const plan = planImport(rawRows, input.financeCompanyId)
  const duplicateRowNumbers = findDuplicateRefsInFile(plan.rows, normalizeCaseRef)

  const results: CaseImportRowResultDto[] = plan.errors.map((error) => ({
    rowNumber: error.rowNumber,
    caseRef: null,
    status: 'failed',
    caseId: null,
    errorCode: error.code,
    errorMessage: 'ข้อมูลในแถวนี้ไม่ผ่านการตรวจสอบ',
    fields: error.fields,
  }))

  for (const row of plan.rows) {
    if (duplicateRowNumbers.has(row.rowNumber)) {
      const duplicate = new CaseError('CASE_REF_DUPLICATE', { context: { caseRef: row.input.caseRef } })
      results.push({
        rowNumber: row.rowNumber,
        caseRef: row.input.caseRef,
        status: 'failed',
        caseId: null,
        errorCode: duplicate.code,
        errorMessage: 'เลขที่สัญญาซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน',
        fields: null,
      })
      continue
    }

    if (input.dryRun) {
      results.push({
        rowNumber: row.rowNumber,
        caseRef: row.input.caseRef,
        status: 'created',
        caseId: null,
        errorCode: null,
        errorMessage: null,
        fields: null,
      })
      continue
    }

    try {
      const created = await createCase(row.input, context)
      results.push({
        rowNumber: row.rowNumber,
        caseRef: created.caseRef,
        status: 'created',
        caseId: created.id,
        errorCode: null,
        errorMessage: null,
        fields: null,
      })
    } catch (error) {
      // error ของโมดูล (ref ซ้ำ/บริษัทถูกระงับ/เลขบัตรผิด) = แถวนั้นตก · error อื่นถือเป็นความผิดพลาดจริง
      if (!(error instanceof ModuleError)) throw error
      results.push({
        rowNumber: row.rowNumber,
        caseRef: row.input.caseRef,
        status: 'failed',
        caseId: null,
        errorCode: error.code,
        errorMessage: error.userMessage,
        fields: null,
      })
    }
  }

  results.sort((left, right) => left.rowNumber - right.rowNumber)
  const createdCount = results.filter((row) => row.status === 'created').length
  const failedCount = results.length - createdCount

  // audit ระดับ batch (`38` §14) — audit ของเคสรายตัวถูกบันทึกโดย `createCase()` แล้ว
  if (!input.dryRun) {
    await emitAudit({
      organizationId,
      actorId: context.actor.id,
      actorRole: context.actor.roleName,
      action: 'import',
      targetType: 'cases',
      targetId: null,
      after: {
        financeCompanyId: input.financeCompanyId,
        totalRows: results.length,
        createdCount,
        failedCount,
        failedRows: results.filter((row) => row.status === 'failed').map((row) => row.rowNumber),
      },
      reason: context.reason,
      ipAddress: context.meta.ipAddress,
      userAgent: context.meta.userAgent,
    })
  }

  return {
    dryRun: input.dryRun,
    totalRows: results.length,
    createdCount,
    failedCount,
    unmappedHeaders: unmappedHeaders(headersOf(rawRows)),
    rows: results,
  }
}

/** ตรวจว่าบริษัทไฟแนนซ์ที่เลือกใช้ได้ก่อนเริ่มไล่ทีละแถว (ไม่งั้นทุกแถวจะตกด้วย error เดียวกัน) */
export async function assertImportCompany(organizationId: string, companyId: string): Promise<void> {
  const company = await prisma.financeCompany.findFirst({
    where: { id: companyId, organizationId, deletedAt: null },
    select: { status: true },
  })
  if (company === null) throw new CaseError('COMPANY_NOT_FOUND')
  if (company.status !== 'active') throw new CaseError('SUSPENDED_COMPANY_NEW_CASE')
}
