import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { getPayeeWhtConditionPolicy, MANAGE_PAYEE_PROFILE } from '@/lib/payees/queries'

/**
 * `GET /api/payees/wht-condition-policy` (มติ PO 06/10/2569 U105) — ค่าตั้ง "อนุญาตเงื่อนไข (2)/(3)" ที่มีผลวันนี้
 * lookup ประกอบฟอร์มผู้รับเงิน (กรองตัวเลือกเงื่อนไขการหัก) — การบันทึกตรวจซ้ำที่ server เสมอ
 * ใช้ capability เดียวกับการแก้ผู้รับ (`manage`) — ผู้ที่แก้ฟอร์มได้เท่านั้นที่ต้องรู้ค่านี้
 */
export const GET = withApiPermission(
  'manage',
  MANAGE_PAYEE_PROFILE,
  toModuleErrorResponse,
  async (_request: NextRequest, _context: unknown, user) => apiSuccess(await getPayeeWhtConditionPolicy(user)),
)
