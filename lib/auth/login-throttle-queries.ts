import { isLoginThrottled, LOGIN_THROTTLE_WINDOW_MS, UNAUDITABLE_IDENTIFIER } from '@/lib/auth/login-throttle'
import { prisma } from '@/lib/prisma'

/**
 * นับครั้งที่ผิดล่าสุดจาก audit แล้วตัดสินว่าต้องพักไหม (`login-throttle.ts`)
 * จำกัดที่ `organization_id` + `created_at` เพื่อใช้ index `idx_audit_logs_org_created_at` (audit เก็บ 5 ปี)
 * ครั้งที่ผิดลง `after.throttle_key` (login = action `login` · เปลี่ยนรหัสด้วยรหัสปัจจุบันผิด = action `update`)
 */
export async function loginThrottled(input: {
  organizationId: string
  /** จาก `loginThrottleKey` — `null` = นับรายบัญชีไม่ได้ */
  throttleKey: string | null
  /** บัญชีที่มีจริง — ใช้หาครั้งล่าสุดที่ตั้งรหัสใหม่ (เริ่มนับใหม่) */
  accountId: string | null
  ipAddress: string | null
  now?: Date
}): Promise<boolean> {
  const windowStart = new Date((input.now ?? new Date()).getTime() - LOGIN_THROTTLE_WINDOW_MS)
  const accountSince = input.accountId === null ? windowStart : await accountCountingStart(input, windowStart)

  const failed = (since: Date) => ({
    organizationId: input.organizationId,
    action: { in: ['login' as const, 'update' as const] },
    createdAt: { gte: since },
    afterData: { path: ['code'], equals: 'INVALID_CREDENTIALS' },
  })
  const byKey = input.throttleKey === null ? null : { afterData: { path: ['throttle_key'], equals: input.throttleKey } }

  const [accountFailures, accountIpFailures, ipFailures] = await Promise.all([
    byKey === null ? Promise.resolve(null) : prisma.auditLog.count({ where: { AND: [failed(accountSince), byKey] } }),
    byKey === null || input.ipAddress === null
      ? Promise.resolve(null)
      : prisma.auditLog.count({ where: { AND: [failed(accountSince), byKey, { ipAddress: input.ipAddress }] } }),
    input.ipAddress === null
      ? Promise.resolve(null)
      : prisma.auditLog.count({ where: { ...failed(windowStart), ipAddress: input.ipAddress } }),
  ])
  return isLoginThrottled({ accountIpFailures, accountFailures, ipFailures })
}

/** ผู้ดูแลตั้ง/รีเซ็ตรหัส หรือเจ้าของเปลี่ยนเอง หลังต้นช่วงเวลา ⇒ เริ่มนับรายบัญชีจากตรงนั้น (ทางปลดล็อก) */
async function accountCountingStart(
  input: { organizationId: string; accountId: string | null },
  windowStart: Date,
): Promise<Date> {
  const reset = await prisma.auditLog.findFirst({
    where: {
      organizationId: input.organizationId,
      action: 'update',
      targetType: 'users',
      targetId: input.accountId,
      createdAt: { gte: windowStart },
      OR: [
        { afterData: { path: ['password_reset_by_admin'], equals: true } },
        { afterData: { path: ['password_set_by_admin'], equals: true } },
        { afterData: { path: ['password_changed_by_self'], equals: true } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return reset?.createdAt ?? windowStart
}

/**
 * มีแถว audit "ถูกพัก" ของกุญแจ + IP เดียวกันหลัง `since` แล้วหรือยัง — preship R3-009
 * ใช้ลง audit การถูกพักครั้งแรกต่อช่วงเวลา แทนลงทุกคำขอ (audit ลบไม่ได้ ⇒ ยิงซ้ำไม่จำกัดตารางโตไม่หยุด)
 */
export async function rateLimitAuditedSince(input: {
  organizationId: string
  throttleKey: string | null
  ipAddress: string | null
  since: Date
}): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: {
      AND: [
        {
          organizationId: input.organizationId,
          action: { in: ['login', 'update'] },
          createdAt: { gte: input.since },
          afterData: { path: ['code'], equals: 'LOGIN_RATE_LIMITED' },
          ipAddress: input.ipAddress,
        },
        // ไม่มีกุญแจบัญชี = identifier ลง audit เป็น `<invalid>` (`loginThrottleKey`)
        input.throttleKey === null
          ? { afterData: { path: ['identifier'], equals: UNAUDITABLE_IDENTIFIER } }
          : { afterData: { path: ['throttle_key'], equals: input.throttleKey } },
      ],
    },
    select: { id: true },
  })
  return row !== null
}
