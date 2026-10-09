import type { SessionUser } from '@/lib/auth/types'

/** บริบทของ preset — ผู้ตั้ง (Superadmin) + client ของแอป (อ่านเพื่อตรวจของเดิม · เขียนผ่าน service เท่านั้น) */
export interface PresetContext {
  organizationId: string
  actor: SessionUser
  db: typeof import('@/lib/prisma').prisma
  /** บริบท mutation ของ service ค่าตั้ง (`reason` บังคับ — ลง audit) */
  mutation(reason: string): { actor: SessionUser; meta: { ipAddress: null; userAgent: string }; reason: string }
  close(): Promise<void>
}

export async function createContext(organizationId: string, username: string): Promise<PresetContext> {
  const { prisma } = await import('@/lib/prisma')
  const user = await prisma.user.findFirst({
    where: { organizationId, username, deletedAt: null },
    select: { supabaseUid: true },
  })
  if (user?.supabaseUid == null) throw new Error(`ไม่พบผู้ใช้ ${username} ที่มีบัญชี Auth — ตั้ง SETTINGS_PRESET_SUPERADMIN เป็น Superadmin ของฐานนี้`)
  const { loadSessionUser } = await import('@/lib/auth/session')
  const actor = await loadSessionUser(user.supabaseUid)
  if (actor === null || !actor.isSuperadmin) throw new Error(`${username} ไม่ใช่ Superadmin — ค่าตั้งต้องตั้งโดย Superadmin`)
  const meta = { ipAddress: null, userAgent: 'settings-preset' }
  return {
    organizationId,
    actor,
    db: prisma,
    mutation: (reason) => ({ actor, meta, reason: `${reason} (settings-preset)` }),
    close: () => prisma.$disconnect(),
  }
}
