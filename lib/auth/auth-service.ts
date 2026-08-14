import { emitAudit } from '@/lib/audit/audit'
import { AuthError, type AuthErrorCode } from '@/lib/auth/errors'
import { resolveLandingPath } from '@/lib/auth/landing'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { LoginInput } from '@/lib/auth/schemas'
import { invalidateSessionCache, setCachedSession } from '@/lib/auth/session-cache'
import { getAuthenticatedUid, loadSessionUser } from '@/lib/auth/session'
import type { SessionUser } from '@/lib/auth/types'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Login / Logout ตาม `05` §6.1 (Login Flow) + §10 (Security Rules)
 *
 * ลำดับบังคับ: Supabase Auth (ตัวตน) → โหลด user+role+scope จาก DB → ตรวจ status → cache → audit
 * ⚠️ user ที่ `status ≠ active` ห้าม login เด็ดขาด (`05` §10) และต้อง signOut ทิ้ง session ของ Supabase ด้วย
 * ⚠️ login / logout / failed login ต้องลง audit **ทุกครั้ง** (`05` §13-14)
 */

/**
 * หา organization สำหรับ audit ของ login ที่ล้มเหลว (ยังไม่รู้ตัวตน)
 * ลำดับ: อีเมลตรงกับ user ในระบบ → org ของ user นั้น · ไม่ตรง → organization เดียวของระบบ (`02` §12)
 */
async function resolveAuditOrganizationId(email: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { organizationId: true },
    orderBy: { createdAt: 'asc' },
  })
  if (user) return user.organizationId

  const org = await prisma.organization.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } })
  return org?.id ?? null
}

async function auditLoginFailed(email: string, code: AuthErrorCode, meta: RequestMeta): Promise<void> {
  const organizationId = await resolveAuditOrganizationId(email)
  if (organizationId === null) return

  await emitAudit({
    organizationId,
    actorId: null,
    actorRole: null,
    action: 'login',
    targetType: 'users',
    targetId: null,
    // ไม่มี enum `login_failed` ใน `02` §3 — บันทึกเป็น action `login` + ผลลัพธ์ใน after (event `auth.login.failed`)
    after: { result: 'failed', code, email },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  })
}

export interface LoginResult {
  user: SessionUser
  redirectTo: string
}

export async function login(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })

  if (error || !data.user) {
    await auditLoginFailed(input.email, 'INVALID_CREDENTIALS', meta)
    throw new AuthError('INVALID_CREDENTIALS', error?.message)
  }

  const uid = data.user.id
  invalidateSessionCache(uid)

  const account = await loadSessionUser(uid)
  if (!account) {
    await supabase.auth.signOut()
    await auditLoginFailed(input.email, 'USER_NOT_PROVISIONED', meta)
    throw new AuthError('USER_NOT_PROVISIONED', `supabase_uid=${uid}`)
  }

  if (account.status !== 'active') {
    await supabase.auth.signOut()
    await emitAudit({
      organizationId: account.organizationId,
      actorId: account.id,
      actorRole: account.roleName,
      action: 'login',
      targetType: 'users',
      targetId: account.id,
      after: { result: 'failed', code: 'ACCOUNT_INACTIVE', status: account.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
    throw new AuthError('ACCOUNT_INACTIVE', `user=${account.id}`)
  }

  // เวลาเริ่ม session — ใช้คำนวณ timeout 24 ชม. (`05` §10)
  const now = new Date()
  await prisma.user.update({ where: { id: account.id }, data: { lastLoginAt: now } })

  const user: SessionUser = { ...account, loginAt: now.toISOString() }
  setCachedSession(uid, user, now.getTime())

  await emitAudit({
    organizationId: user.organizationId,
    actorId: user.id,
    actorRole: user.roleName,
    action: 'login',
    targetType: 'users',
    targetId: user.id,
    after: { result: 'success' },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  })

  return { user, redirectTo: resolveLandingPath(user.roleGroup, user.roleName) }
}

/** ออกจากระบบ — ปลอดภัยแม้ไม่มี session (คืนค่าปกติ ไม่ throw) */
export async function logout(meta: RequestMeta): Promise<void> {
  const uid = await getAuthenticatedUid()
  const account = uid === null ? null : await loadSessionUser(uid)

  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  if (uid !== null) invalidateSessionCache(uid)

  if (account) {
    await emitAudit({
      organizationId: account.organizationId,
      actorId: account.id,
      actorRole: account.roleName,
      action: 'logout',
      targetType: 'users',
      targetId: account.id,
      after: { result: 'success' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
  }
}
