import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { auditLogImmutableExtension } from '@/lib/audit/immutable'

/**
 * Prisma client singleton — ทุก data access ของข้อมูลธุรกิจต้องผ่านที่นี่ (DEC-001/002)
 * dev/HMR สร้าง client ซ้ำจน connection หมด จึงเก็บไว้บน globalThis
 *
 * Prisma 7 ต่อ DB ผ่าน driver adapter: runtime ใช้ `DATABASE_URL` (Supabase connection pooler)
 * ส่วน migration ใช้ `DIRECT_URL` ผ่าน `prisma.config.ts`
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('[prisma] ไม่พบ DATABASE_URL — ดู .env.example')
  }
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

  /**
   * `audit_logs` ห้าม UPDATE/DELETE เด็ดขาดแม้แต่ Superadmin (`02` §13 · `90` §17)
   * ชั้นนี้กันทางที่ผ่าน Prisma Client — ส่วน raw SQL กันด้วย trigger ระดับ DB
   * (migration `20260814091702_audit_logs_immutable`)
   */
  return client.$extends(auditLogImmutableExtension)
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
