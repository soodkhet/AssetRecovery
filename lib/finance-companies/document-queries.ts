import { onUniqueViolation } from '@/lib/api/unique-violation'
import { emitAudit } from '@/lib/audit/audit'
import { AuthError } from '@/lib/auth/errors'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { SessionUser } from '@/lib/auth/types'
import {
  companyDocumentWarnings,
  currentCompanyDocuments,
  isSingletonDocumentType,
  normalizeCompanyDocumentFields,
  type CompanyDocumentCreateInput,
  type CompanyDocumentWarning,
} from '@/lib/finance-companies/documents'
import { FinanceCompanyError } from '@/lib/finance-companies/errors'
import type { CompanyDocumentDto, CompanyDocumentsDto } from '@/lib/finance-companies/types'
import { dateOnlyKey, toInputDate } from '@/lib/format/datetime'
import { prisma } from '@/lib/prisma'
import { companyDocumentRule } from '@/lib/uploads/rules'
import { verifyUploadedFile } from '@/lib/uploads/verify'

/**
 * ชั้นข้อมูลของเอกสารบริษัทไฟแนนซ์ (มติ PO U132 · `10` §7.4)
 *
 * - **สิทธิ์**: ดู = `view_master_data` (ตามหน้าบริษัทเดิม) · แนบ = `manage_companies` (Superadmin "✅ only")
 *   · ผู้ใช้ฝั่งบริษัท (scope company / พอร์ทัล) **ไม่เห็น** เอกสารนี้เลย (403 แบบเดียวทุก id — ไม่ leak)
 * - **insert-only**: แทนที่ = แถวใหม่ชี้เวอร์ชันก่อน (UNIQUE `replaces_document_id` + partial unique เวอร์ชันแรก
 *   ของชนิดเดี่ยว ⇒ สองคนแนบพร้อมกันได้สายเดียว อีกคน `COMPANY_DOCUMENT_VERSION_CONFLICT`)
 * - ไฟล์ตรวจฝั่ง server (prefix ของบริษัท/ชนิด + magic bytes + ขนาด + SHA-256) **นอก** transaction
 */

export const MANAGE_COMPANIES = 'manage_companies'
export const VIEW_COMPANY_DOCUMENTS = 'view_master_data'

const TARGET = 'finance_company_documents'

/**
 * ด่านของทุกทางที่แตะเอกสารบริษัท (หน้า/ API/ signed URL) — ผู้ใช้บริษัทถูกปฏิเสธก่อนแตะข้อมูล
 * · บริษัทไม่มีในองค์กร = `COMPANY_NOT_FOUND`
 */
export async function assertCompanyDocumentAccess(
  user: SessionUser,
  companyId: string,
): Promise<{ id: string; vatRegistered: boolean }> {
  if (user.scope.kind === 'company') {
    throw new AuthError('PERMISSION_DENIED', `company-documents company=${companyId} user=${user.id}`)
  }
  const company = await prisma.financeCompany.findFirst({
    where: { id: companyId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, vatRegistered: true },
  })
  if (company === null) throw new FinanceCompanyError('COMPANY_NOT_FOUND', { detail: `company=${companyId}` })
  return company
}

const documentSelect = {
  id: true,
  companyId: true,
  documentType: true,
  title: true,
  issuedDate: true,
  version: true,
  replacesDocumentId: true,
  filePath: true,
  fileSha256: true,
  mimeType: true,
  sizeBytes: true,
  originalName: true,
  createdAt: true,
  createdByUser: { select: { fullName: true } },
} as const

interface DocumentRow {
  id: string
  companyId: string
  documentType: CompanyDocumentDto['documentType']
  title: string | null
  issuedDate: Date | null
  version: number
  replacesDocumentId: string | null
  filePath: string
  fileSha256: string
  mimeType: string
  sizeBytes: number
  originalName: string
  createdAt: Date
  createdByUser: { fullName: string }
}

function toDto(row: DocumentRow, currentIds: ReadonlySet<string>): CompanyDocumentDto {
  return {
    id: row.id,
    documentType: row.documentType,
    title: row.title,
    issuedDate: row.issuedDate === null ? null : dateOnlyKey(row.issuedDate),
    version: row.version,
    replacesDocumentId: row.replacesDocumentId,
    filePath: row.filePath,
    fileSha256: row.fileSha256,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName,
    createdAt: row.createdAt.toISOString(),
    createdByName: row.createdByUser.fullName,
    isCurrent: currentIds.has(row.id),
  }
}

function toLike(row: DocumentRow) {
  return {
    id: row.id,
    documentType: row.documentType,
    replacesDocumentId: row.replacesDocumentId,
    issuedDate: row.issuedDate === null ? null : dateOnlyKey(row.issuedDate),
  }
}

/** วันนี้ตามเวลาไทย `YYYY-MM-DD` — ฐานของคำเตือนหนังสือรับรองเกิน 6 เดือน */
export function bangkokTodayKey(now: Date = new Date()): string {
  return toInputDate(now)
}

/** เอกสารทุกเวอร์ชันของบริษัท (ใหม่ก่อน) + คำเตือน */
export async function listCompanyDocuments(
  user: SessionUser,
  companyId: string,
  now: Date = new Date(),
): Promise<CompanyDocumentsDto> {
  const company = await assertCompanyDocumentAccess(user, companyId)
  const rows = await prisma.financeCompanyDocument.findMany({
    where: { organizationId: user.organizationId, companyId },
    select: documentSelect,
    orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }, { version: 'desc' }],
  })
  const current = currentCompanyDocuments(rows.map(toLike))
  const currentIds = new Set(current.map((row) => row.id))
  return {
    companyId,
    documents: rows.map((row) => toDto(row, currentIds)),
    warnings: companyDocumentWarnings({
      currentDocs: current,
      vatRegistered: company.vatRegistered,
      todayKey: bangkokTodayKey(now),
    }),
  }
}

