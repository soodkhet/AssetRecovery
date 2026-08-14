import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import noUnregisteredEvent from './tools/eslint-rules/no-unregistered-event.mjs'

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'orchestrator/**',
      'tools/**',
      'reference/**',
      'Project_info/**',
      '_to_delete/**',
      'lib/generated/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    plugins: {
      // กฎเฉพาะโปรเจกต์ (Phase 2.1) — ตัวกฎอยู่ `tools/eslint-rules/`
      assetrecovery: { rules: { 'no-unregistered-event': noUnregisteredEvent } },
    },
    rules: {
      // กติกา CLAUDE.md ข้อ 13 — TypeScript strict ห้าม any
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Rule 04 — ชื่อ event ต้องอยู่ในทะเบียน `lib/api/event-names.ts` (`45` §7)
      'assetrecovery/no-unregistered-event': 'error',
    },
  },
]

export default eslintConfig
