import { emitAudit } from '@/lib/audit/audit'
import { isCompanyActive, loadCompanyStatus } from '@/lib/auth/company-status'
import { CHANGE_PASSWORD_PATH, LOGIN_PATH } from '@/lib/auth/constants'
import { AuthError, type AuthErrorCode } from '@/lib/auth/errors'
import { resolveLandingPath } from '@/lib/auth/landing'
import { isPortalOnlyUser } from '@/lib/auth/permission'
import {
  INTERNAL_AUTH_EMAIL_DOMAIN,
  parseLoginIdentifier,
  USERNAME_PATTERN,
  type LoginIdentifier,
} from '@/lib/auth/login-identifier'
import type { RequestMeta } from '@/lib/auth/request-meta'
import type { LoginInput } from '@/lib/auth/schemas'
import { padLoginFailure, realLoginTimingClock, type LoginTimingClock } from '@/lib/auth/login-timing'
import { invalidateSessionCache, setCachedSession } from '@/lib/auth/session-cache'
import { getAuthenticatedUid, loadSessionUser } from '@/lib/auth/session'
import type { SessionUser } from '@/lib/auth/types'
import { prisma } from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getAuthEmail, setAuthPassword, verifyPassword } from '@/lib/users/provisioning'

/**
 * Login / Logout ตาม `05` §6.1 (Login Flow) + §10 (Security Rules)
 *
 * ลำดับบังคับ: หาผู้ใช้จากอีเมล/username → Supabase Auth (ตัวตน) → โหลด user+role+scope จาก DB
 *            → ตรวจ status → (ผู้ใช้บริษัท) ตรวจบริษัท active → cache → audit
 * มติ PO 03/10/2569: ช่องเดียวรับทั้งอีเมลและ username — อีเมลที่ใช้ sign in กับ Supabase อ่านจาก
 * บัญชี Auth ตรง (`getAuthEmail`) ไม่เดาจาก DB เพราะผู้ใช้ไม่มีอีเมลใช้อีเมลภายใน และกันกรณีย้ายอีเมลค้าง
 * ⚠️ user ที่ `status ≠ active` ห้าม login เด็ดขาด (`05` §10) และต้อง signOut ทิ้ง session ของ Supabase ด้วย
 * ⚠️ login / logout / failed login ต้องลง audit **ทุกครั้ง** (`05` §13-14)
 */

interface LoginAccount {
  organizationId: string
  supabaseUid: string | null
}

/** ผู้ใช้ที่ยังไม่ถูกลบตามตัวระบุ — username/อีเมลไม่ซ้ำในองค์กร (ระบบมีองค์กรเดียว — `02` §12) */
async function findLoginAccount(identifier: LoginIdentifier): Promise<LoginAccount | null> {
  return prisma.user.findFirst({
    where:
      identifier.kind === 'email'
        ? { email: identifier.email, deletedAt: null }
        : { username: identifier.username, deletedAt: null },
    select: { organizationId: true, supabaseUid: true },
    orderBy: { createdAt: 'asc' },
  })
}

/** organization สำหรับ audit ของ login ที่ล้มเหลว — ไม่รู้ตัวตน = organization เดียวของระบบ (`02` §12) */
async function resolveAuditOrganizationId(account: LoginAccount | null): Promise<string | null> {
  if (account) return account.organizationId
  const org = await prisma.organization.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } })
  return org?.id ?? null
}

/**
 * identifier ที่ลง audit — เฉพาะที่หน้าตาเป็นอีเมล/username จริง ไม่งั้นบันทึก `<invalid>`
 * (กันผู้ใช้พิมพ์รหัสผ่านลงช่องผิดแล้วรหัสไปค้างใน audit ที่ immutable)
 */
function auditableIdentifier(raw: string): string {
  const identifier = parseLoginIdentifier(raw)
  if (identifier.kind === 'username') return USERNAME_PATTERN.test(identifier.username) ? identifier.username : '<invalid>'
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.email) && identifier.email.length <= 255
    ? identifier.email
    : '<invalid>'
}

