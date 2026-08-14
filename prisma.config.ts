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
/**
 * `PRISMA_USE_TEST_DB=1` → ชี้ CLI ไปที่ DB ทดสอบ (`TEST_DATABASE_URL` = `assetrecovery_test` บนเครื่อง/CI)
 * ใช้กับ `pnpm db:deploy:test` ก่อนรันเทสต์ที่แตะ DB จริง (Rule 07 — ห้ามยิง staging DB ในเทสต์)
 * ตัวแปรนี้ไม่มีใน `.env*` จึงไม่ถูก override โดย `loadEnv` ข้างบน
 */
const useTestDb = process.env['PRISMA_USE_TEST_DB'] === '1'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: useTestDb ? process.env['TEST_DATABASE_URL'] : (process.env['DIRECT_URL'] ?? process.env['DATABASE_URL']),
  },
})
