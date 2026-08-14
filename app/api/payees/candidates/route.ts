import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { listPayeeCandidates, MANAGE_PAYEE_PROFILE } from '@/lib/payees/queries'

/**
 * `GET /api/payees/candidates` — ผู้ใช้ที่ยังไม่มี Payee Profile (เติม dropdown ฟอร์ม "เพิ่ม Payee")
 *
 * ไม่ได้อยู่ใน `27` §6.3 เพราะเป็น endpoint ช่วยกรอกฟอร์ม ไม่ใช่ทรัพยากรของโมดูล — แนวเดียวกับ
 * `/api/cases/team-options` (Phase 2.5) · ต้องมีสิทธิ์ `manage` เพราะเป็นข้อมูลตั้งต้นของการสร้าง
 */
export const GET = withApiPermission(
  'manage',
  MANAGE_PAYEE_PROFILE,
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => apiSuccess(await listPayeeCandidates(user)),
)
