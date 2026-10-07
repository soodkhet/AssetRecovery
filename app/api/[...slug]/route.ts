import { apiFailure } from '@/lib/api/envelope'

/**
 * `/api/*` ที่ไม่มี endpoint — ตอบ 404 แบบ envelope กลาง แทนหน้า 404 HTML ของแอป (preship R2-021 · `24` §6.13)
 * route ที่มีอยู่จริงชนะ catch-all เสมอ (Next จับคู่ segment ที่เจาะจงกว่าก่อน) · ไม่มีข้อมูลใดๆ ⇒ ไม่ต้องผ่านชั้นสิทธิ์
 */
function notFound(): Response {
  return apiFailure(
    { code: 'API_ROUTE_NOT_FOUND', title: 'ไม่พบบริการที่เรียก', message: 'ไม่มีบริการนี้ในระบบ — ตรวจที่อยู่อีกครั้ง' },
    404,
  )
}

export const GET = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
