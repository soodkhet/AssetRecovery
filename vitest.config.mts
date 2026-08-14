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

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // `orchestrator/lib/*.test.mjs` = ยามของ parser PROGRESS.md — ต้องรันคู่กับเทสต์แอปเสมอ
    // (บั๊กที่มันกัน: parser ทิ้งแถวเงียบ ๆ จน dashboard โชว์ 100% ปลอม แล้ว orchestrator หยุดหยิบงาน)
    include: ['**/*.{test,spec}.{ts,tsx}', 'orchestrator/**/*.test.mjs'],
    exclude: ['node_modules/**', '.next/**', 'tools/**', 'reference/**', '_to_delete/**'],
    env: testDatabaseUrl(),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
