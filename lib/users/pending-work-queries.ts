import { loadSessionUser } from '@/lib/auth/session'
import { countQueuesForUser } from '@/lib/dashboard/queries'
import type { DashboardQueueId } from '@/lib/dashboard/widgets'
import type { AssignmentStatus, ExpenseStatus } from '@/lib/generated/prisma/enums'
import { prisma } from '@/lib/prisma'
import type {
  UserApprovalQueueDto,
  UserOpenAssignmentDto,
  UserPendingClaimDto,
  UserPendingWorkDto,
} from '@/lib/users/types'

/**
 * งานค้างของผู้ใช้ — ชั้นข้อมูล (อ่านอย่างเดียว) · กติกา/ข้อความอยู่ที่ `lib/users/pending-work.ts`
 * ทุก query กรอง `organization_id` เสมอ
 */

/** สถานะงานภาคสนามที่ยังไม่จบ (รวมถูกตีกลับให้แก้) — ชุดเดียวกับ `isAssignmentOpen()` */
const OPEN_ASSIGNMENT_STATUSES = [
  'pending_accept',
  'accepted_unscheduled',
  'scheduled',
  'needs_revision',
] as const satisfies readonly AssignmentStatus[]

/** ใบเบิกไม่ผูกงานที่ยังอยู่ในสายอนุมัติ (รอพิจารณา/ตีกลับให้ผู้เบิกแก้แล้วส่งใหม่) */
const PENDING_CLAIM_STATUSES = ['pending_approval', 'needs_revision'] as const satisfies readonly ExpenseStatus[]

/** คิวรออนุมัติที่เตือนก่อนระงับผู้ใช้ (S7-AG7-04) — งานที่ต้องมีผู้ตัดสิน ไม่ใช่งานธุรการทั่วไป */
const APPROVAL_QUEUE_IDS: readonly DashboardQueueId[] = [
  'case_pending_review',
  'case_recycle_review',
  'compensation_my_step',
  'advance_pending_approval',
  'adjustment_pending',
]

/** ตัวอ่านที่ใช้ได้ทั้ง client หลักและ transaction */
export type TeamChangeReadClient = Pick<typeof prisma, 'caseAssignment' | 'expense'>

/** งานที่กันการย้ายทีม/กลุ่ม (มติ D7-03) — งานภาคสนามที่ยังไม่จบ + ใบเบิกไม่ผูกงานที่ยังอยู่ในสายอนุมัติ */
export async function loadTeamChangeBlockers(
  organizationId: string,
  userId: string,
  client: TeamChangeReadClient = prisma,
): Promise<Pick<UserPendingWorkDto, 'openAssignments' | 'pendingClaims'>> {
  const [assignments, claims] = await Promise.all([
    client.caseAssignment.findMany({
      where: {
        organizationId,
        agentId: userId,
        status: { in: [...OPEN_ASSIGNMENT_STATUSES] },
        case: { deletedAt: null },
      },
      select: { id: true, caseId: true, status: true, case: { select: { caseRef: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    client.expense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        assignmentId: null,
        status: { in: [...PENDING_CLAIM_STATUSES] },
        payee: { userId },
      },
      select: { id: true, expenseType: true, grossSatang: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const openAssignments: UserOpenAssignmentDto[] = assignments.map((row) => ({
    assignmentId: row.id,
    caseId: row.caseId,
    caseRef: row.case.caseRef,
    status: row.status,
  }))
  const pendingClaims: UserPendingClaimDto[] = claims.map((row) => ({
    expenseId: row.id,
    expenseType: row.expenseType,
    grossSatang: row.grossSatang,
    status: row.status,
  }))
  return { openAssignments, pendingClaims }
}

/**
 * มีผู้ใช้อื่นที่ใช้งานอยู่ถือสิทธิ์ทำคิวนี้ไหม (ไม่นับ Superadmin — ไม่มี record ใน `role_capabilities`)
 * ผู้อนุมัติ scope ทีม: นับเฉพาะคนกลุ่มระบบ (เห็นทั้งองค์กร) หรือผู้จัดการ/หัวหน้าของทีมเดียวกัน
 */
async function hasOtherActiveHolder(
  organizationId: string,
  userId: string,
  capabilities: readonly string[],
  teamIds: readonly string[] | null,
): Promise<boolean> {
  const count = await prisma.user.count({
    where: {
      organizationId,
      id: { not: userId },
      status: 'active',
      deletedAt: null,
      supabaseUid: { not: null },
      role: {
        deletedAt: null,
        capabilities: { some: { accessLevel: 'manage', capability: { code: { in: [...capabilities] } } } },
      },
      ...(teamIds === null
        ? {}
        : {
            OR: [
              { role: { roleGroup: 'system' } },
              { managedTeams: { some: { teamId: { in: [...teamIds] } } } },
              { supervisedTeams: { some: { id: { in: [...teamIds] }, deletedAt: null } } },
            ],
          }),
    },
  })
  return count > 0
}

/** คิวรออนุมัติที่ผู้ใช้คนนี้เป็นผู้ลงมือ (นับด้วยสิทธิ์/scope ของเขาเอง เท่ากับตัวเลขบนแดชบอร์ดของเขา) */
async function loadApprovalQueues(organizationId: string, userId: string): Promise<UserApprovalQueueDto[]> {
  const row = await prisma.user.findFirst({
    where: { id: userId, organizationId, deletedAt: null },
    select: { supabaseUid: true },
  })
  const supabaseUid = row?.supabaseUid ?? null
  if (supabaseUid === null) return []
  const session = await loadSessionUser(supabaseUid)
  if (session === null || session.organizationId !== organizationId) return []
  const counted = await countQueuesForUser(session, APPROVAL_QUEUE_IDS)
  const teamIds = session.scope.kind === 'team' ? session.scope.teamIds : null
  return Promise.all(
    counted
      .filter((item) => item.count > 0)
      .map(async (item) => ({
        id: item.def.id,
        label: item.def.label,
        count: item.count,
        capped: item.capped,
        soleApprover: !(await hasOtherActiveHolder(organizationId, session.id, item.def.anyOf, teamIds)),
      })),
  )
}

/** `GET /api/users/:id/pending-work` — งานค้างทุกชนิด (ผู้เรียกผ่านยาม scope ของ `getUser()` มาแล้ว) */
export async function loadUserPendingWork(organizationId: string, userId: string): Promise<UserPendingWorkDto> {
  const [blockers, approvalQueues] = await Promise.all([
    loadTeamChangeBlockers(organizationId, userId),
    loadApprovalQueues(organizationId, userId),
  ])
  return { ...blockers, approvalQueues }
}
