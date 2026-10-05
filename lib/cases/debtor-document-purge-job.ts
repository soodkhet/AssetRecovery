import { emitAudit } from '@/lib/audit/audit'
import { prisma } from '@/lib/prisma'
import {
  RETENTION_CLOSED_CASE_STATUSES,
  debtorDocumentPurgeReason,
  isDebtorDocumentPurgeDue,
  retentionCutoff,
} from '@/lib/settings/data-retention'
import { retentionYearsByOrganization } from '@/lib/settings/queries/data-retention'
import { PERSONAL_DATA_CASE_SLOTS } from '@/lib/uploads/personal-data'
import { removeStoredFiles } from '@/lib/uploads/storage'

/**
 * Job `purge_debtor_documents` (PDPA — มติ PO 06/10/2569 U97 · `91` §6.1 · `90` §6.2) — รายวัน
 *
 * หาเคสที่จบ (`closed_success`/`closed_fail` นับจาก `closed_at` · `rejected` นับจาก `reviewed_at`) นานกว่า
 * ระยะเก็บขององค์กร (ค่าเริ่มต้น 5 ปี) แล้ว **ลบไฟล์บน Storage เฉพาะช่องเอกสารลูกหนี้ที่เป็นข้อมูลส่วนบุคคล**
 * (`PERSONAL_DATA_CASE_SLOTS` = สัญญา/บัตรประชาชน/เอกสารชุด/เอกสารอื่นจากไฟแนนซ์) — รูปสินค้า หลักฐานปิดงาน
 * และเอกสารบัญชีทุกชนิดไม่ถูกแตะ (คนละตาราง/คนละ path)
 *
 * ### เก็บอะไรไว้
 * แถว `case_documents` คงอยู่ (path/hash/ชื่อไฟล์เดิม) + `purged_at` + `deleted_at` (ไม่แสดงเป็นไฟล์ใช้งานอีก)
 * · `cases.debtor_documents_purged_at` สำหรับข้อความบนหน้าเคส · ข้อมูลเคสที่ไม่ใช่ไฟล์ไม่แตะ
 *
 * ### ทำไม idempotent
 * - เลือกเฉพาะแถวที่ `purged_at IS NULL` แล้วอัปเดตแบบมีเงื่อนไขเดียวกัน ⇒ รันซ้ำ/รันพร้อมกัน ไฟล์เดิมถูกนับครั้งเดียว
 *   (audit ลงเฉพาะตัวที่อัปเดตได้จริง) · ลบไฟล์ที่ไม่มีอยู่แล้วไม่ถือว่าผิด
 * - ลบไฟล์ไม่สำเร็จ ⇒ ไม่มาร์คแถวนั้น — รอบถัดไปลองใหม่เอง
 *
 * actor = ระบบ (`actor_id = NULL`) ⇒ `reason` ระบุ job id ให้ trace ได้ (`90` §13)
 */

export const PURGE_DEBTOR_DOCUMENTS_JOB_TYPE = 'purge_debtor_documents'

export interface PurgeDebtorDocumentsJobOptions {
  organizationId?: string
  jobId?: string
  now?: Date
  /** จำนวนเคสสูงสุดต่อองค์กรต่อรอบ — ที่เหลือทำต่อรอบถัดไป */
  limit?: number
}

export interface PurgeDebtorDocumentsJobResult {
  /** จำนวนเคสที่ job นี้ลบไฟล์จริง */
  casesPurged: number
  /** จำนวนไฟล์ที่ลบและมาร์คแล้ว */
  filesPurged: number
  /** ไฟล์ที่ลบจาก Storage ไม่สำเร็จ (ลองใหม่รอบหน้า) */
  filesFailed: number
}

const PERSONAL_SLOTS: string[] = [...PERSONAL_DATA_CASE_SLOTS]

