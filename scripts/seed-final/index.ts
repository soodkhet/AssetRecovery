import { prepareRuntime } from './runtime'

/**
 * seed-final — สคริปต์ seed scenario ของ Final Test (มติ U119 ข้อ 4 · U123 · U124)
 * SSOT ของข้อมูล = `uat/report/FINAL-coverage.md` · ลำดับใช้งานดู `scripts/seed-final/README.md`
 *
 *   pnpm seed:final [--reset --allow-immutable-reset] [--print-reset-sql] [--bootstrap-personas]
 *                   [--create-auth-users] [--with-storage] [--seed] [--verify] [--target=staging]
 *
 * ⚠️ ไม่โหลด `.env*` เอง — DATABASE_URL ต้องส่งมาจาก shell ชัดเจน (กันยิงผิดฐาน)
 * ⚠️ ปฏิเสธ host ที่ไม่ใช่ localhost เว้นแต่ `--target=staging` · ปฏิเสธ production เสมอ
 */

export interface CliFlags {
  reset: boolean
  allowImmutableReset: boolean
  printResetSql: boolean
  bootstrapPersonas: boolean
  createAuthUsers: boolean
  withStorage: boolean
  seed: boolean
  verify: boolean
  target: 'local' | 'staging'
}

function parseFlags(argv: readonly string[]): CliFlags {
  const known = new Set([
    '--reset',
    '--allow-immutable-reset',
    '--print-reset-sql',
    '--bootstrap-personas',
    '--create-auth-users',
    '--with-storage',
    '--seed',
    '--verify',
    '--target=staging',
    '--target=local',
  ])
  for (const arg of argv) {
    if (!known.has(arg)) throw new Error(`ไม่รู้จักตัวเลือก ${arg}`)
  }
  return {
    reset: argv.includes('--reset'),
    allowImmutableReset: argv.includes('--allow-immutable-reset'),
    printResetSql: argv.includes('--print-reset-sql'),
    bootstrapPersonas: argv.includes('--bootstrap-personas'),
    createAuthUsers: argv.includes('--create-auth-users'),
    withStorage: argv.includes('--with-storage'),
    seed: argv.includes('--seed'),
    verify: argv.includes('--verify'),
    target: argv.includes('--target=staging') ? 'staging' : 'local',
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function assertTarget(flags: CliFlags): string {
  const raw = process.env['DATABASE_URL']
  if (raw === undefined || raw === '') throw new Error('ไม่มี DATABASE_URL — ส่งจาก shell (สคริปต์ไม่โหลด .env เอง)')
  const url = new URL(raw)
  const isLocal = LOCAL_HOSTS.has(url.hostname)
  if (flags.target === 'local' && !isLocal) {
    throw new Error(`DATABASE_URL ชี้ host ${url.hostname} (ไม่ใช่เครื่องนี้) — ถ้าตั้งใจใช้ staging ให้สั่ง --target=staging`)
  }
  if (flags.target === 'staging') {
    if (isLocal) throw new Error('--target=staging แต่ DATABASE_URL เป็น localhost')
    if (/prod/i.test(raw) || process.env['VERCEL_ENV'] === 'production') {
      throw new Error('ปฏิเสธ: ดูเหมือนฐาน production')
    }
  }
  if (flags.bootstrapPersonas && !isLocal) throw new Error('--bootstrap-personas ใช้ได้บนเครื่อง (localhost) เท่านั้น')
  return `${url.hostname}${url.pathname}`
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  const where = assertTarget(flags)
  if (flags.createAuthUsers && flags.target === 'local' && process.env['SEED_FINAL_ALLOW_LOCAL_AUTH'] !== '1') {
    // บน dev บัญชี Auth อยู่บน Supabase cloud — สั่งจริงได้ แต่ต้องยืนยันด้วย env อีกชั้น (กันรันเผลอระหว่างพัฒนา)
    throw new Error('--create-auth-users ยิง Supabase Auth จริง — ตั้ง SEED_FINAL_ALLOW_LOCAL_AUTH=1 เพื่อยืนยัน')
  }
  prepareRuntime({ withStorage: flags.withStorage, realAuth: flags.createAuthUsers })
  console.log(`[seed-final] ฐาน: ${where} · target=${flags.target}`)

  const { runCli } = await import('./cli')
  await runCli(flags)
}

main().catch((error: unknown) => {
  console.error('[seed-final] ล้มเหลว:', error instanceof Error ? (error.stack ?? error.message) : error)
  process.exitCode = 1
})
