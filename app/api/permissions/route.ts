import { capabilityLockOwner } from '@/lib/roles/capability-locks'
import { withRolePermission } from '@/lib/roles/http'
import { listCapabilities } from '@/lib/roles/queries'

/**
 * `GET /api/permissions` (`07` §14) — capability ทั้งหมดในระบบ (`02` §12 — 47 รายการ)
 * ติดธง `locked`/`lockOwner` มาให้ด้วย เพื่อให้ UI แสดง 🔒 และ disable ได้ตรงกับที่ API บังคับ
 * สิทธิ์: `view:view_master_data` (อ่านอย่างเดียว)
 */
export const GET = withRolePermission('view', 'view_master_data', async () => {
  const capabilities = await listCapabilities()

  return Response.json({
    data: capabilities.map((capability) => {
      const lockOwner = capabilityLockOwner(capability.code)
      return { ...capability, locked: lockOwner !== null, lockOwner }
    }),
  })
})
