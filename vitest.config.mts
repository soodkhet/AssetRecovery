import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vitest/config'

/**
 * ส่งต่อ **เฉพาะ** `TEST_DATABASE_URL` จาก `.env.local` เข้าเทสต์ (Rule 07)
 * จงใจไม่โหลด env ทั้งไฟล์: ถ้า `DATABASE_URL` หลุดเข้ามา เทสต์ที่ import `lib/prisma` จะเผลอ
 * ต่อ DB dev/staging จริงแทนที่จะล้มให้เห็น (กับดักที่บันทึกไว้ใน REUSE_INDEX)
 */
function testDatabaseUrl(): Record<string, string> {
  const fromShell = process.env.TEST_DATABASE_URL
  if (fromShell) return { TEST_DATABASE_URL: fromShell }

  const parsed = loadEnv({ path: '.env.local', processEnv: {} }).parsed ?? {}
  const url = parsed.TEST_DATABASE_URL
  return url ? { TEST_DATABASE_URL: url } : {}
}

/**
 * บังคับ session `TimeZone = UTC` ให้ทุก connection ของเทสต์ (node-pg อ่าน `PGOPTIONS`)
 *
 * `@prisma/adapter-pg` สมมติว่า session เป็น UTC: เขียน `Date` เป็นสตริง UTC **ไม่มี offset** และตอนอ่าน
 * `timestamptz` ก็ตัด offset ที่ server ส่งมาทิ้งแล้วแปะ `+00:00` แทน ⇒ ถ้า Postgres ตั้ง `TimeZone`
 * เป็นอย่างอื่น (Postgres บนเครื่อง dev ที่ initdb เอา timezone ของเครื่อง = `Asia/Bangkok`) ทุกค่าที่ Prisma
 * เขียนจะเพี้ยนไป 7 ชม. และเทสต์ที่เทียบกับ `NOW()` ใน raw SQL หรือนับวันจะพังแบบขึ้นกับเวลาที่รัน
 * Supabase + Postgres ใน CI เป็น UTC อยู่แล้ว — ตรงนี้ทำให้เครื่อง dev ได้ผลเหมือน production
 */
function testEnv(): Record<string, string> {
  return { ...testDatabaseUrl(), PGOPTIONS: '-c TimeZone=UTC' }
}

const DB_TESTS = '**/*.db.test.ts'

/**
 * ⚠️ `*.db.test.ts` ทุกไฟล์ยิง **Postgres ตัวเดียวกัน** และ reset ด้วย `DELETE ... WHERE
 * organization_id = ...` ของตัวเอง — ถึงจะแยก `ORG_ID` กันคนละไฟล์ แต่การรัน **ขนานกัน**
 * ทำให้ reset ของไฟล์หนึ่งไปชนกับ transaction ที่อีกไฟล์กำลังเขียนค้างอยู่ (เห็นเป็น FK error
 * `travel_origins_assignment_id_fkey` / `CASE_NOT_FOUND` แบบสุ่มในไฟล์ที่ไม่ได้แก้อะไรเลย)
 *
 * ⇒ แยกเป็น project ต่างหากแล้วบังคับรัน **ทีละไฟล์** (`singleFork`) · เทสต์ที่ไม่แตะ DB
 * ยังขนานเต็มที่เหมือนเดิม เวลารวมจึงไม่ต่างกันในทางปฏิบัติ
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: testEnv(),
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          env: testEnv(),
          // `orchestrator/lib/*.test.mjs` = ยามของ parser PROGRESS.md + run lock — ต้องรันคู่กับเทสต์แอปเสมอ
          // (บั๊กที่มันกัน: parser ทิ้งแถวเงียบ ๆ จน dashboard โชว์ 100% ปลอม · orchestrator หยิบงานซ้ำ 2 session)
          include: ['**/*.{test,spec}.{ts,tsx}', 'orchestrator/**/*.test.mjs'],
          exclude: ['node_modules/**', '.next/**', 'tools/**', 'reference/**', '_to_delete/**', '.claude/**', DB_TESTS],
          alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
        },
      },
      {
        test: {
          name: 'db',
          globals: true,
          environment: 'node',
          env: testEnv(),
          include: [DB_TESTS],
          exclude: ['node_modules/**', '.next/**', 'tools/**', 'reference/**', '_to_delete/**', '.claude/**'],
          alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
          // ทีละไฟล์เท่านั้น — DB ตัวเดียวกัน (ดูหมายเหตุด้านบน)
          // `poolOptions` ถูกถอดออกใน vitest 4 แล้ว — `fileParallelism: false` พอสำหรับกันชนกันเอง
          fileParallelism: false,
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
