import { config as loadEnv } from 'dotenv'

/**
 * ผูก user ที่ seed ไว้ (`prisma/seed.ts`) เข้ากับ Supabase Auth — ทำครั้งเดียวต่อ environment
 *
 *   pnpm auth:link-superadmin [email] [password]
 *
 * - มี auth user อยู่แล้ว → ใช้ uid เดิม (ไม่เปลี่ยนรหัสผ่าน)
 * - ยังไม่มี → สร้างใหม่ (ต้องส่ง password มาด้วย หรือใส่ `SUPERADMIN_PASSWORD` ใน env)
 * - idempotent: รันซ้ำได้ ผลลัพธ์เท่าเดิม
 *
 * ⚠️ ใช้ `SUPABASE_SERVICE_ROLE_KEY` — รันบนเครื่อง/CI ที่เชื่อถือได้เท่านั้น ห้ามรันฝั่ง browser
 * ⚠️ ไม่มี supabase_uid = login ไม่ได้ (ตอบ `USER_NOT_PROVISIONED`) แม้รหัสผ่านถูกต้อง
 */

const DEFAULT_EMAIL = 'superadmin@assetrecovery.local'

async function main(): Promise<void> {
  loadEnv({ path: '.env' })
  loadEnv({ path: '.env.local', override: true })

  const email = (process.argv[2] ?? DEFAULT_EMAIL).trim().toLowerCase()
  const password = process.argv[3] ?? process.env['SUPERADMIN_PASSWORD'] ?? null

  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local')
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { prisma } = await import('@/lib/prisma')

  const dbUser = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, email: true, fullName: true, supabaseUid: true, role: { select: { name: true } } },
  })
  if (!dbUser) {
    throw new Error(`ไม่พบผู้ใช้ ${email} ในฐานข้อมูล — รัน \`pnpm db:seed\` ก่อน`)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw listError

  const existing = list.users.find((user) => user.email?.toLowerCase() === email)
  let supabaseUid = existing?.id ?? null

  if (supabaseUid === null) {
    if (!password) {
      throw new Error('ยังไม่มี auth user — ต้องระบุรหัสผ่าน: pnpm auth:link-superadmin <email> <password>')
    }
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError) throw createError
    supabaseUid = created.user.id
    console.log(`สร้าง Supabase Auth user ใหม่: ${email}`)
  } else {
    console.log(`พบ Supabase Auth user เดิม: ${email}`)
  }

  if (dbUser.supabaseUid !== supabaseUid) {
    await prisma.user.update({ where: { id: dbUser.id }, data: { supabaseUid } })
    console.log(`ผูก supabase_uid เข้ากับผู้ใช้ ${dbUser.fullName} (${dbUser.role.name}) แล้ว`)
  } else {
    console.log('ผูกไว้อยู่แล้ว — ไม่มีอะไรต้องแก้')
  }

  await prisma.$disconnect()
}

main().catch((error: unknown) => {
  console.error('[link-superadmin] ล้มเหลว:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
