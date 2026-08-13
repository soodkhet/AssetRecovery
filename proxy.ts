import { NextResponse, type NextRequest } from 'next/server'

/**
 * Next.js proxy (เดิมชื่อ middleware — Next 16 เปลี่ยนชื่อ convention เป็น `proxy.ts`)
 * ตำแหน่งนี้คือไฟล์เดียวกับที่เอกสาร `docs/implementation-todo.md` §0.2 เรียกว่า `/middleware.ts`
 *
 * ⚠️ ที่นี่ **ไม่ใช่** จุดบังคับสิทธิ์ (DEC-002): permission ตรวจที่ API layer ทุก endpoint ผ่าน
 * `requirePermission(action, resource, scope)` ซึ่งจะเกิดใน Phase 1.3 — ไฟล์นี้มีหน้าที่
 * refresh session cookie ของ Supabase Auth + redirect หน้า login เท่านั้น (ใส่จริงใน Phase 1.3)
 */
export default function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  // ข้าม static asset / รูป / favicon — ตามแนวทาง Supabase SSR
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
