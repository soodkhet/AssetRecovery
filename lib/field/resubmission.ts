import { prisma } from '@/lib/prisma'

/**
 * เวลาปิดงานครั้งแรก vs เวลาส่งหลักฐานใหม่ของ assignment (มติ PO 05/10/2569 U26 · UAT BUG-100 · `41` §10.1)
 *
 * - `cases.closed_at` / `case_assignments.completed_at` = เวลาปิดงาน**ครั้งแรก**ของรอบ — `resubmit_close_case`
 *   ห้ามเขียนทับ (เคสต้องไม่ย้ายเดือนเพราะส่งหลักฐานใหม่ข้ามเที่ยงคืนสิ้นเดือน)
 * - เวลาส่งหลักฐานใหม่ล่าสุด**ไม่มีคอลัมน์แยก** — อ่านจาก `case_evidences.submitted_at` ซึ่งเก็บทุกชุดอยู่แล้ว
 *   (ชุดแรก = ปิดงานครั้งแรก · ชุดถัดไปทุกชุด = ส่งใหม่หลังถูกตีกลับ)
 */
export interface EvidenceTimeline {
  /** `submitted_at` ของหลักฐานชุดแรก = เวลาปิดงานครั้งแรก */
  firstSubmittedAt: Date
  /** `submitted_at` ของชุดล่าสุดเมื่อเคยส่งใหม่ (มีมากกว่า 1 ชุด) · ไม่เคยส่งใหม่ = `null` */
  resubmittedAt: Date | null
}

/** pure — สรุปจากจำนวนชุด + เวลาแรก/ล่าสุด · ไม่มีชุดเลย = `null` */
export function evidenceTimelineOf(
  count: number,
  firstSubmittedAt: Date | null,
  lastSubmittedAt: Date | null,
): EvidenceTimeline | null {
  if (count === 0 || firstSubmittedAt === null) return null
  return {
    firstSubmittedAt,
    resubmittedAt: count > 1 && lastSubmittedAt !== null ? lastSubmittedAt : null,
  }
}

/** โหลด timeline ของหลาย assignment ในคำสั่งเดียว (key = assignment id · ไม่มีหลักฐาน = ไม่มี key) */
export async function loadEvidenceTimelines(
  organizationId: string,
  assignmentIds: readonly string[],
): Promise<Map<string, EvidenceTimeline>> {
  if (assignmentIds.length === 0) return new Map()
  const groups = await prisma.caseEvidence.groupBy({
    by: ['assignmentId'],
    where: { organizationId, assignmentId: { in: [...assignmentIds] } },
    _count: { _all: true },
    _min: { submittedAt: true },
    _max: { submittedAt: true },
  })
  const result = new Map<string, EvidenceTimeline>()
  for (const group of groups) {
    const timeline = evidenceTimelineOf(group._count._all, group._min.submittedAt, group._max.submittedAt)
    if (timeline !== null) result.set(group.assignmentId, timeline)
  }
  return result
}

/** ตัวช่วยของ DTO — เวลาส่งใหม่ล่าสุดเป็น ISO UTC หรือ `null` */
export function resubmittedAtIso(timeline: EvidenceTimeline | undefined): string | null {
  return timeline?.resubmittedAt?.toISOString() ?? null
}

/**
 * เวลาส่งหลักฐานใหม่ล่าสุดของ assignment ล่าสุดของเคส (ตัวเดียวกับที่ `cases.closed_at` อ้าง) — หน้าภายใน
 * ไม่มี assignment / ไม่เคยส่งใหม่ = `null`
 */
export async function loadCaseResubmittedAt(organizationId: string, caseId: string): Promise<string | null> {
  const assignment = await prisma.caseAssignment.findFirst({
    where: { caseId, organizationId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (assignment === null) return null
  const timelines = await loadEvidenceTimelines(organizationId, [assignment.id])
  return resubmittedAtIso(timelines.get(assignment.id))
}