/**
 * คำเตือนเอกสารของหลายบริษัทในคำสั่งเดียว (การ์ดบริษัท / modal สร้างรอบวางบิล) — query เดียวไม่วนต่อบริษัท
 */
export async function companyDocumentWarningsFor(
  organizationId: string,
  companies: ReadonlyArray<{ id: string; vatRegistered: boolean }>,
  now: Date = new Date(),
): Promise<Map<string, CompanyDocumentWarning[]>> {
  const result = new Map<string, CompanyDocumentWarning[]>()
  if (companies.length === 0) return result
  const rows = await prisma.financeCompanyDocument.findMany({
    where: { organizationId, companyId: { in: companies.map((company) => company.id) } },
    select: { id: true, companyId: true, documentType: true, replacesDocumentId: true, issuedDate: true },
  })
  const todayKey = bangkokTodayKey(now)
  for (const company of companies) {
    const own = rows
      .filter((row) => row.companyId === company.id)
      .map((row) => ({
        id: row.id,
        documentType: row.documentType,
        replacesDocumentId: row.replacesDocumentId,
        issuedDate: row.issuedDate === null ? null : dateOnlyKey(row.issuedDate),
      }))
    result.set(
      company.id,
      companyDocumentWarnings({ currentDocs: currentCompanyDocuments(own), vatRegistered: company.vatRegistered, todayKey }),
    )
  }
  return result
}

interface MutationContext {
  actor: SessionUser
  meta: RequestMeta
  reason: string
}

function versionConflict(detail: string): FinanceCompanyError {
  return new FinanceCompanyError('COMPANY_DOCUMENT_VERSION_CONFLICT', { detail })
}

/**
 * แนบเอกสารบริษัท (เวอร์ชันแรก หรือแทนที่เวอร์ชันปัจจุบัน) — ไม่ลบ/ไม่แก้แถวเดิมเลย
 * ชื่อเอกสาร "อื่น ๆ" ที่ไม่ได้กรอกตอนแทนที่ = ใช้ชื่อเวอร์ชันก่อน
 */
export async function createCompanyDocument(
  context: MutationContext,
  companyId: string,
  input: CompanyDocumentCreateInput,
): Promise<CompanyDocumentDto> {
  const user = context.actor
  const organizationId = user.organizationId
  await assertCompanyDocumentAccess(user, companyId)

  // ตรวจไฟล์จริงนอก transaction (I/O เครือข่าย) — prefix ต้องเป็นของบริษัท+ชนิดนี้
  const verified = await verifyUploadedFile(input.path, companyDocumentRule(companyId, input.documentType))

  const created = await prisma
    .$transaction(async (tx) => {
      let version = 1
      let inheritedTitle: string | null = null
      if (input.replacesDocumentId !== null) {
        const previous = await tx.financeCompanyDocument.findFirst({
          where: { id: input.replacesDocumentId, organizationId, companyId, documentType: input.documentType },
          select: { id: true, version: true, title: true },
        })
        if (previous === null) {
          throw new FinanceCompanyError('COMPANY_DOCUMENT_NOT_FOUND', { detail: `replaces=${input.replacesDocumentId}` })
        }
        const successor = await tx.financeCompanyDocument.findFirst({
          where: { replacesDocumentId: previous.id },
          select: { id: true },
        })
        if (successor !== null) throw versionConflict(`replaces=${previous.id} already replaced by ${successor.id}`)
        version = previous.version + 1
        inheritedTitle = previous.title
      } else if (isSingletonDocumentType(input.documentType)) {
        const existing = await tx.financeCompanyDocument.findFirst({
          where: { organizationId, companyId, documentType: input.documentType },
          select: { id: true },
        })
        if (existing !== null) throw versionConflict(`company=${companyId} type=${input.documentType} exists`)
      }

      const fields = normalizeCompanyDocumentFields({
        documentType: input.documentType,
        title: input.title ?? inheritedTitle,
        issuedDate: input.issuedDate,
      })
      const row = await tx.financeCompanyDocument.create({
        data: {
          organizationId,
          companyId,
          documentType: input.documentType,
          title: fields.title,
          issuedDate: fields.issuedDate,
          version,
          replacesDocumentId: input.replacesDocumentId,
          filePath: input.path,
          fileSha256: verified.sha256,
          mimeType: verified.mimeType,
          sizeBytes: verified.sizeBytes,
          originalName: input.originalName,
          createdBy: user.id,
        },
        select: documentSelect,
      })

      await emitAudit(
        {
          organizationId,
          actorId: user.id,
          actorRole: user.roleName,
          action: 'create',
          targetType: TARGET,
          targetId: row.id,
          after: {
            company_id: companyId,
            document_type: row.documentType,
            title: row.title,
            issued_date: row.issuedDate === null ? null : dateOnlyKey(row.issuedDate),
            version: row.version,
            replaces_document_id: row.replacesDocumentId,
            file_path: row.filePath,
            file_sha256: row.fileSha256,
            mime_type: row.mimeType,
            size_bytes: row.sizeBytes,
            original_name: row.originalName,
          },
          reason: context.reason,
          ipAddress: context.meta.ipAddress,
          userAgent: context.meta.userAgent,
        },
        tx,
      )
      return row
    })
    .catch(
      onUniqueViolation(() => {
        throw versionConflict(`company=${companyId} type=${input.documentType} (unique violation)`)
      }),
    )

  return toDto(created, new Set([created.id]))
}
