import { config as loadEnv } from 'dotenv'

/**
 * ตั้งค่า Supabase Storage ต่อ environment — สร้าง bucket private 4 ตัว + policy ของ `case-documents`
 * ทำครั้งเดียวต่อ project (รันซ้ำได้ ผลเท่าเดิม) · รายละเอียด/ทางเลือกแบบกดเองใน Dashboard: `uat/STORAGE_SETUP.md`
 *
 *   pnpm storage:setup --expect-ref <project-ref> [--env .env.local] [--db-env .env.staging]
 *
 * - `--env`     ไฟล์ที่มี `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (สร้าง bucket ผ่าน Storage API)
 * - `--db-env`  ไฟล์ที่มี `DIRECT_URL` (หรือ `DATABASE_URL`) ของ Postgres ใน project เดียวกัน (สร้าง policy บน `storage.objects`)
 *               ไม่ส่ง = ใช้ไฟล์เดียวกับ `--env`
 * - `--expect-ref` บังคับ — ต้องตรงกับ project ref ใน URL ไม่งั้นปฏิเสธ (กันรันผิด project แบบที่เคยสับสน staging กับ project อื่น)
 *
 * Policy เปิดแค่ "ผู้ใช้ที่ login แล้ว" อ่าน/อัปโหลด/อัปเดต (upsert เอกสารล็อต) ใน `case-documents` —
 * สิทธิ์จริงตรวจที่ API layer (DEC-002) · ไม่เปิด DELETE · อีก 3 bucket เขียนจาก server ด้วย service role จึงไม่ต้องมี policy
 * ⚠️ ไม่ได้แตะตารางของแอป (schema `public` เป็นของ Prisma — Rule 02) แตะแค่ schema `storage` ของ Supabase
 */

const BUCKETS = ['case-documents', 'payment-files', 'accounting-packs', 'report-exports'] as const

const CASE_DOCUMENT_POLICIES: ReadonlyArray<{ name: string; command: 'SELECT' | 'INSERT' | 'UPDATE' }> = [
  { name: 'case-docs read', command: 'SELECT' },
  { name: 'case-docs insert', command: 'INSERT' },
  { name: 'case-docs update', command: 'UPDATE' },
]

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function readEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}
  const result = loadEnv({ path, processEnv: env, quiet: true })
  if (result.error) throw new Error(`อ่าน ${path} ไม่ได้: ${result.error.message}`)
  return env
}

function policySql(name: string, command: 'SELECT' | 'INSERT' | 'UPDATE'): string {
  const clause =
    command === 'INSERT'
      ? `WITH CHECK (bucket_id = 'case-documents')`
      : command === 'UPDATE'
        ? `USING (bucket_id = 'case-documents') WITH CHECK (bucket_id = 'case-documents')`
        : `USING (bucket_id = 'case-documents')`
  return `CREATE POLICY "${name}" ON storage.objects FOR ${command} TO authenticated ${clause}`
}

async function main(): Promise<void> {
  const expectRef = arg('expect-ref')
  if (!expectRef) throw new Error('ต้องระบุ --expect-ref <project-ref> เสมอ')
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

  // 2) policy ของ case-documents
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const { PrismaClient } = await import('@/lib/generated/prisma/client')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) })
  try {
    for (const policy of CASE_DOCUMENT_POLICIES) {
      const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*) AS n FROM pg_policies
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = ${policy.name}`
      if (Number(rows[0]?.n ?? 0) > 0) {
        console.log(`policy "${policy.name}": มีอยู่แล้ว`)
        continue
      }
      await prisma.$executeRawUnsafe(policySql(policy.name, policy.command))
      console.log(`policy "${policy.name}": สร้างแล้ว`)
    }
  } finally {
    await prisma.$disconnect()
  }
  console.log(`เสร็จ — project ${ref}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