/** ใช้ตอนไม่พบผู้ใช้ — ยังยิง Supabase หนึ่งครั้งให้เวลาตอบใกล้เคียงกรณีรหัสผิด (กันไล่หา username จากเวลา) */
const LOGIN_TIMING_DUMMY_EMAIL = `nobody@${INTERNAL_AUTH_EMAIL_DOMAIN}`
/** uid ที่ไม่มีทางมีจริงใน Auth — ใช้ถ่วงเวลาทางที่ไม่พบบัญชีให้เรียก Auth เท่าทางปกติ (BUG-140) */
const LOGIN_TIMING_DUMMY_UID = '00000000-0000-0000-0000-000000000000'

async function auditLoginFailed(
  identifier: string,
  account: LoginAccount | null,
  code: AuthErrorCode,
  meta: RequestMeta,
): Promise<void> {
  const organizationId = await resolveAuditOrganizationId(account)
  if (organizationId === null) return

  await emitAudit({
    organizationId,
    actorId: null,
    actorRole: null,
    action: 'login',
    targetType: 'users',
    targetId: null,
    // ไม่มี enum `login_failed` ใน `02` §3 — บันทึกเป็น action `login` + ผลลัพธ์ใน after (event `auth.login.failed`)
    after: { result: 'failed', code, identifier: auditableIdentifier(identifier) },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  })
}

export interface LoginResult {
  user: SessionUser
  redirectTo: string
}

/**
 * login — ตอบ `INVALID_CREDENTIALS` ด้วยเวลาขั้นต่ำคงที่เสมอ (UAT BUG-140 · `lib/auth/login-timing.ts`)
 * กันไล่เดาว่าบัญชีไหนมีจริงจากเวลาตอบ · `clock` ฉีดได้เพื่อเทสต์ (ค่าจริง = นาฬิการะบบ)
 */
export async function login(
  input: LoginInput,
  meta: RequestMeta,
  clock: LoginTimingClock = realLoginTimingClock,
): Promise<LoginResult> {
  const startedAt = clock.now()
  try {
    return await authenticate(input, meta)
  } catch (error) {
    if (error instanceof AuthError && error.code === 'INVALID_CREDENTIALS') await padLoginFailure(startedAt, clock)
    throw error
  }
}

