import { AuthError } from '@/lib/auth/errors'
import { isSessionExpired } from '@/lib/auth/permission'
import { resolveScope } from '@/lib/auth/scope'
import { getCachedSession, setCachedSession } from '@/lib/auth/session-cache'
import { SUPERADMIN_ROLE_NAME } from '@/lib/auth/constants'
import type { SessionUser } from '@/lib/auth/types'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import type { CapabilityAccessLevel } from '@/lib/generated/prisma/enums'

/**
 * Session ฝั่ง server = Supabase JWT (ตัวตน) + user/role/scope จาก DB (สิทธิ์) — แยกกันเสมอ (DEC-002)
 * ห้ามใช้ข้อมูลจาก JWT claim เป็นสิทธิ์ · ห้ามใช้ Supabase RLS
 */

/** โหลด user + role + capabilities + scope จาก DB (ข้ามได้ด้วย session cache) */
export async function loadSessionUser(supabaseUid: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { supabaseUid },
    select: {
      id: true,
      organizationId: true,
      supabaseUid: true,
      email: true,
      fullName: true,
      status: true,
      teamId: true,
      companyId: true,
      lastLoginAt: true,
      deletedAt: true,
      role: {
        select: {
          id: true,
          name: true,
          roleGroup: true,
          capabilities: {
            select: { accessLevel: true, capability: { select: { code: true } } },
          },
        },
      },
      managedTeams: { select: { teamId: true } },
      supervisedTeams: { select: { id: true } },
    },
  })

  if (!user || user.deletedAt !== null || user.supabaseUid === null) return null

  const capabilities: Record<string, CapabilityAccessLevel> = {}
  for (const row of user.role.capabilities) {
    capabilities[row.capability.code] = row.accessLevel
  }

  const isSuperadmin = user.role.name === SUPERADMIN_ROLE_NAME && user.role.roleGroup === 'system'

  return {
    id: user.id,
    organizationId: user.organizationId,
    supabaseUid: user.supabaseUid,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    roleId: user.role.id,
    roleName: user.role.name,
    roleGroup: user.role.roleGroup,
    isSuperadmin,
    teamId: user.teamId,
    companyId: user.companyId,
    capabilities,
    scope: resolveScope({
      userId: user.id,
      roleGroup: user.role.roleGroup,
      roleName: user.role.name,
      teamId: user.teamId,
      companyId: user.companyId,
      managedTeamIds: user.managedTeams.map((t) => t.teamId),
      supervisedTeamIds: user.supervisedTeams.map((t) => t.id),
    }),
    loginAt: user.lastLoginAt?.toISOString() ?? null,
  }
}

/** อ่าน supabase uid ของ request ปัจจุบัน (verify JWT กับ Supabase Auth) — null = ยังไม่ได้ login */
export async function getAuthenticatedUid(): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

/**
 * session ปัจจุบัน — `null` = ยังไม่ได้ login (ให้ caller redirect ไปหน้า login)
 * โยน `AuthError` เมื่อ login แล้วแต่ใช้งานต่อไม่ได้: บัญชีไม่ active / ไม่ถูกผูกกับระบบ / session หมดอายุ
 */
export async function getSessionUser(now: Date = new Date()): Promise<SessionUser | null> {
  const uid = await getAuthenticatedUid()
  if (uid === null) return null

  const cached = getCachedSession(uid, now.getTime())
  const sessionUser = cached ?? (await loadSessionUser(uid))
  if (!sessionUser) throw new AuthError('USER_NOT_PROVISIONED', `supabase_uid=${uid}`)
  if (!cached) setCachedSession(uid, sessionUser, now.getTime())

  if (sessionUser.status !== 'active') throw new AuthError('ACCOUNT_INACTIVE', `user=${sessionUser.id}`)
  if (isSessionExpired(sessionUser.loginAt, now)) throw new AuthError('SESSION_EXPIRED', `user=${sessionUser.id}`)

  return sessionUser
}

/** session ปัจจุบันแบบบังคับ — ไม่มี session = โยน `UNAUTHENTICATED` (401) */
export async function requireSession(now: Date = new Date()): Promise<SessionUser> {
  const user = await getSessionUser(now)
  if (!user) throw new AuthError('UNAUTHENTICATED')
  return user
}
