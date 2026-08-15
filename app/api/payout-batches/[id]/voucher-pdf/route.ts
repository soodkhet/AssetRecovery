import type { NextRequest } from 'next/server'
import { renderPaymentVouchers } from '@/components/pdf/payment-voucher'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { attachmentHeader } from '@/lib/format/attachment'
import {
  assertVoucherReady,
  buildPaymentVoucherDocs,
  selectPayoutDocItems,
} from '@/lib/payout/payout-doc'
import { getPayoutDocSource, MANAGE_PAYOUT_BATCH } from '@/lib/payout/queries'
import { payoutDocQuerySchema } from '@/lib/payout/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export const runtime = 'nodejs'

/**
 * `GET /api/payout-batches/:id/voucher-pdf?payeeId=` — **ใบสำคัญจ่าย** (`28` §6.1 · `13` §6.7)
 *
 * 1 ผู้รับเงิน = 1 หน้า · ไม่ส่ง `payeeId` = ได้ทั้งรอบในไฟล์เดียว
 * ต้องมีไฟล์โอนแล้วจึงออกได้ (`assertVoucherReady()` — ใบนี้เป็นหลักฐาน**การจ่ายเงิน**)
 */
export const GET = withApiPermission<RouteContext>(
  'view',
  MANAGE_PAYOUT_BATCH,
  toModuleErrorResponse,
  async (request: NextRequest, context, user) => {
    const { id } = await context.params
    const parsed = payoutDocQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const source = await getPayoutDocSource(user, id)
    assertVoucherReady(source.batch.status)

    const scoped = selectPayoutDocItems(source.batch, parsed.data.payeeId)
    const pdf = await renderPaymentVouchers(buildPaymentVoucherDocs(scoped, source.issuer))

    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(`ใบสำคัญจ่าย ${scoped.name}.pdf`),
        'cache-control': 'no-store',
      },
    })
  },
)