async function authenticate(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
  const identifier = parseLoginIdentifier(input.identifier)
  const account = await findLoginAccount(identifier)
  // ไม่พบผู้ใช้ / ยังไม่มีบัญชี Auth = ตอบเหมือนรหัสผิดทุกประการ (ห้าม leak ว่ามีตัวตนนี้ในระบบ — `05` §10)
  // ไม่พบบัญชี → ยังเรียกอ่านบัญชี Auth ด้วย uid หลอก 1 ครั้ง ให้จำนวนครั้งที่เรียก Auth เท่าทางที่มีบัญชีจริง (BUG-140)
  const authEmail = await getAuthEmail(account?.supabaseUid ?? LOGIN_TIMING_DUMMY_UID)
  if (authEmail === null || !account?.supabaseUid) {
    await verifyPassword(LOGIN_TIMING_DUMMY_EMAIL, input.password)
    await auditLoginFailed(input.identifier, account, 'INVALID_CREDENTIALS', meta)
    throw new AuthError('INVALID_CREDENTIALS', 'identifier not resolved')
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: input.password })

  if (error || !data.user) {
    await auditLoginFailed(input.identifier, account, 'INVALID_CREDENTIALS', meta)
    throw new AuthError('INVALID_CREDENTIALS', error?.message)
  }

  const uid = data.user.id
  invalidateSessionCache(uid)

  const sessionAccount = await loadSessionUser(uid)
  if (!sessionAccount) {
    await supabase.auth.signOut()
    await auditLoginFailed(input.identifier, account, 'USER_NOT_PROVISIONED', meta)
    throw new AuthError('USER_NOT_PROVISIONED', `supabase_uid=${uid}`)
  }

  if (sessionAccount.status !== 'active') {
    await supabase.auth.signOut()
    await emitAudit({
      organizationId: sessionAccount.organizationId,
      actorId: sessionAccount.id,
      actorRole: sessionAccount.roleName,
      action: 'login',
      targetType: 'users',
      targetId: sessionAccount.id,
      after: { result: 'failed', code: 'ACCOUNT_INACTIVE', status: sessionAccount.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })
    throw new AuthError('ACCOUNT_INACTIVE', `user=${sessionAccount.id}`)
  }

  // ผู้ใช้บริษัทไฟแนนซ์: บริษัทต้อง active (มติ PO 05/10/2569 O43 D5 · `97` §12) — ตรวจซ้ำทุก request ที่ยามพอร์ทัล
  if (isPortalOnlyUser(sessionAccount)) {
    const companyStatus = await loadCompanyStatus(sessionAccount.organizationId, sessionAccount.companyId)
    if (!isCompanyActive(companyStatus)) {
      await supabase.auth.signOut()
      await emitAudit({
        organizationId: sessionAccount.organizationId,
        actorId: sessionAccount.id,
        actorRole: sessionAccount.roleName,
        action: 'login',
        targetType: 'users',
        targetId: sessionAccount.id,
        after: { result: 'failed', code: 'COMPANY_SUSPENDED', company_id: sessionAccount.companyId, company_status: companyStatus },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      })
      throw new AuthError('COMPANY_SUSPENDED', `user=${sessionAccount.id} company=${sessionAccount.companyId ?? '-'}`)
    }
  }

  // เวลาเริ่ม session — ใช้คำนวณ timeout 24 ชม. (`05` §10)
  const now = new Date()
  await prisma.user.update({ where: { id: sessionAccount.id }, data: { lastLoginAt: now } })

  const user: SessionUser = { ...sessionAccount, loginAt: now.toISOString() }
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

  // ผู้ดูแลตั้ง/รีเซ็ตรหัสให้ → ไปหน้าเปลี่ยนรหัสก่อน (มติ PO 03/10/2569)
  const redirectTo = user.mustChangePassword === true ? CHANGE_PASSWORD_PATH : resolveLandingPath(user.roleGroup, user.roleName)
  return { user, redirectTo }
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

/**
 * ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง (`POST /api/auth/change-password` — มติ PO 03/10/2569)
 * บังคับใช้หลังผู้ดูแลตั้ง/รีเซ็ตรหัสให้ (`must_change_password`) และเปลี่ยนเองได้ทุกเมื่อ
 * ตั้งผ่าน service role ฝั่ง server แล้วล้างธงในธุรกรรมเดียวกับ audit · audit ไม่มีรหัสผ่าน
 *
 * Supabase เพิกถอน session เดิมทั้งหมดเมื่อรหัสเปลี่ยน ⇒ ต้อง sign in ใหม่ด้วยรหัสใหม่ทันที (cookie ใหม่ลง
 * response นี้) ผู้ใช้จึงเข้าระบบต่อได้เลย ไม่เด้งไปหน้า login (มติ PO 03/10/2569)
 */
export async function changeOwnPassword(
  user: SessionUser,
  input: { currentPassword: string; password: string },
  meta: RequestMeta,
): Promise<string> {
  // ยืนยันรหัสปัจจุบันก่อนเสมอ — session ที่ถูกขโมยไปเปลี่ยนรหัสยึดบัญชีไม่ได้
  const authEmail = await getAuthEmail(user.supabaseUid)
  if (authEmail === null || !(await verifyPassword(authEmail, input.currentPassword))) {
    throw new AuthError('INVALID_CREDENTIALS', `change-password current mismatch user=${user.id}`)
  }

  await setAuthPassword(user.supabaseUid, input.password)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { mustChangePassword: false, updatedBy: user.id } })
    await emitAudit(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.roleName,
        action: 'update',
        targetType: 'users',
        targetId: user.id,
        before: { must_change_password: user.mustChangePassword === true },
        after: { must_change_password: false, password_changed_by_self: true },
        // เปลี่ยนรหัสของตัวเอง ไม่ได้กระทบสิทธิ์ใคร — ระบุไว้ให้ trace ได้ว่าเป็นการกระทำของเจ้าของบัญชี
        reason: 'ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        diffOnly: false,
      },
      tx,
    )
  })

  invalidateSessionCache(user.supabaseUid)

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: input.password })
  // รหัสเปลี่ยนสำเร็จแล้ว — ถ้า sign in ใหม่ไม่ผ่าน (Supabase สะดุด) ให้ไปหน้า login แทนการโยน error ที่ทำให้เข้าใจผิด
  if (error) return LOGIN_PATH

  // เริ่มนับอายุ session 24 ชม. ใหม่จาก session นี้ (`05` §10)
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  return resolveLandingPath(user.roleGroup, user.roleName)
}