export async function runPurgeDebtorDocumentsJob(
  options: PurgeDebtorDocumentsJobOptions = {},
): Promise<PurgeDebtorDocumentsJobResult> {
  const now = options.now ?? new Date()
  const jobId = options.jobId ?? PURGE_DEBTOR_DOCUMENTS_JOB_TYPE
  const result: PurgeDebtorDocumentsJobResult = { casesPurged: 0, filesPurged: 0, filesFailed: 0 }

  const organizations = await prisma.organization.findMany({
    where: options.organizationId === undefined ? {} : { id: options.organizationId },
    select: { id: true },
  })
  const yearsByOrg = await retentionYearsByOrganization(organizations.map((org) => org.id))

  for (const { id: organizationId } of organizations) {
    const years = yearsByOrg.get(organizationId)
    if (years === undefined) continue
    const cutoff = retentionCutoff(now, years)

    const cases = await prisma.case.findMany({
      where: {
        organizationId,
        status: { in: [...RETENTION_CLOSED_CASE_STATUSES] },
        OR: [
          { status: { in: ['closed_success', 'closed_fail'] }, closedAt: { lt: cutoff } },
          { status: 'rejected', reviewedAt: { lt: cutoff } },
        ],
        documents: { some: { documentType: { in: PERSONAL_SLOTS }, purgedAt: null } },
      },
      orderBy: { id: 'asc' },
      take: options.limit ?? 200,
      select: {
        id: true,
        status: true,
        closedAt: true,
        reviewedAt: true,
        debtorDocumentsPurgedAt: true,
        documents: {
          where: { documentType: { in: PERSONAL_SLOTS }, purgedAt: null },
          select: { id: true, documentType: true, fileUrl: true, originalName: true, fileHash: true, deletedAt: true },
        },
      },
    })

    for (const row of cases) {
      // ยามซ้ำชั้น pure — ตัวกรอง SQL กับกติกาต้องตรงกัน (เวลาอ้างอิงตามสถานะ)
      if (!isDebtorDocumentPurgeDue(row, now, years)) continue

      // I/O เครือข่ายอยู่นอก `$transaction` · ลบก่อนมาร์ค ⇒ มาร์คแล้ว = ไฟล์หายจริง
      const { removed, failed } = await removeStoredFiles(row.documents.map((document) => document.fileUrl))
      result.filesFailed += failed.length
      const removedPaths = new Set(removed)
      const purgedDocuments = row.documents.filter((document) => removedPaths.has(document.fileUrl))
      if (purgedDocuments.length === 0) continue

      const marked = await prisma.$transaction(async (tx) => {
        const ids = purgedDocuments.map((document) => document.id)
        // แถวที่ผู้ใช้ลบไปก่อนแล้วคง `deleted_at` เดิม · ที่ยังใช้งานอยู่ได้ `deleted_at` = เวลานี้
        const softDeleted = await tx.caseDocument.updateMany({
          where: { id: { in: ids }, purgedAt: null, deletedAt: null },
          data: { purgedAt: now, deletedAt: now },
        })
        const alreadyDeleted = await tx.caseDocument.updateMany({
          where: { id: { in: ids }, purgedAt: null, deletedAt: { not: null } },
          data: { purgedAt: now },
        })
        const count = softDeleted.count + alreadyDeleted.count
        if (count === 0) return 0

        await tx.case.updateMany({
          where: { id: row.id, debtorDocumentsPurgedAt: null },
          data: { debtorDocumentsPurgedAt: now },
        })

        await emitAudit(
          {
            organizationId,
            // actor = ระบบ ⇒ reason ระบุ job id (`90` §13)
            actorId: null,
            actorRole: null,
            action: 'delete',
            targetType: 'cases',
            targetId: row.id,
            before: {
              debtor_documents: purgedDocuments.map((document) => ({
                id: document.id,
                slot: document.documentType,
                path: document.fileUrl,
                file_name: document.originalName,
                file_hash: document.fileHash,
              })),
            },
            after: {
              debtor_documents_purged_at: (row.debtorDocumentsPurgedAt ?? now).toISOString(),
              files_purged: count,
              retention_years: years,
              status: row.status,
              closed_at: row.closedAt?.toISOString() ?? null,
              reviewed_at: row.reviewedAt?.toISOString() ?? null,
            },
            reason: debtorDocumentPurgeReason(jobId, years),
            diffOnly: false,
          },
          tx,
        )
        return count
      })

      if (marked > 0) {
        result.casesPurged += 1
        result.filesPurged += marked
      }
    }
  }

  return result
}
