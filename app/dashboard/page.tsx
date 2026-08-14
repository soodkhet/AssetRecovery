import { Can, PermissionProvider } from '@/components/auth/permission-provider'
import { LogoutButton } from '@/components/auth/logout-button'
import { requireSessionPage } from '@/lib/auth/page-guard'
import { toClientSession } from '@/lib/auth/types'

/**
 * แดชบอร์ด — **placeholder ของ Phase 1.3** เพื่อพิสูจน์ route guard + session + `<Can>` ใช้งานได้จริง
 * App Shell / Top Nav ตัวจริงเกิดใน Phase 1.5 (`04`+`06`) และเนื้อหาแดชบอร์ดใน Phase 6.6
 */
export default async function DashboardPage() {
  const user = await requireSessionPage()
  const session = toClientSession(user)

  return (
    <PermissionProvider session={session}>
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900">แดชบอร์ด</h1>
              <p className="mt-1 text-xs text-slate-500">
                หน้าจริงเกิดใน Phase 1.5 (App Shell) — ตอนนี้ใช้ยืนยันว่า Auth + Permission ทำงานครบ
              </p>
            </div>
            <LogoutButton />
          </div>

          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">ผู้ใช้</dt>
              <dd className="font-medium text-slate-800">{session.fullName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">อีเมล</dt>
              <dd className="font-mono text-xs text-slate-700">{session.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">บทบาท</dt>
              <dd className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                {session.roleName} · {session.roleGroup}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">ขอบเขตข้อมูล (scope)</dt>
              <dd className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                {session.scope.kind}
              </dd>
            </div>
          </dl>

          <Can
            action="manage"
            resource="manage_settings"
            fallback={<p className="mt-6 text-xs text-slate-400">บัญชีนี้ไม่มีสิทธิ์จัดการการตั้งค่าระบบ</p>}
          >
            <p className="mt-6 text-xs font-semibold text-emerald-700">บัญชีนี้จัดการการตั้งค่าระบบได้</p>
          </Can>
        </div>
      </main>
    </PermissionProvider>
  )
}
