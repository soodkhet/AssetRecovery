import type { NextRequest } from 'next/server'
import { renderPayoutBatchSummary } from '@/components/pdf/payout-batch-summary'
import { toModuleErrorResponse, withApiPermission } from '@/lib/api/http'
import { attachmentHeader } from '@/lib/format/attachment'
import { assertPayoutDocReady, buildPayoutSummaryDoc } from '@/lib/payout/payout-doc'
import { getPayoutDocSource, MANAGE_PAYOUT_BATCH } from '@/lib/payout/queries'

type RouteContext = { params: Promise<{ id: string }> }

/** `@react-pdf/renderer` ต้องใช้ Node API (fs/stream) — บังคับ runtime ไม่ให้ตกไป Edge */
export const runtime = 'nodejs'

/**
 * `GET /api/payout-batches/:id/summary-pdf` — **สรุปรอบจ่ายเงิน** (`28` §6.1 · `13` §6.7)
 *
 * เอกสารภายในใช้ตรวจก่อนตัดโอนจริง ⇒ สิทธิ์เดียวกับการ**ดู**รอบจ่าย (`17` §12 บัญชี/ผู้บริหาร
 * อ่านได้) — ไม่ใช่ `generate_payment_file` ซึ่งสงวนไว้ให้จุดที่เงินออกจริง
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  MANAGE_PAYOUT_BATCH,
  toModuleErrorResponse,
  async (_request: NextRequest, context, user) => {
    const { id } = await context.params
    const source = await getPayoutDocSource(user, id)
    assertPayoutDocReady(source.batch.status)

    const pdf = await renderPayoutBatchSummary(buildPayoutSummaryDoc(source.batch, source.issuer))

    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(`${source.batch.name}.pdf`),
        // ยอด/สถานะของรอบเปลี่ยนได้จนกว่าจะจ่ายสำเร็จ — ห้าม cache
        'cache-control': 'no-store',
      },
    })
  },
)
