/**
 * สำรองฐาน staging เป็น JSON (อ่านอย่างเดียว) — `pg_dump` 16 ของเครื่องใช้กับ server 17 ไม่ได้
 *   DATABASE_URL=… pnpm tsx uat/bin/staging-snapshot.ts <label>
 * ผล: uat/snapshots/staging-<label>-<เวลา>.json (gitignored) · พิมพ์แค่จำนวนตาราง/แถว — ไม่พิมพ์ connection
 * รูปแบบเดียวกับ `staging-pre-migrate-20261008.json` ({ takenAt, tables: { <ชื่อ>: rows[] } })
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/lib/generated/prisma/client'

async function main(): Promise<void> {
  const label = process.argv[2] ?? 'snapshot'
  if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('label ใช้ได้แค่ a-z 0-9 -')
  const raw = process.env['DATABASE_URL']
  if (raw === undefined || raw === '') throw new Error('ไม่มี DATABASE_URL')
  if (/prod/i.test(raw)) throw new Error('ปฏิเสธ: ดูเหมือนฐาน production')
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: raw }) })
  try {
    const tables = await db.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
    )
    const out: Record<string, unknown[]> = {}
    let rows = 0
    for (const { table_name: name } of tables) {
      const data = await db.$queryRawUnsafe<unknown[]>(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
      out[name] = data
      rows += data.length
    }
    const takenAt = new Date().toISOString()
    mkdirSync('uat/snapshots', { recursive: true })
    const file = `uat/snapshots/staging-${label}-${takenAt.slice(0, 19).replace(/[-:T]/g, '')}.json`
    const json = JSON.stringify({ takenAt, tables: out }, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))
    writeFileSync(file, json, { mode: 0o600 })
    const count = (t: string) => out[t]?.length ?? 0
    console.log(`[snapshot] ${file} · ${tables.length} ตาราง · ${rows} แถว · users=${count('users')} cases=${count('cases')} audit_logs=${count('audit_logs')}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('[snapshot] ล้มเหลว:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
