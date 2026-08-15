import type { NextRequest } from 'next/server'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { GENERATE_PAYMENT_FILE, readPaymentFile } from '@/lib/payout/queries'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * `GET /api/payout-batches/:id/payment-file` (`27` §6.6 v3.2) — ดาวน์โหลดไฟล์โอนล่าสุดของรอบ
 *
 * ไฟล์อยู่ใน bucket **private** และส่งผ่าน endpoint นี้เท่านั้น (ไม่แจก signed URL ให้ browser)
 * ⇒ ทุกครั้งที่ดาวน์โหลดผ่าน `requirePermission()` ของ `generate_payment_file` เหมือนตอนสร้าง
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  GENERATE_PAYMENT_FILE,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    const file = await readPaymentFile(user, id)
    return new Response(file.bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  },
)
