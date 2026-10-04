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
      // git worktree ของ session อื่น (`.claude/worktrees/*`) มีสำเนาทั้ง repo + node_modules
      '.claude/**',
      'lib/generated/**',
      // สคริปต์ชั่วคราวที่ role agent ของ UAT เขียนต่อรอบ (uat/bin/r1/, r2/ …) — เครื่องมือกลาง uat/bin/*.mjs ยังถูก lint
      'uat/bin/r*/**',
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
  {
    // พอร์ทัลบริษัทไฟแนนซ์ = GET เท่านั้น (`97` §11 · Rule 03 · มติ PO 05/10/2569 U6/O43) — คู่กับ
    // `lib/portal/route-guard.test.ts` ที่สแกนไฟล์ route จริง · HEAD/OPTIONS ให้ Next ทำเอง ห้ามเขียนเพิ่ม
    files: ['app/api/portal/**/*.ts', 'app/api/portal/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'ExportNamedDeclaration > FunctionDeclaration[id.name=/^(POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]',
          message: 'พอร์ทัล (/api/portal/*) อ่านอย่างเดียว — export ได้เฉพาะ GET',
        },
        {
          selector:
            'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[id.name=/^(POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]',
          message: 'พอร์ทัล (/api/portal/*) อ่านอย่างเดียว — export ได้เฉพาะ GET',
        },
        {
          selector: 'ExportSpecifier[exported.name=/^(POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/]',
          message: 'พอร์ทัล (/api/portal/*) อ่านอย่างเดียว — export ได้เฉพาะ GET',
        },
        {
          selector: 'ExportAllDeclaration',
          message: 'พอร์ทัล (/api/portal/*) ห้าม `export *` — ต้องเห็นชัดว่า export แค่ GET',
        },
      ],
    },
  },
]

export default eslintConfig
