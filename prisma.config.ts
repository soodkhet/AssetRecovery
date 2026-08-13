import 'dotenv/config'
import { defineConfig } from 'prisma/config'

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
