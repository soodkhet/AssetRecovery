import type { NextRequest } from 'next/server'
import { isDevToolsEnabled } from '@/lib/env'
import { MANAGE_ACCOUNTING_PERIOD, UNLOCK_PERIOD } from '@/lib/accounting/period'
import { lockPeriod, sendPeriod } from '@/lib/accounting/queries'
import { devPeriodCloseSchema } from '@/lib/accounting/schemas'
import { apiSuccess } from '@/lib/api/envelope'
import { readJsonBody, toModuleErrorResponse, validationErrorResponse, withApiPermission } from '@/lib/api/http'
import { getRequestMeta } from '@/lib/auth/request-meta'
import { parseSimulatedAsOf } from '@/lib/jobs/job-types'

/**
 * ทางลัด **dev เท่านั้น** ของการส่งงวดให้สำนักงานบัญชี / ล็อกงวด ด้วยวันที่จำลอง (มติ PO 05/10/2569 U65)
 *
 * เหตุ: มติ U51 ห้ามส่ง/ล็อกก่อนสิ้นเดือน (`PERIOD_NOT_ENDED`) ⇒ UAT ปิดงวดเดือนปัจจุบันไม่ได้
 * จึงทำแบบเดียวกับ asOf ของงานเงินทดรอง (O10 — `app/api/dev/trigger-job/route.ts`):
 *  · production ⇒ **404 ก่อนชั้นสิทธิ์** (คนนอกไม่รู้ว่ามี route) — service ยังตัดวันจำลองทิ้งอีกชั้น
 *  · นอกนั้นผ่าน `requirePermission()` **ชุดเดียวกับ route จริง** (send = `manage_accounting_period` ·
 *    lock = `manage_accounting_period` หรือ `unlock_period`) แล้วเรียก service เดียวกัน
 *  · วันจำลองใช้กับยามสิ้นเดือน + Readiness เท่านั้น · audit reason/after ติด `[จำลองวันที่ DD/MM/YYYY]`
 */

type RouteContext = { params: Promise<{ id: string }> }

/** ต้องตอบ 404 **ก่อน**ชั้นสิทธิ์ — ถ้าปล่อยให้ 401/403 ออกไปก่อน คนนอกก็รู้ว่ามี route นี้อยู่ */
function notFound(): Response {
  return new Response('Not Found', { status: 404 })
}

function devPeriodCloseHandler(action: 'send' | 'lock') {
  return withApiPermission<RouteContext>(
    'manage',
    action === 'send' ? MANAGE_ACCOUNTING_PERIOD : [MANAGE_ACCOUNTING_PERIOD, UNLOCK_PERIOD],
    toModuleErrorResponse,
    async (request: NextRequest, context, user) => {
      const { id } = await context.params
      const now = new Date()
      const parsed = devPeriodCloseSchema(now).safeParse(await readJsonBody(request))
      if (!parsed.success) return validationErrorResponse(parsed.error)
      const simulatedNow = parseSimulatedAsOf(parsed.data.asOf, now)
      // schema ตรวจช่วงวันแล้ว — ตรงนี้กันแค่ type (ไม่ควรเกิด)
      if (simulatedNow === null) return notFound()

      const ctx = { actor: user, meta: getRequestMeta(request) }
      const input = { reason: parsed.data.reason }
      const simulation = { simulatedNow }
      return apiSuccess(
        action === 'send'
          ? await sendPeriod(ctx, id, input, now, simulation)
          : await lockPeriod(ctx, id, input, now, simulation),
      )
    },
  )
}

export function devPeriodCloseRoute(action: 'send' | 'lock') {
  const handler = devPeriodCloseHandler(action)
  return async (request: NextRequest, context: RouteContext): Promise<Response> => {
    if (!isDevToolsEnabled()) return notFound()
    return handler(request, context)
  }
}
