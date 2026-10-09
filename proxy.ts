import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { LOGIN_PATH, SET_PASSWORD_PATH } from '@/lib/auth/constants'
import { getPublicEnv } from '@/lib/env'
import { SUPABASE_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options'

/**
 * Next.js proxy (เดิมชื่อ middleware — Next 16 เปลี่ยนชื่อ convention เป็น `proxy.ts`)
 * ตำแหน่งนี้คือไฟล์เดียวกับที่เอกสาร `docs/implementation-todo.md` §0.2 เรียกว่า `/middleware.ts`
 *
 * หน้าที่: (1) refresh session cookie ของ Supabase Auth (2) route guard หน้าเว็บแบบ optimistic
 *
 * ⚠️ ที่นี่ **ไม่ใช่** จุดบังคับสิทธิ์ (DEC-002) — permission ตรวจที่ API layer ทุก endpoint ผ่าน
 *    `requirePermission(action, resource, scope)` และหน้า server component ตรวจซ้ำด้วย `requireSession()`
 * ⚠️ `/api/*` ไม่ถูก redirect — endpoint ต้องตอบ 401/403 เป็น JSON เอง (เรียกตรงก็ต้องโดนปฏิเสธ)
 */

/**
 * หน้าที่เข้าได้โดยไม่ต้อง login
 * `SET_PASSWORD_PATH` = ปลายทางลิงก์จากอีเมลของ Supabase — ผู้ใช้ยังไม่มี session ตอนกดลิงก์ ต้องเปิดได้เสมอ
 */
const PUBLIC_PAGE_PATHS = new Set<string>([LOGIN_PATH, SET_PASSWORD_PATH, '/'])

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PATHS.has(pathname)
}

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const env = getPublicEnv()
  let response = NextResponse.next({ request })

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // เรียกเพื่อ refresh token ที่ใกล้หมดอายุ — ห้ามใช้ผลลัพธ์นี้เป็นสิทธิ์ (สิทธิ์ตรวจที่ API layer)
  const { data } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/')) return response

  if (!data.user && !isPublicPage(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = LOGIN_PATH
    redirectUrl.search = ''
    // เก็บ query ไว้ด้วย (แท็บ/ตัวกรอง/`?case=`) — login แล้วกลับมาที่เดิมครบ (preship R7-006) · หน้าแรกไม่ต้องจำ
    if (pathname !== '/') redirectUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  // ข้าม static asset / รูป / favicon — ตามแนวทาง Supabase SSR
  // + manifest / service worker / หน้า offline ของ PWA: หน้า login ลิงก์ถึงเสมอ ต้องได้ไฟล์จริงไม่ใช่ redirect ไป /login
  //   (เดิม "เพิ่มลงหน้าจอโฮม" จากหน้า login ไม่ได้ manifest — preship PS-025)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
