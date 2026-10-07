import { isLoginThrottled, LOGIN_THROTTLE_WINDOW_MS } from '@/lib/auth/login-throttle'
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

/** ผล {@link withLoginAttemptLock} เมื่อมีคำขอของบัญชีเดียวกันกำลังตรวจรหัสอยู่ */
export const LOGIN_ATTEMPT_BUSY = Symbol('login-attempt-busy')

/**
 * ตรวจรหัสของบัญชีเดียวกันได้ทีละคำขอ (R2-002) — นับครั้งที่ผิด → ตรวจรหัส → ลง audit อยู่ใต้ล็อกเดียวกัน
 * คำขอที่ยิงพร้อมกันจึงเห็นครั้งที่ผิดของกันและกันเสมอ (ก่อนหน้านี้ยิงพร้อมกัน 20 ครั้งผ่านเพดาน 5 ได้ทั้งหมด)
 * ใช้ try-lock ⇒ คำขอที่ซ้อนไม่ต้องรอถือ connection (ไม่กิน pool) แต่ได้ {@link LOGIN_ATTEMPT_BUSY} ทันที
 * ⚠️ `fn` ต้องเขียน audit ผ่าน prisma ปกติ (commit ทันที) ไม่ใช่ `tx` นี้ — ล็อกปล่อยหลัง audit มองเห็นแล้ว
 */
export async function withLoginAttemptLock<T>(key: string, fn: () => Promise<T>): Promise<T | typeof LOGIN_ATTEMPT_BUSY> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${`login_attempt:${key}`})) AS locked`
      if (rows[0]?.locked !== true) return LOGIN_ATTEMPT_BUSY
      return fn()
    },
    { maxWait: 5_000, timeout: 30_000 },
  )
}
