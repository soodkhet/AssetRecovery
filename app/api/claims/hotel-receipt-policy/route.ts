import type { NextRequest } from 'next/server'
import { apiSuccess } from '@/lib/api/envelope'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { CREATE_CLAIM_CAPABILITIES, manualHotelReceiptRequired } from '@/lib/claims/queries'
import { hotelReceiptPolicyExpenseDate, hotelReceiptPolicyQuerySchema } from '@/lib/claims/schemas'

/**
 * `GET /api/claims/hotel-receipt-policy?payeeId=&expenseDate=` (mytester5 F5-01 · มติ Q7/Q7-R)
 *
 * ฟอร์ม "สร้างรายการเบิกเอง" ประเภทค่าที่พักถาม server ว่าแผนทีมของผู้รับเงิน ณ วันที่เกิดรายการบังคับแนบใบเสร็จไหม
 * ⇒ ซ่อน "ไม่มีใบเสร็จ" ตั้งแต่ก่อนกรอก (ไม่คิดเองฝั่ง client) · การบังคับจริงยังอยู่ที่ `POST /api/claims`
 * สิทธิ์ชุดเดียวกับการสร้างรายการ · ถามแทนผู้อื่นต้องบันทึกแทนได้ (ตรวจในชั้นข้อมูล)
 */
export const GET = withApiPermission(
  'manage',
  CREATE_CLAIM_CAPABILITIES,
  toModuleErrorResponse,
  async (request: NextRequest, _context: unknown, user) => {
    const parsed = hotelReceiptPolicyQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    const expenseDate = hotelReceiptPolicyExpenseDate(parsed.data)
    const hotelReceiptRequired = await manualHotelReceiptRequired(user, { payeeId: parsed.data.payeeId, expenseDate })
    return apiSuccess({ hotelReceiptRequired })
  },
)
