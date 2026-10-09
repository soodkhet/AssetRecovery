import { PrismaClient } from '@/lib/generated/prisma/client'
import type { SessionUser } from '@/lib/auth/types'
import { createPgAdapter } from '@/lib/prisma-adapter'

/** องค์กรเดียวของระบบ (`prisma/seed.ts` · `02` §12) */
export const ORG_ID = '00000000-0000-0000-0000-000000000001'

let raw: PrismaClient | null = null

/**
 * client ดิบสำหรับ reset / อ่านเพื่อตรวจ / หา id — **ไม่ใช้เขียนข้อมูลธุรกิจ** (ข้อมูลธุรกิจเขียนผ่าน service ใน lib/ เท่านั้น)
 * ข้อยกเว้นที่เขียนตรงระบุไว้ใน README หัวข้อ "สิ่งที่สร้างผ่าน service ไม่ได้"
 */
export function rawDb(): PrismaClient {
  if (raw === null) {
    const connectionString = process.env['DATABASE_URL']
    if (connectionString === undefined) throw new Error('ไม่มี DATABASE_URL')
    raw = new PrismaClient({ adapter: createPgAdapter(connectionString) })
  }
  return raw
}

export const meta = { ipAddress: null, userAgent: 'seed-final' }

const sessions = new Map<string, SessionUser>()

/** session จริงของ persona (โหลด role/capabilities/scope จาก DB ด้วยฟังก์ชันเดียวกับ login) */
export async function as(username: string): Promise<SessionUser> {
  const cached = sessions.get(username)
  if (cached !== undefined) return cached
  const user = await rawDb().user.findFirst({
    where: { organizationId: ORG_ID, username, deletedAt: null },
    select: { supabaseUid: true },
  })
  if (user === null || user.supabaseUid === null) {
    throw new Error(`ไม่พบผู้ใช้ ${username} (หรือยังไม่มีบัญชี Auth) — รัน --bootstrap-personas (เครื่อง) / --create-auth-users ก่อน`)
  }
  const { loadSessionUser } = await import('@/lib/auth/session')
  const session = await loadSessionUser(user.supabaseUid)
  if (session === null) throw new Error(`โหลด session ของ ${username} ไม่ได้`)
  sessions.set(username, session)
  return session
}

/** ล้าง cache หลังเปลี่ยนสังกัดทีม/บริษัท (scope คำนวณใหม่) */
export function forgetSessions(): void {
  sessions.clear()
}

export async function ctx(username: string, extra: { reason?: string } = {}) {
  return { actor: await as(username), meta, ...extra }
}

export async function userId(username: string): Promise<string> {
  return (await as(username)).id
}
