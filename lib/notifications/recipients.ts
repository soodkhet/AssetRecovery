import { prisma } from '@/lib/prisma'

/**
 * หาผู้รับการแจ้งเตือนจาก **capability** ไม่ใช่ชื่อ role (`90` §6.3 · Rule 03)
 * — role ถูกแก้สิทธิ์ได้ตลอดผ่าน matrix (`07`/`25`) การ hardcode ชื่อ role จะเพี้ยนทันทีที่ PO ปรับสิทธิ์
 *
 * ⚠️ Superadmin ไม่มีแถวใน `role_capabilities` โดยนิยาม (enforce ที่ middleware) จึงไม่ถูกนับที่นี่ —
 * ตั้งใจ: การแจ้งเตือนควรไปหาคนที่ "ทำงานนั้นจริง" ไม่ใช่ทุกคนที่มีสิทธิ์สูงสุด
 */
export async function usersWithCapability(organizationId: string, capabilityCode: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      organizationId,
      status: 'active',
      deletedAt: null,
      role: {
        capabilities: {
          some: { accessLevel: 'manage', capability: { code: capabilityCode } },
        },
      },
    },
    select: { id: true },
    take: 200,
  })
  return rows.map((row) => row.id)
}
