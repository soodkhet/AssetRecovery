import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // `orchestrator/lib/*.test.mjs` = ยามของ parser PROGRESS.md — ต้องรันคู่กับเทสต์แอปเสมอ
    // (บั๊กที่มันกัน: parser ทิ้งแถวเงียบ ๆ จน dashboard โชว์ 100% ปลอม แล้ว orchestrator หยุดหยิบงาน)
    include: ['**/*.{test,spec}.{ts,tsx}', 'orchestrator/**/*.test.mjs'],
    exclude: ['node_modules/**', '.next/**', 'tools/**', 'reference/**', '_to_delete/**'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
