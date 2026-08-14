import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listPayeeCandidates, MANAGE_PAYEE_PROFILE } from '@/lib/payees/queries'

/**
 * `GET /api/payees/candidates` — ผู้ใช้ที่ยังไม่มี Payee Profile (เติม dropdown ฟอร์ม "เพิ่ม Payee")
 *
 * ไม่ได้อยู่ใน `18` §14 เพราะเอกสารเขียนระดับ resource — ตัวนี้เป็น lookup ประกอบฟอร์มเดียวกัน
 * จึงใช้ capability ชุดเดียวกับการสร้าง (`manage`) ไม่ใช่ `view` เพื่อไม่ให้รายชื่อพนักงานรั่วเกินจำเป็น
 */
export const GET = withApiPermission(
  'manage',
  MANAGE_PAYEE_PROFILE,
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => apiSuccess(await listPayeeCandidates(user)),
)
