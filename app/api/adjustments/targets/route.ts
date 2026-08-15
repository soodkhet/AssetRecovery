import type { NextRequest } from 'next/server'
import { CREATE_ADJUSTMENT } from '@/lib/adjustments/adjustment'
import { listAdjustmentTargets } from '@/lib/adjustments/queries'
import { adjustmentTargetQuerySchema } from '@/lib/adjustments/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'

/**
 * `GET /api/adjustments/targets` (`20` §8 · `27` §6.8 v3.1) — ตัวเลือกรายการต้นทางของฟอร์มสร้าง
 *
 * ฟอร์มของ `20` §8 บังคับให้ "เลือก target ก่อน (ค้นหาจากเลขที่อ้างอิง) แล้วระบบ snapshot
 * `period_status_at_target` อัตโนมัติ **พร้อมแสดงว่าต้องผ่านการอนุมัติระดับไหน**" — ข้อมูลสองอย่างนี้
 * อยู่ที่ `accounting_periods` ซึ่งหน้าจอเข้าถึงเองไม่ได้ จึงต้องมี endpoint อ่านคู่กัน
 * (endpoint ที่ spec ตกหล่น — เพิ่มลง `20` §14 + `27` §6.8 ใน commit เดียวกัน ตาม Rule 04)
 *
 * สิทธิ์ = `create_adjustment` (คนที่สร้างไม่ได้ ไม่ต้องเห็นตัวเลือก)
 */
export const GET = withApiPermission(
  'manage',
  CREATE_ADJUSTMENT,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = adjustmentTargetQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return apiSuccess(await listAdjustmentTargets(user, parsed.data))
  },
)
