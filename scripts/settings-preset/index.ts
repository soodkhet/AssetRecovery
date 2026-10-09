import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * settings-preset — ค่าตั้งเริ่มต้นแบบไฟล์ (บันทึก/เรียกใช้ภายหลัง) · มติผู้ใช้ 10/10/2569
 *
 *   pnpm settings:preset --apply [--preset=thai-standard] [--only=vatRates,taxProfiles] [--dry-run] [--target=staging]
 *   pnpm settings:preset --export=<ไฟล์.json> [--target=staging]     ← เก็บค่าตั้งปัจจุบันเป็น preset ไว้ใช้ภายหลัง
 *
 * - เขียนผ่าน service ใน `lib/settings/**` (Zod + audit + เหตุผล) เหมือนผู้ดูแลกดหน้าจอ — ไม่เขียนตารางตรง
 * - รันซ้ำได้: แถวที่มีอยู่แล้ว (ชื่อ/วันที่มีผลตรงกัน) ข้าม · ค่าตั้งเดี่ยว (นโยบาย/SLA/ระยะเก็บ) ตั้งทับ
 * - ⚠️ ไม่โหลด `.env*` เอง — DATABASE_URL มาจาก shell · ปฏิเสธ host นอกเครื่องเว้นแต่ `--target=staging` · ปฏิเสธ production
 * - preset = ไฟล์ใน `scripts/settings-preset/presets/<ชื่อ>.json` หรือ path ที่ระบุตรง ๆ
 */

const ORG_ID = '00000000-0000-0000-0000-000000000001'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

interface Flags {
  apply: boolean
  exportTo: string | null
  preset: string
  only: Set<string> | null
  dryRun: boolean
  target: 'local' | 'staging'
}

function parseFlags(argv: readonly string[]): Flags {
  const value = (name: string) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null
  for (const arg of argv) {
    if (!/^--(apply|dry-run|target=(staging|local)|preset=.+|only=.+|export=.+)$/.test(arg)) throw new Error(`ไม่รู้จักตัวเลือก ${arg}`)
  }
  const only = value('only')
  const flags: Flags = {
    apply: argv.includes('--apply'),
    exportTo: value('export'),
    preset: value('preset') ?? 'thai-standard',
    only: only === null ? null : new Set(only.split(',')),
    dryRun: argv.includes('--dry-run'),
    target: argv.includes('--target=staging') ? 'staging' : 'local',
  }
  if (flags.apply === (flags.exportTo !== null)) throw new Error('ระบุ --apply หรือ --export=<ไฟล์> อย่างใดอย่างหนึ่ง')
  return flags
}

function assertTarget(flags: Flags): string {
  const raw = process.env['DATABASE_URL']
  if (raw === undefined || raw === '') throw new Error('ไม่มี DATABASE_URL — ส่งจาก shell (สคริปต์ไม่โหลด .env เอง)')
  const url = new URL(raw)
  const isLocal = LOCAL_HOSTS.has(url.hostname)
  if (flags.target === 'local' && !isLocal) throw new Error(`DATABASE_URL ชี้ ${url.hostname} — ถ้าตั้งใจใช้ staging ให้สั่ง --target=staging`)
  if (flags.target === 'staging' && isLocal) throw new Error('--target=staging แต่ DATABASE_URL เป็น localhost')
  if (/prod/i.test(raw) || process.env['VERCEL_ENV'] === 'production') throw new Error('ปฏิเสธ: ดูเหมือนฐาน production')
  return `${url.hostname}${url.pathname}`
}

function presetPath(name: string): string {
  return name.endsWith('.json') ? name : join(__dirname, 'presets', `${name}.json`)
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  const where = assertTarget(flags)
  // adapter-pg สมมติ session เป็น UTC (เหมือน seed-final) — กันค่าวันที่เพี้ยน 7 ชม.
  if (process.env['PGOPTIONS'] === undefined) process.env['PGOPTIONS'] = '-c TimeZone=UTC'
  const superadmin = process.env['SETTINGS_PRESET_SUPERADMIN'] ?? (flags.target === 'staging' ? 'superadmin' : 'admin')
  console.log(`[settings-preset] ฐาน: ${where} · target=${flags.target} · ผู้ตั้ง=${superadmin}`)

  const { createContext } = await import('./context')
  const ctx = await createContext(ORG_ID, superadmin)
  try {
    if (flags.exportTo !== null) {
      const { exportPreset } = await import('./export')
      const preset = await exportPreset(ctx)
      writeFileSync(flags.exportTo, `${JSON.stringify(preset, null, 2)}\n`)
      console.log(`[export] เขียน ${flags.exportTo} แล้ว — ใช้ภายหลังด้วย --apply --preset=${flags.exportTo}`)
      return
    }
    const { applyPreset } = await import('./apply')
    const preset: unknown = JSON.parse(readFileSync(presetPath(flags.preset), 'utf8'))
    const report = await applyPreset(ctx, preset, { only: flags.only, dryRun: flags.dryRun })
    for (const line of report) console.log(line)
  } finally {
    await ctx.close()
  }
}

main().catch((error: unknown) => {
  console.error('[settings-preset] ล้มเหลว:', error instanceof Error ? (error.stack ?? error.message) : error)
  process.exitCode = 1
})
