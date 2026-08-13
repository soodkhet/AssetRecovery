import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Next.js ใช้ `.env.local` เป็นไฟล์ env หลักของเครื่อง dev แต่ `dotenv/config` โหลดแค่ `.env`
// ⇒ ถ้าไม่โหลดเอง Prisma CLI จะไม่เห็น DATABASE_URL/DIRECT_URL แล้วฟ้อง
//    "The datasource.url property is required in your Prisma config file"
// `.env.local` ถูกโหลดทีหลังและ override ค่าเดิม (ตรงกับลำดับของ Next.js)
loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

/**
 * ค่าคอนฟิกของ Prisma CLI (migrate / db pull / seed) — Prisma 7 ย้าย datasource url ออกจาก schema.prisma มาที่นี่
 * ใช้ `DIRECT_URL` (ต่อตรง ไม่ผ่าน pooler) เพราะ migration ทำงานกับ connection pooler ไม่ได้
 * ส่วน runtime ของแอปใช้ `DATABASE_URL` (pooler) ผ่าน `lib/prisma.ts`
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
})
