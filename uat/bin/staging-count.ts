/** อ่านอย่างเดียว: ผู้ใช้/จำนวนเคสบนฐานที่ DATABASE_URL ชี้ (ใช้โดย staging-prep.sh check) — ไม่พิมพ์ connection */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/lib/generated/prisma/client'

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL']
  if (url === undefined) throw new Error('ไม่มี DATABASE_URL')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  try {
    const users = await db.user.findMany({
      select: { username: true, deletedAt: true, status: true, mustChangePassword: true, supabaseUid: true },
      orderBy: { username: 'asc' },
    })
    const tag = (u: (typeof users)[number]) =>
      `${u.username}${u.deletedAt ? '(ลบ)' : u.status !== 'active' ? `(${u.status})` : ''}${u.mustChangePassword ? '*' : ''}${u.supabaseUid ? '' : '(ไม่มี Auth)'}`
    console.log(`users ${users.length}: ${users.map(tag).join(' ')}`)
    console.log(`cases ${await db.case.count()} · audit_logs ${await db.auditLog.count()} · vat_rate_history ${await db.vatRateHistory.count()}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('[count] ล้มเหลว:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
