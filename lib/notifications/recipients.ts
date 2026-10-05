import { FIELD_AGENT_ROLE_NAME } from '@/lib/auth/constants'
import type { Prisma } from '@/lib/generated/prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * ขอบเขตของ "เรื่อง" ที่แจ้งเตือน — ผู้รับต้องมี scope ระดับแถวครอบเรื่องนั้นจริง (`25` §16.1 · Rule 03)
 *
 * capability บอกแค่ว่า "ทำงานประเภทนี้ได้" ไม่ได้บอกว่า "เห็นแถวนี้" — ส่งตาม capability อย่างเดียว
 * ผู้จัดการทีม B จะได้แจ้งเตือนเคสของทีม A (UAT BUG-064 · มติ PO 03/10/2569 UAT Q17) ⇒ ใช้กติกาเดียวกับ
 * `resolveScope()` (`lib/auth/scope.ts`):
 * - กลุ่ม `system` (scope `global`) — ได้ทุกเรื่องในองค์กร
 * - ผู้จัดการ/หัวหน้าทีม (scope `team`) — เฉพาะเมื่อระบุ `teamId` และตนเป็นสมาชิก/ผู้จัดการ/หัวหน้าของทีมนั้น
 * - ผู้ใช้บริษัทไฟแนนซ์ (scope `company`) — เฉพาะเมื่อระบุ `companyId` ที่ตรงกับบริษัทของตน
 * - พนักงานภาคสนาม (scope `self`) — ไม่รับการแจ้งเตือนแบบกระจายตาม capability (เรื่องของตัวเองส่งตรงด้วย userId)
 *
 * `{}` (`ORGANIZATION_SCOPE`) = เรื่องระดับองค์กร (งวดบัญชี/ข้อซักถาม/WHT ฯลฯ) ⇒ เฉพาะกลุ่ม `system`
 */
export interface RecipientScope {
  teamId?: string | null
  companyId?: string | null
}

export const ORGANIZATION_SCOPE: RecipientScope = Object.freeze({})

/** เงื่อนไข Prisma ของ "ผู้ใช้ที่ scope ครอบเรื่องนี้" — pure (export ไว้ให้เทสต์ตรวจรูปได้) */
export function recipientScopeWhere(scope: RecipientScope): Prisma.UserWhereInput {
  const branches: Prisma.UserWhereInput[] = [{ role: { roleGroup: 'system' } }]
  const teamId = scope.teamId ?? null
  if (teamId !== null) {
    branches.push({
      role: { roleGroup: { in: ['inhouse', 'outsource'] }, name: { not: FIELD_AGENT_ROLE_NAME } },
      OR: [
        { teamId },
        { managedTeams: { some: { teamId } } },
        { supervisedTeams: { some: { id: teamId, deletedAt: null } } },
      ],
    })
  }
  const companyId = scope.companyId ?? null
  if (companyId !== null) {
    branches.push({ role: { roleGroup: 'finance_company' }, companyId })
  }
  return { OR: branches }
}

/**
 * หาผู้รับการแจ้งเตือนจาก **capability** ไม่ใช่ชื่อ role (`90` §6.3 · Rule 03) — **กรองตาม scope เสมอ**
 * — role ถูกแก้สิทธิ์ได้ตลอดผ่าน matrix (`07`/`25`) การ hardcode ชื่อ role จะเพี้ยนทันทีที่ PO ปรับสิทธิ์
 *
 * ⚠️ Superadmin ไม่มีแถวใน `role_capabilities` โดยนิยาม (enforce ที่ middleware) จึงไม่ถูกนับที่นี่ —
 * ตั้งใจ: การแจ้งเตือนควรไปหาคนที่ "ทำงานนั้นจริง" ไม่ใช่ทุกคนที่มีสิทธิ์สูงสุด
 */
export interface RecipientFilter {
  /**
   * จำกัดเฉพาะ role ชื่อเหล่านี้ (ยังต้องถือ capability ด้วย) — ใช้กับสายอนุมัติที่นับ "บทบาทที่ยังขาด"
   * ตามนโยบาย (Adjustment `20` §6.2) · ไม่ระบุ = ทุก role ที่ถือ capability
   */
  roleNames?: readonly string[]
  /** ตัดผู้ใช้เหล่านี้ออก (เช่น ผู้ขอเอง/ผู้อนุมัติขั้นก่อนเมื่อบังคับแบ่งแยกหน้าที่) */
  excludeUserIds?: readonly string[]
}

export async function usersWithCapability(
  organizationId: string,
  capabilityCode: string,
  scope: RecipientScope = ORGANIZATION_SCOPE,
  filter: RecipientFilter = {},
): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      organizationId,
      status: 'active',
      deletedAt: null,
      ...(filter.excludeUserIds !== undefined && filter.excludeUserIds.length > 0
        ? { id: { notIn: [...filter.excludeUserIds] } }
        : {}),
      role: {
        ...(filter.roleNames === undefined ? {} : { name: { in: [...filter.roleNames] } }),
        capabilities: {
          some: { accessLevel: 'manage', capability: { code: capabilityCode } },
        },
      },
      AND: [recipientScopeWhere(scope)],
    },
    select: { id: true },
    take: 200,
  })
  return rows.map((row) => row.id)
}

/**
 * ผู้จัดการ + หัวหน้าของทีม (ผู้ดูแลงานมอบหมายของทีม — `40` §13) — ผู้รับ "พนักงานกดรับงานแล้ว" (`40` §15)
 * ไม่ผูก capability: หัวหน้าที่ settings ปิดสิทธิ์มอบหมายยังต้องเห็นความคืบหน้าทีมตน (read scope เสมอ — `40` §13)
 */
export async function teamLeadIds(organizationId: string, teamId: string | null): Promise<string[]> {
  if (teamId === null) return []
  const team = await prisma.team.findFirst({
    where: { id: teamId, organizationId, deletedAt: null },
    select: {
      supervisorId: true,
      managers: { where: { user: { status: 'active', deletedAt: null } }, select: { userId: true } },
    },
  })
  if (team === null) return []
  const supervisor = team.supervisorId === null ? [] : [team.supervisorId]
  return [...new Set([...supervisor, ...team.managers.map((manager) => manager.userId)])]
}
