import { config as loadEnv } from 'dotenv'

/**
 * ตั้งค่า Supabase Storage ต่อ environment — สร้าง bucket private 4 ตัว + **ถอด policy ที่เปิดให้ผู้ใช้ login แล้ว**
 * รันซ้ำได้ ผลเท่าเดิม (idempotent) · รายละเอียด/ทางเลือกแบบกดเองใน Dashboard: `uat/STORAGE_SETUP.md`
 *
 *   pnpm storage:setup --expect-ref <project-ref> [--env .env.local] [--db-env .env.staging] [--dry-run]
 *
 * - `--env`        ไฟล์ที่มี `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (สร้าง bucket ผ่าน Storage API)
 * - `--db-env`     ไฟล์ที่มี `DIRECT_URL` (หรือ `DATABASE_URL`) ของ Postgres ใน project เดียวกัน (แก้ policy บน `storage.objects`)
 *                  ไม่ส่ง = ใช้ไฟล์เดียวกับ `--env`
 * - `--expect-ref` บังคับ — ต้องตรงกับ project ref ใน URL ไม่งั้นปฏิเสธ (กันรันผิด project แบบที่เคยสับสน staging กับ project อื่น)
 * - `--dry-run`    ตรวจไฟล์ env + ref แล้ว **พิมพ์แผน/SQL ที่จะรันเท่านั้น** — ไม่ต่อ Storage API ไม่ต่อ DB
 *
 * นโยบาย (BUG-143 · DEC-014): bucket ทั้ง 4 ตัว **ไม่มี policy ให้ role `authenticated`/`anon` เลย** — เหลือแค่
 * service role (ข้าม RLS อยู่แล้ว) · browser อัปโหลด/เปิดดูได้ทางเดียวคือโทเคน/URL ชั่วคราวที่ API ออกให้หลังตรวจ
 * `requirePermission` + scope (`/api/storage/upload-url`, `/api/storage/download-url` — DEC-002)
 * ของเดิมเคยเปิด SELECT/INSERT/UPDATE บน `case-documents` ให้ `authenticated` ทุกคน ⇒ สคริปต์นี้ DROP ทิ้ง
 * และรายงาน policy อื่นที่ยังเหลือบน `storage.objects` (ไม่ลบเอง เพราะไม่ใช่ชื่อที่สคริปต์สร้าง)
 *
 * ⚠️ ไม่ได้แตะตารางของแอป (schema `public` เป็นของ Prisma — Rule 02) แตะแค่ schema `storage` ของ Supabase
 */

export const BUCKETS = ['case-documents', 'payment-files', 'accounting-packs', 'report-exports'] as const

/** policy ที่สคริปต์รุ่นก่อน (ก่อน BUG-143) สร้างไว้ — ต้องไม่เหลือ */
export const LEGACY_POLICY_NAMES = ['case-docs read', 'case-docs insert', 'case-docs update'] as const

/** SQL ที่รันในโหมดจริง (และพิมพ์ในโหมด `--dry-run`) — `IF EXISTS` ⇒ รันซ้ำได้ */
export function revokePolicySql(): string[] {
  return LEGACY_POLICY_NAMES.map((name) => `DROP POLICY IF EXISTS "${name}" ON storage.objects;`)
}

/**
 * query ตรวจหลังรัน: **ทุก** policy บน `storage.objects` (ควรได้ 0 แถว) — project นี้ใช้ Storage เฉพาะ bucket ของระบบ
 * และ policy แบบ `USING (true)` ไม่อ้างชื่อ bucket แต่เปิดทุก bucket ได้ จึงไม่กรองด้วยชื่อ bucket
 */
export const REMAINING_POLICIES_SQL = `SELECT policyname, cmd, roles::text AS roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;`

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function readEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}
  const result = loadEnv({ path, processEnv: env, quiet: true })
  if (result.error) throw new Error(`อ่าน ${path} ไม่ได้: ${result.error.message}`)
  return env
}

