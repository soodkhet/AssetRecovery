import { hasCapability } from '@/lib/auth/permission'
import type { SessionUser } from '@/lib/auth/types'
import type { CaseFieldEvidenceDto } from '@/lib/cases/types'
import { FIELD_REJECT_EVIDENCE_CAPABILITY } from '@/lib/field/permissions'
import { prisma } from '@/lib/prisma'

/**
 * หลักฐานปิดงานชุดล่าสุดของเคส สำหรับหน้าตรวจของเจ้าหน้าที่อนุมัติเคส (UAT BUG-045 · `41` §8/§10.1)
 *
 * - ผู้ไม่ถือ `reject_evidence` (ระดับใดก็ได้) ได้ `null` เสมอ — รูป/วิดีโอหน้างานมีข้อมูลลูกหนี้
 *   จึงไม่เปิดให้ทุกคนที่ดูรายละเอียดเคสได้ (Superadmin ผ่านโดยนิยาม — DEC-009)
 * - ใช้ assignment ล่าสุดของเคส (ตัวเดียวกับที่ `rejectFieldEvidence()` จะตีกลับ) + หลักฐานชุดล่าสุดของรอบนั้น
 * - ยังไม่เคยส่งหลักฐาน ⇒ `null`
 */
export async function loadCaseFieldEvidence(user: SessionUser, caseId: string): Promise<CaseFieldEvidenceDto | null> {
  if (!hasCapability(user, 'view', FIELD_REJECT_EVIDENCE_CAPABILITY)) return null

  const assignment = await prisma.caseAssignment.findFirst({
    where: { caseId, organizationId: user.organizationId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, agent: { select: { fullName: true } } },
  })
  if (assignment === null) return null

  const [evidence, checkins] = await Promise.all([
    prisma.caseEvidence.findFirst({
      where: { assignmentId: assignment.id, organizationId: user.organizationId },
      orderBy: { submittedAt: 'desc' },
      select: {
        outcome: true,
        status: true,
        photos: true,
        videos: true,
        productPhotos: true,
        audioUrl: true,
        note: true,
        failReason: true,
        failReasonDetail: true,
        submittedAt: true,
        rejectReason: true,
        reviewedAt: true,
        reviewedByUser: { select: { fullName: true } },
      },
    }),
    prisma.checkIn.findMany({
      where: { assignmentId: assignment.id, organizationId: user.organizationId },
      orderBy: { checkedInAt: 'asc' },
      select: {
        id: true,
        checkinType: true,
        latitude: true,
        longitude: true,
        addressNote: true,
        note: true,
        checkedInAt: true,
      },
    }),
  ])
  if (evidence === null) return null

  return {
    assignmentId: assignment.id,
    assignmentStatus: assignment.status,
    agentName: assignment.agent.fullName,
    outcome: evidence.outcome,
    evidenceStatus: evidence.status,
    photos: evidence.photos,
    videos: evidence.videos,
    productPhotos: evidence.productPhotos,
    audioUrl: evidence.audioUrl,
    note: evidence.note,
    failReason: evidence.failReason,
    failReasonDetail: evidence.failReasonDetail,
    submittedAt: evidence.submittedAt.toISOString(),
    rejectReason: evidence.rejectReason,
    reviewedAt: evidence.reviewedAt?.toISOString() ?? null,
    reviewedByName: evidence.reviewedByUser?.fullName ?? null,
    checkins: checkins.map((row) => ({
      id: row.id,
      checkinType: row.checkinType,
      latitude: row.latitude.toNumber(),
      longitude: row.longitude.toNumber(),
      addressNote: row.addressNote,
      note: row.note,
      checkedInAt: row.checkedInAt.toISOString(),
    })),
  }
}

/**
 * เหตุผลปิดงานไม่สำเร็จของหลักฐานชุดล่าสุดของเคส (มติ PO 03/10/2569 — UAT Q16)
 *
 * ต่างจาก {@link loadCaseFieldEvidence} ตรงที่**ไม่จำกัดสิทธิ์ `reject_evidence`** — เหตุผลเป็นผลการติดตาม
 * ที่บริษัทไฟแนนซ์ต้องเห็นในเคสของตัวเอง (ผู้เรียกกรองแถวด้วย `caseScopeWhere()` มาแล้ว) และไม่มีรูป/วิดีโอ
 * หรือพิกัดของลูกหนี้ติดไปด้วย · ชุดล่าสุดไม่ใช่ `closed_fail` หรือไม่มีเหตุผล (ก่อนมติ) = `null`
 */
export async function loadCaseCloseFailReason(
  organizationId: string,
  caseId: string,
): Promise<{ code: string; detail: string | null } | null> {
  const latest = await prisma.caseEvidence.findFirst({
    where: { caseId, organizationId },
    orderBy: { submittedAt: 'desc' },
    select: { outcome: true, failReason: true, failReasonDetail: true },
  })
  if (latest === null || latest.outcome !== 'closed_fail' || latest.failReason === null) return null
  return { code: latest.failReason, detail: latest.failReasonDetail }
}
