import { emitAudit } from '@/lib/audit/audit'
import { normalizeCaseRef } from '@/lib/cases/case-ref'
import { CaseError } from '@/lib/cases/errors'
import { findDuplicateRefsInFile, parseCsv, planImport, unmappedHeaders } from '@/lib/cases/import'
import { createCase, type CaseMutationContext } from '@/lib/cases/queries'
import type { CaseImportInput } from '@/lib/cases/schemas'
import type { CaseImportResultDto, CaseImportRowResultDto } from '@/lib/cases/types'
import { ModuleError } from '@/lib/api/errors'
import { loadCatalogMatcher } from '@/lib/device-catalog/queries'
import { tacImportDecision, tacOfImei } from '@/lib/device-catalog/tac'
import { loadTacLabels } from '@/lib/device-catalog/tac-queries'
import { prisma } from '@/lib/prisma'
import { splitAssetIdentifier } from '@/lib/cases/case'
import { assetIdentifierWarning } from '@/lib/warehouse/imei'
import { ACTIVE_ASSET_IMEI_WARNING_MESSAGE, findImeisWithActiveAsset } from '@/lib/warehouse/imei-duplicate'

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

/**
 * เตือนต่อช่องของแถว (ไม่ทำให้แถวตก) — Serial ที่ดูเหมือน IMEI พิมพ์ผิด (มติ PO U54)
 * · IMEI ตรงกับเครื่องที่ยังไม่ส่งมอบ (มติ PO U129 — `activeImeis` อ่านจาก DB ครั้งเดียวต่อไฟล์)
 */
function rowWarnings(
  assetImeiSerial: string | null | undefined,
  activeImeis: ReadonlySet<string> = new Set(),
  deviceWarning: string | null = null,
): Record<string, string> | null {
  const imei = splitAssetIdentifier(assetImeiSerial).imei
  const warning =
    imei !== null && activeImeis.has(imei) ? ACTIVE_ASSET_IMEI_WARNING_MESSAGE : assetIdentifierWarning(assetImeiSerial)
  const warnings: Record<string, string> = {}
  if (warning !== null) warnings.assetImeiSerial = warning
  // มติ PO U166 — เติมยี่ห้อ/รุ่นจาก IMEI ให้ / ยี่ห้อในไฟล์ไม่ตรงกับ IMEI
  if (deviceWarning !== null) warnings.assetBrandModel = deviceWarning
  return Object.keys(warnings).length === 0 ? null : warnings
}

/** เลขที่สัญญา (แบบ normalize) ของบริษัทนี้ที่มีเคสอยู่แล้ว — เฉพาะเลขที่อยู่ในไฟล์ */
async function findExistingCaseRefs(
  organizationId: string,
  companyId: string,
  rows: readonly { input: { caseRef: string } }[],
): Promise<Set<string>> {
  const normalized = [...new Set(rows.map((row) => normalizeCaseRef(row.input.caseRef)))]
  if (normalized.length === 0) return new Set()
  const existing = await prisma.case.findMany({
    where: { organizationId, companyId, caseRefNormalized: { in: normalized } },
    select: { caseRefNormalized: true },
  })
  return new Set(existing.map((row) => row.caseRefNormalized))
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
  const activeImeis = await findImeisWithActiveAsset(
    organizationId,
    plan.rows.flatMap((row) => {
      const imei = splitAssetIdentifier(row.input.assetImeiSerial).imei
      return imei === null ? [] : [imei]
    }),
  )

  // มติ PO U155 — จับคู่ข้อความ "ยี่ห้อ/รุ่น" กับแคตตาล็อก (ไม่สนตัวพิมพ์/ช่องว่าง) · ไม่เจอ = เก็บข้อความเดิม
  const matchDevice = plan.rows.some((row) => (row.input.assetBrandModel ?? '') !== '')
    ? await loadCatalogMatcher(organizationId)
    : null

  // มติ PO U166 — ยี่ห้อ/รุ่นจากฐาน TAC ของ IMEI ในไฟล์ (โหลดครั้งเดียว) · ว่าง = เติมให้ · ไม่ตรง = เตือน
  const tacLabels = await loadTacLabels(
    organizationId,
    plan.rows.flatMap((row) => {
      const imei = splitAssetIdentifier(row.input.assetImeiSerial).imei
      return imei === null ? [] : [imei]
    }),
  )
  const deviceOf = (row: (typeof plan.rows)[number]) => {
    const tac = tacOfImei(splitAssetIdentifier(row.input.assetImeiSerial).imei)
    const found = tac === null ? undefined : tacLabels.get(tac)
    const decision = tacImportDecision(row.input.assetBrandModel, found ?? null)
    const input =
      decision.fill && found !== undefined
        ? { ...row.input, assetBrandModel: found.label, deviceModelId: found.deviceModelId }
        : row.input
    return { input, warning: decision.warning }
  }

  // preview ต้องตรวจเลขที่สัญญาที่มีในฐานแล้วด้วย (preship R2-001 — เดิมตรวจแค่ซ้ำในไฟล์ ⇒ preview บอกผ่าน
  // แต่ยืนยันแล้วแถวตก) · ค้นทีเดียวทั้งไฟล์ · ไม่กรอง `deleted_at` เหมือน `assertCaseRefAvailable()` (เคสที่ลบยังจองเลข)
  const existingRefs = input.dryRun ? await findExistingCaseRefs(organizationId, input.financeCompanyId, plan.rows) : new Set<string>()

  const results: CaseImportRowResultDto[] = plan.errors.map((error) => ({
    rowNumber: error.rowNumber,
    caseRef: error.caseRef,
    status: 'failed',
    caseId: null,
    errorCode: error.code,
    errorMessage: 'ข้อมูลในแถวนี้ไม่ผ่านการตรวจสอบ',
    fields: error.fields,
    warnings: null,
  }))

  for (const row of plan.rows) {
    const device = deviceOf(row)
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
        warnings: rowWarnings(row.input.assetImeiSerial, activeImeis, device.warning),
      })
      continue
    }

    if (input.dryRun && existingRefs.has(normalizeCaseRef(row.input.caseRef))) {
      const duplicate = new CaseError('CASE_REF_DUPLICATE', { context: { caseRef: row.input.caseRef } })
      results.push({
        rowNumber: row.rowNumber,
        caseRef: row.input.caseRef,
        status: 'failed',
        caseId: null,
        errorCode: duplicate.code,
        errorMessage: duplicate.userMessage,
        fields: null,
        warnings: rowWarnings(row.input.assetImeiSerial, activeImeis, device.warning),
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
        warnings: rowWarnings(row.input.assetImeiSerial, activeImeis, device.warning),
      })
      continue
    }

    try {
      const matched =
        device.input.deviceModelId != null || matchDevice === null || device.input.assetBrandModel == null
          ? null
          : matchDevice(device.input.assetBrandModel, device.input.assetType ?? null)
      const created = await createCase(
        matched === null ? device.input : { ...device.input, deviceModelId: matched.modelId },
        context,
      )
      results.push({
        rowNumber: row.rowNumber,
        caseRef: created.caseRef,
        status: 'created',
        caseId: created.id,
        errorCode: null,
        errorMessage: null,
        fields: null,
        warnings: rowWarnings(row.input.assetImeiSerial, activeImeis, device.warning),
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
        warnings: rowWarnings(row.input.assetImeiSerial, activeImeis, device.warning),
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
