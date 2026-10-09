import { PrismaClient } from '@/lib/generated/prisma/client'
import { auditLogImmutableExtension } from '@/lib/audit/immutable'
import { createPgAdapter } from '@/lib/prisma-adapter'

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
    // ต่อคิว query ต่อ connection — กัน DeprecationWarning ของ pg ใน $transaction (staging S-022)
    adapter: createPgAdapter(connectionString),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

  /**
   * `audit_logs` ห้าม UPDATE/DELETE เด็ดขาดแม้แต่ Superadmin (`02` §13 · `90` §17)
   * ชั้นนี้กันทางที่ผ่าน Prisma Client — ส่วน raw SQL กันด้วย trigger ระดับ DB
   * (migration `20260814091702_audit_logs_immutable`)
   */
  return client.$extends(auditLogImmutableExtension)
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined
}

let client: ExtendedPrismaClient | undefined

function getPrismaClient(): ExtendedPrismaClient {
  if (client) return client
  client = globalForPrisma.prisma ?? createPrismaClient()
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }
  return client
}

/**
 * สร้าง client แบบ lazy — ตอนเข้าถึง property ครั้งแรก ไม่ใช่ตอน import
 * โมดูลที่ import `prisma` เพื่อ export ฟังก์ชัน query จึงโหลดในเทสต์ unit ได้โดยไม่ต้องมี DB
 * (เดิม throw `ไม่พบ DATABASE_URL` ตั้งแต่โหลดโมดูล) · ถ้าเผลอ query จริงโดยไม่มี `DATABASE_URL`
 * ก็ยังล้มด้วย error เดิม ณ จุดที่ query
 * method ถูก bind กับ client จริง เพื่อให้ `this` ภายใน Prisma ไม่ชี้มาที่ Proxy
 */
export const prisma: ExtendedPrismaClient = new Proxy({} as ExtendedPrismaClient, {
  get(_target, prop) {
    const real = getPrismaClient()
    const value: unknown = Reflect.get(real, prop, real)
    return typeof value === 'function' ? value.bind(real) : value
  },
  has(_target, prop) {
    return Reflect.has(getPrismaClient(), prop)
  },
})
