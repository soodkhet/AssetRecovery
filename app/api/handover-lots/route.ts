import type { NextRequest } from 'next/server'
import { readJsonBody, validationErrorResponse, withEndpoint } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { WAREHOUSE_CREATE_LOT_CAPABILITY, WAREHOUSE_READ_CAPABILITIES } from '@/lib/warehouse/permissions'
import { createLot, listLots } from '@/lib/warehouse/queries'
import { lotCreateSchema, lotListQuerySchema } from '@/lib/warehouse/schemas'
import type { LotDetailDto, LotListDto } from '@/lib/warehouse/types'

/**
 * `GET /api/handover-lots` (`44` §15 · `45` §6.5) — รายการล็อตของ 2 แท็บท้าย
 * แท็บที่ล็อตไปโผล่มากับ `tab` ของ DTO (คำนวณจาก status ตาม §9.3) — หน้าจอห้าม if สถานะเอง
 */
export const GET = withEndpoint<unknown, LotListDto>({
  endpoint: 'lot.list',
  action: 'view',
  resource: WAREHOUSE_READ_CAPABILITIES,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = lotListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return validationErrorResponse(parsed.error)
    return { data: await listLots(user, parsed.data) }
  },
})

/**
 * `POST /api/handover-lots` (`44` §6.2 · §9.2) — สร้างล็อต + นัดวัน
 *
 * **1 ล็อต = 1 บริษัทไฟแนนซ์เสมอ** และเลข `LOT-`/`DLV-` (ปี พ.ศ.) ออกจาก sequence ระดับ DB
 * ในทรานแซกชันเดียวกับการผูกเครื่อง ⇒ ไม่ซ้ำ ไม่ recycle แม้มีคนสร้างพร้อมกัน (§10)
 */
export const POST = withEndpoint<unknown, LotDetailDto>({
  endpoint: 'lot.create',
  action: 'manage',
  resource: WAREHOUSE_CREATE_LOT_CAPABILITY,
  handler: async (request: NextRequest, _context, user) => {
    const parsed = lotCreateSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return validationErrorResponse(parsed.error)

    const created = await createLot(user, parsed.data, { actor: user, meta: getRequestMeta(request) })
    return { data: created, status: 201 }
  },
})
