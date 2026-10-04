import { z } from 'zod'

/**
 * Zod ของ query หมวดการเงินในพอร์ทัล — ใช้ร่วม FE/BE (Rule 04) · ไม่ import prisma (FE เรียกได้)
 */
export const PORTAL_REVENUE_MONTHS_DEFAULT = 6
export const PORTAL_REVENUE_MONTHS_MAX = 12

/** `GET /api/portal/reports/revenue-summary?months=N` — จำนวนเดือนย้อนหลัง (รวมเดือนปัจจุบัน) 1–12 · ค่าเริ่มต้น 6 */
export const portalRevenueSummaryQuerySchema = z.object({
  months: z.coerce
    .number()
    .int('จำนวนเดือนต้องเป็นจำนวนเต็ม')
    .min(1, 'อย่างน้อย 1 เดือน')
    .max(PORTAL_REVENUE_MONTHS_MAX, `ไม่เกิน ${PORTAL_REVENUE_MONTHS_MAX} เดือน`)
    .default(PORTAL_REVENUE_MONTHS_DEFAULT),
})

export type PortalRevenueSummaryQuery = z.infer<typeof portalRevenueSummaryQuerySchema>
