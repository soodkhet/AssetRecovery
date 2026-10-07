import { isLoginThrottled, LOGIN_THROTTLE_WINDOW_MS, UNAUDITABLE_IDENTIFIER } from '@/lib/auth/login-throttle'
import { prisma } from '@/lib/prisma'

/**
 * นับ login ที่ผิดล่าสุดจาก audit แล้วตัดสินว่าต้องพักไหม (`login-throttle.ts`)
 * จำกัดที่ `organization_id` + `created_at` เพื่อใช้ index `idx_audit_logs_org_created_at` (audit เก็บ 5 ปี)
 */
export async function loginThrottled(input: {
  organizationId: string
  /** ค่าที่ลง audit (ผ่าน `auditableIdentifier`) */
  identifier: string
  ipAddress: string | null
  now?: Date
}): Promise<boolean> {
  const since = new Date((input.now ?? new Date()).getTime() - LOGIN_THROTTLE_WINDOW_MS)
  const failed = {
    organizationId: input.organizationId,
    action: 'login' as const,
    createdAt: { gte: since },
    afterData: { path: ['code'], equals: 'INVALID_CREDENTIALS' },
  }

  const [identifierFailures, ipFailures] = await Promise.all([
    input.identifier === UNAUDITABLE_IDENTIFIER
      ? Promise.resolve(null)
      : prisma.auditLog.count({
          where: { AND: [failed, { afterData: { path: ['identifier'], equals: input.identifier } }] },
        }),
    input.ipAddress === null ? Promise.resolve(null) : prisma.auditLog.count({ where: { ...failed, ipAddress: input.ipAddress } }),
  ])
  return isLoginThrottled({ identifierFailures, ipFailures })
}
