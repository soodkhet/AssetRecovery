import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'

/**
 * เตรียมบัญชี `admin` / `admin` สำหรับ login บนเครื่อง dev — รันครั้งเดียวต่อเครื่อง (รันซ้ำได้)
 *
 *   pnpm auth:dev-admin
 *
 * 1. ฐานข้อมูล**บนเครื่อง**: สร้าง/ใช้ผู้ใช้ username `admin` role Superadmin (ไม่มีอีเมล)
 * 2. Supabase Auth: บัญชีเฉพาะของ admin ตัวนี้ (อีเมลภายใน `<users.id>@users.assetrecovery.invalid`)
 *    รหัส**สุ่มยาว** — ไม่ใช่ `admin` (Supabase บังคับ ≥ 6 ตัว และไม่ควรมีบัญชีรหัสอ่อนบน cloud)
 * 3. เขียนรหัสจริงลง `.env.local` เป็น `DEV_ADMIN_AUTH_PASSWORD` → `next dev` แปล admin/admin ให้เอง
 *    (`lib/auth/dev-login-alias.ts`) · ห้ามตั้งตัวแปรนี้บน Vercel
 *
 * ⚠️ ปฏิเสธถ้า DATABASE_URL ไม่ใช่ localhost — ห้ามสร้าง admin รหัสง่ายบน staging/production
 * ⚠️ ไม่แตะบัญชี Superadmin ตัว seed (`superadmin@assetrecovery.local`) ที่อาจใช้ร่วมกับ environment อื่น
 */

const ENV_FILE = '.env.local'
const ENV_KEY = 'DEV_ADMIN_AUTH_PASSWORD'
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function upsertEnvLine(file: string, key: string, value: string): void {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  const next = pattern.test(current)
    ? current.replace(pattern, line)
    : `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}\n# รหัสจริงของบัญชี admin บนเครื่อง dev (pnpm auth:dev-admin) — ห้ามตั้งบน Vercel\n${line}\n`
  writeFileSync(file, next)
}

async function main(): Promise<void> {
  loadEnv({ path: '.env', quiet: true })
  loadEnv({ path: ENV_FILE, override: true, quiet: true })

  const databaseUrl = process.env['DATABASE_URL']
  if (!databaseUrl || !LOCAL_DB_HOSTS.has(new URL(databaseUrl).hostname)) {
    throw new Error('DATABASE_URL ต้องชี้ฐานข้อมูลบนเครื่อง (localhost) เท่านั้น — สคริปต์นี้ห้ามรันกับ staging/production')
  }
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local')
  }

  const { createClient } = await import('@supabase/supabase-js')
  const { prisma } = await import('@/lib/prisma')
  const { INTERNAL_AUTH_EMAIL_DOMAIN, internalAuthEmail } = await import('@/lib/auth/login-identifier')
  const { DEV_ALIAS_USERNAME } = await import('@/lib/auth/dev-login-alias')
  const { SUPERADMIN_ROLE_NAME } = await import('@/lib/auth/constants')

  const role = await prisma.role.findFirst({
    where: { name: SUPERADMIN_ROLE_NAME, roleGroup: 'system', deletedAt: null },
    select: { id: true, organizationId: true },
    orderBy: { createdAt: 'asc' },
  })
  if (!role) throw new Error('ไม่พบ role Superadmin — รัน `pnpm db:deploy && pnpm db:seed` ก่อน')

  let user = await prisma.user.findFirst({
    where: { organizationId: role.organizationId, username: DEV_ALIAS_USERNAME, deletedAt: null },
    select: { id: true, supabaseUid: true, roleId: true },
  })
  if (user === null) {
    user = await prisma.user.create({
      data: {
        id: randomUUID(),
        organizationId: role.organizationId,
        roleId: role.id,
        username: DEV_ALIAS_USERNAME,
        email: null,
        fullName: 'ผู้ดูแลระบบ (เครื่อง dev)',
        status: 'active',
      },
      select: { id: true, supabaseUid: true, roleId: true },
    })
    console.log('สร้างผู้ใช้ admin (Superadmin) ในฐานข้อมูลบนเครื่องแล้ว')
  } else if (user.roleId !== role.id) {
    throw new Error('มีผู้ใช้ username "admin" อยู่แล้วแต่ไม่ใช่ Superadmin — เปลี่ยน username ของคนนั้นก่อน')
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const password = process.env[ENV_KEY] || `${randomBytes(24).toString('base64url')}A1`
  let supabaseUid = user.supabaseUid

  if (supabaseUid !== null) {
    // แตะได้เฉพาะบัญชีอีเมลภายในที่สคริปต์นี้สร้าง — บัญชีอีเมลจริงอาจเป็นของคน/environment อื่น
    const { data, error } = await admin.auth.admin.getUserById(supabaseUid)
    if (error || !data.user) {
      supabaseUid = null
    } else if (!data.user.email?.endsWith(`@${INTERNAL_AUTH_EMAIL_DOMAIN}`)) {
      throw new Error('ผู้ใช้ admin ผูกกับบัญชี Supabase ที่มีอีเมลจริงอยู่แล้ว — สคริปต์จะไม่เปลี่ยนรหัสบัญชีนั้น')
    } else {
      const updated = await admin.auth.admin.updateUserById(supabaseUid, { password })
      if (updated.error) throw updated.error
      console.log('ตั้งรหัสบัญชี Supabase ของ admin ใหม่แล้ว')
    }
  }

  if (supabaseUid === null) {
    const created = await admin.auth.admin.createUser({
      email: internalAuthEmail(user.id),
      password,
      email_confirm: true,
    })
    if (created.error) throw created.error
    supabaseUid = created.data.user.id
    console.log('สร้างบัญชี Supabase Auth ของ admin แล้ว')
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { supabaseUid, mustChangePassword: false, status: 'active' },
  })
  upsertEnvLine(ENV_FILE, ENV_KEY, password)
  await prisma.$disconnect()

  console.log(`พร้อมแล้ว — restart \`pnpm dev\` แล้วเข้า http://localhost:3000/login ด้วย admin / admin`)
}

main().catch((error: unknown) => {
  console.error('[dev-admin] ล้มเหลว:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
