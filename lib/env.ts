import { z } from 'zod'

/**
 * ตรวจ env ตอน boot — ขาดตัวไหน fail เร็วพร้อมชื่อตัวแปร (ดู `.env.example`)
 * ห้าม log ค่า secret ออกมาไม่ว่ากรณีใด
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL ต้องมีค่า'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL ต้องมีค่า'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY ต้องมีค่า'),
  NEXT_PUBLIC_SUPABASE_URL: z.url('NEXT_PUBLIC_SUPABASE_URL ต้องเป็น URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY ต้องมีค่า'),
})

const publicEnvSchema = serverEnvSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
})

export type ServerEnv = z.infer<typeof serverEnvSchema>
export type PublicEnv = z.infer<typeof publicEnvSchema>

function parseOrThrow<T>(schema: z.ZodType<T>, source: Record<string, string | undefined>, label: string): T {
  const parsed = schema.safeParse(source)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' · ')
    throw new Error(`[env] ${label} ไม่ครบ/ไม่ถูกต้อง — ${missing}`)
  }
  return parsed.data
}

/** ใช้ได้เฉพาะฝั่ง server (API route / server component / job) เท่านั้น */
export function getServerEnv(): ServerEnv {
  return parseOrThrow(serverEnvSchema, process.env, 'server env')
}

/** ใช้ได้ทั้ง client และ server — มีเฉพาะตัวแปร NEXT_PUBLIC_* */
export function getPublicEnv(): PublicEnv {
  return parseOrThrow(
    publicEnvSchema,
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    'public env',
  )
}
