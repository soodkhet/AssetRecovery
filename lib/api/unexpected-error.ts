import { unstable_rethrow } from 'next/navigation'
import { apiFailure } from '@/lib/api/envelope'

/**
 * error ที่ไม่ใช่ของโมดูล/ชั้น auth — ปลายทางสุดท้ายของตัวห่อ route ทุกตัว (ผ่าน `toAuthErrorResponse()`)
 * preship audit PS-006 / PS-022
 *
 * เดิมโยนต่อให้ Next ตอบ 500 แบบไม่มี body ⇒ หน้าจออ่าน JSON ไม่ได้แล้วขึ้น "เชื่อมต่อระบบไม่สำเร็จ"
 * (ผู้ใช้ไปตรวจ Wi-Fi แทนที่จะแจ้งว่าระบบขัดข้อง) ตอนนี้ตอบ envelope กลางเสมอ:
 * - id ใน path ไม่ใช่ UUID (Postgres ปฏิเสธตอน query) ⇒ 400 `INVALID_ID_FORMAT` — ไม่ใช่ความผิดของระบบ
 * - อย่างอื่น ⇒ 500 `INTERNAL_ERROR` + log ฝั่ง server (รายละเอียดไม่ออก response)
 * error ภายในของ Next (redirect/notFound) ปล่อยผ่านตามเดิม
 */

const INVALID_UUID_MESSAGE = /invalid input syntax for type uuid|error creating uuid/i
/** P2007 = ค่าผิดชนิด (ผ่าน driver adapter) · P2023 = ข้อมูลคอลัมน์ไม่ถูกต้อง (Prisma ตรวจเอง) */
const INVALID_ID_PRISMA_CODES = new Set(['P2007', 'P2023'])

export function isInvalidIdError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === 'string' && INVALID_ID_PRISMA_CODES.has(code) && typeof message === 'string' && INVALID_UUID_MESSAGE.test(message)
}

export function unexpectedErrorResponse(error: unknown): Response {
  unstable_rethrow(error)
  if (isInvalidIdError(error)) {
    return apiFailure(
      {
        code: 'INVALID_ID_FORMAT',
        title: 'ไม่พบรายการ',
        message: 'รหัสอ้างอิงของรายการไม่ถูกต้อง — กลับไปเลือกรายการจากหน้ารายการอีกครั้ง',
      },
      400,
    )
  }
  console.error('[api] unexpected error', error)
  return apiFailure(
    {
      code: 'INTERNAL_ERROR',
      title: 'ระบบขัดข้องชั่วคราว',
      message: 'ระบบทำรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง — ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ',
    },
    500,
  )
}
