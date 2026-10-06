import { apiSuccess } from '@/lib/api/envelope'
import { requireInternalSession } from '@/lib/auth/internal-session'
import { withAuthErrors } from '@/lib/auth/require-permission'
import { getDashboardOverview } from '@/lib/dashboard/queries'

/**
 * `GET /api/dashboard` — ภาพรวมของแดชบอร์ดหลัก (Phase 6.6 · มติ PO 2026-08-16)
 *
 * - ทุก role ภายในเห็นเมนูแดชบอร์ด ⇒ endpoint นี้**ไม่ผูก capability ตัวเดียว** (แบบเดียวกับ `/api/meta/menu`
 *   และ `/api/notifications`) แต่ผู้ใช้กลุ่มบริษัทไฟแนนซ์ได้ 403 (`requireInternalSession`)
 * - สิทธิ์ของ**แต่ละ widget** ตรวจที่ชั้นนี้ก่อนยิง query (`visibleDashboardQueues()` / `canViewCaseBoard()`)
 *   ด้วย capability ชุดเดียวกับ endpoint ต้นทาง + scope ทีมผ่าน helper เดิม — ไม่มีสิทธิ์ = ไม่มีแถวนั้นใน response
 * - read-only ไม่มี audit · KPI เงินไม่อยู่ที่นี่ (หน้าจอเรียก endpoint เดิมที่ตรวจสิทธิ์ของตัวเอง)
 */
export const GET = withAuthErrors(async () => {
  const user = await requireInternalSession()
  return apiSuccess(await getDashboardOverview(user))
})
