import type { NextRequest } from 'next/server'
import { renderPayslips } from '@/components/pdf/payslip'
import { toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { attachmentHeader } from '@/lib/format/attachment'
import { assertPayoutDocReady, buildPayslipDocs, selectPayoutDocItems } from '@/lib/payout/payout-doc'
import { getPayoutDocSource, MANAGE_PAYOUT_BATCH } from '@/lib/payout/queries'
import { payoutDocQuerySchema } from '@/lib/payout/schemas'

type RouteContext = { params: Promise<{ id: string }> }

export const runtime = 'nodejs'

/**
 * `GET /api/payout-batches/:id/payslip-pdf?payeeId=` — **สลิปค่าตอบแทน** (`28` §6.1)
 *
 * 1 ผู้รับเงิน = 1 หน้า · ไม่ส่ง `payeeId` = ได้ทั้งรอบในไฟล์เดียว
 * ออกได้ตั้งแต่รอบรวมรายการครบ (`checking`) เพราะเป็นเอกสารสรุปยอด ไม่ใช่หลักฐานการจ่าย
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
    assertPayoutDocReady(source.batch.status)

    const scoped = selectPayoutDocItems(source.batch, parsed.data.payeeId)
    const pdf = await renderPayslips(buildPayslipDocs(scoped, source.issuer))

    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': attachmentHeader(`สลิปค่าตอบแทน ${scoped.name}.pdf`),
        'cache-control': 'no-store',
      },
    })
  },
)
