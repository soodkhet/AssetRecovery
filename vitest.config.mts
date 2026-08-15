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
    env: testDatabaseUrl(),
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          env: testDatabaseUrl(),
          // `orchestrator/lib/*.test.mjs` = ยามของ parser PROGRESS.md + run lock — ต้องรันคู่กับเทสต์แอปเสมอ
          // (บั๊กที่มันกัน: parser ทิ้งแถวเงียบ ๆ จน dashboard โชว์ 100% ปลอม · orchestrator หยิบงานซ้ำ 2 session)
          include: ['**/*.{test,spec}.{ts,tsx}', 'orchestrator/**/*.test.mjs'],
          exclude: ['node_modules/**', '.next/**', 'tools/**', 'reference/**', '_to_delete/**', DB_TESTS],
          alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
        },
      },
      {
        test: {
          name: 'db',
          globals: true,
          environment: 'node',
          env: testDatabaseUrl(),
          include: [DB_TESTS],
          exclude: ['node_modules/**', '.next/**', 'tools/**', 'reference/**', '_to_delete/**'],
          alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
          // ทีละไฟล์เท่านั้น — DB ตัวเดียวกัน (ดูหมายเหตุด้านบน)
          fileParallelism: false,
          poolOptions: { forks: { singleFork: true } },
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
