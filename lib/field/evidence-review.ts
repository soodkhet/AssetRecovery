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