async function main(): Promise<void> {
  const expectRef = arg('expect-ref')
  if (!expectRef) throw new Error('ต้องระบุ --expect-ref <project-ref> เสมอ')
  const dryRun = flag('dry-run')
  const envFile = arg('env') ?? '.env.local'
  const env = readEnv(envFile)
  const dbEnv = readEnv(arg('db-env') ?? envFile)

  const url = env['NEXT_PUBLIC_SUPABASE_URL']
  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !serviceRoleKey) throw new Error(`${envFile} ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY`)
  const ref = new URL(url).hostname.split('.')[0]
  if (ref !== expectRef) throw new Error(`project ref ใน ${envFile} คือ "${ref}" ไม่ตรงกับ --expect-ref "${expectRef}" — ยกเลิก`)

  const dbUrl = dbEnv['DIRECT_URL'] ?? dbEnv['DATABASE_URL']
  if (!dbUrl) throw new Error('ไฟล์ --db-env ต้องมี DIRECT_URL หรือ DATABASE_URL')
  if (!dbUrl.includes(ref)) throw new Error(`DB URL ไม่ได้ชี้ project "${ref}" — ยกเลิก (กัน policy ไปลงผิด project)`)

  if (dryRun) {
    console.log(`[dry-run] project ${ref} — ไม่มีการเชื่อมต่อใด ๆ`)
    console.log(`[dry-run] Storage API: สร้าง bucket ที่ยังไม่มีแบบ private → ${BUCKETS.join(', ')}`)
    console.log('[dry-run] (bucket ที่มีอยู่แล้วแต่เป็น public = หยุดทันที ให้แก้เป็น private ด้วยมือก่อน)')
    console.log('[dry-run] SQL ที่จะรันใน transaction เดียว:')
    console.log(['BEGIN;', ...revokePolicySql(), 'COMMIT;'].join('\n'))
    console.log('[dry-run] หลังรันจะตรวจด้วย (ควรได้ 0 แถว):')
    console.log(REMAINING_POLICIES_SQL)
    return
  }

  // 1) bucket
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const { data: existing, error: listError } = await supabase.storage.listBuckets()
  if (listError) throw new Error(`listBuckets: ${listError.message}`)
  for (const name of BUCKETS) {
    const found = existing.find((b) => b.name === name)
    if (found) {
      if (found.public) throw new Error(`bucket ${name} มีอยู่แล้วแต่เป็น public — ต้องแก้เป็น private ด้วยมือก่อน`)
      console.log(`bucket ${name}: มีอยู่แล้ว (private)`)
      continue
    }
    const { error } = await supabase.storage.createBucket(name, { public: false })
    if (error) throw new Error(`createBucket ${name}: ${error.message}`)
    console.log(`bucket ${name}: สร้างแล้ว (private)`)
  }

  // 2) ถอด policy ของผู้ใช้ login แล้ว (BUG-143)
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { PrismaClient } = await import('@/lib/generated/prisma/client')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) })
  try {
    await prisma.$transaction(revokePolicySql().map((sql) => prisma.$executeRawUnsafe(sql)))
    console.log(`policy เดิม (${LEGACY_POLICY_NAMES.join(', ')}): ถอดแล้ว/ไม่มีอยู่แล้ว`)

    const remaining = await prisma.$queryRawUnsafe<Array<{ policyname: string; cmd: string; roles: string }>>(
      REMAINING_POLICIES_SQL,
    )
    if (remaining.length === 0) {
      console.log('ตรวจแล้ว: ไม่มี policy เหลือบน storage.objects')
    } else {
      console.warn('⚠️ ยังมี policy บน storage.objects (อาจเปิด bucket ของระบบให้ผู้ใช้ทั่วไป) — ตรวจแล้วลบด้วยมือถ้าไม่ได้ตั้งใจ:')
      for (const row of remaining) {
        console.warn(`  - "${row.policyname}" ${row.cmd} ${row.roles} → DROP POLICY "${row.policyname}" ON storage.objects;`)
      }
      process.exitCode = 2
    }
  } finally {
    await prisma.$disconnect()
  }
  console.log(`เสร็จ — project ${ref}`)
}

// รันเฉพาะเมื่อเรียกเป็นสคริปต์ (เทสต์ import ค่าคงที่/SQL ได้โดยไม่เริ่มทำงาน)
if (process.argv[1]?.includes('setup-storage')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
