/**
 * SQL อ่านอย่างเดียวบนฐานที่ DATABASE_URL ชี้ (ใช้โดย `staging-prep.sh q "<SELECT …>"`) — ทรานแซกชัน READ ONLY
 * เขียนไม่ได้แม้ส่ง INSERT/UPDATE มา (Postgres ปฏิเสธ) · พิมพ์ผลเป็นตาราง JSON ต่อแถว · ไม่พิมพ์ connection
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/lib/generated/prisma/client'

async function main(): Promise<void> {
  const sql = process.argv[2]
  const url = process.env['DATABASE_URL']
  if (sql === undefined || sql.trim() === '') throw new Error('ใส่ SQL')
  if (url === undefined) throw new Error('ไม่มี DATABASE_URL')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  try {
    const rows = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      return tx.$queryRawUnsafe<Record<string, unknown>[]>(sql)
    })
    for (const row of rows) console.log(JSON.stringify(row, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)))
    console.log(`(${rows.length} แถว)`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('[q] ล้มเหลว:', error instanceof Error ? error.message.split('\n').slice(-3).join(' ') : error)
  process.exitCode = 1
})
