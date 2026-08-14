import { SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import { prisma } from '@/lib/prisma'

/**
 * ตัวนับ Superadmin จาก DB — คู่กับ guard บริสุทธิ์ใน `lib/auth/superadmin-guard.ts`
 * ใช้ตอนแก้สถานะ/role ของผู้ใช้ (Users module — Phase 1.9) เพื่อกัน lockout (`05` §10)
 */
export async function countActiveSuperadmins(organizationId: string): Promise<number> {
  return prisma.user.count({
    where: {
      organizationId,
      status: 'active',
      deletedAt: null,
      role: { name: SUPERADMIN_ROLE_NAME, roleGroup: 'system', deletedAt: null },
    },
  })
}
