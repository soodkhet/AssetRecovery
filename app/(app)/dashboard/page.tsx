import { Badge, RefText } from '@/components/ui/badge'
import { Card, CardHeader, PageHeader } from '@/components/ui/card'
import { InlineAlert } from '@/components/ui/states'
import { requireSessionPage } from '@/lib/auth/page-guard'
import { fmtDateTime } from '@/lib/format/datetime'
import { visibleMenus } from '@/lib/nav/menu-registry'

/**
 * แดชบอร์ดหลัก — **placeholder** ตามแผน Phase 1.5
 * เนื้อหาจริง (คิวงานต่อ role / KPI 96 E1 / แจ้งเตือน `90` §6.3) เกิดใน Phase 6.6 หลัง PO อนุมัติ
 * mockup `dashboard.html` ยังเป็น 🔶 DRAFT — ห้ามเดา business logic จากมัน (`06` §8)
 */
export default async function DashboardPage() {
  const user = await requireSessionPage()
  const menus = visibleMenus(user)

  return (
    <>
      <PageHeader
        title="แดชบอร์ด"
        description="ภาพรวมงานประจำวัน — เนื้อหาจริงเกิดใน Phase 6.6 (รอ Product Owner อนุมัติ mockup)"
        action={<Badge>Phase 6.6</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="บัญชีที่ใช้งานอยู่" description="ข้อมูลจาก session ปัจจุบัน" />
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">ผู้ใช้</dt>
              <dd className="font-medium text-slate-800">{user.fullName}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">อีเมล</dt>
              <dd>
                <RefText>{user.email}</RefText>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">บทบาท</dt>
              <dd>
                <RefText>
                  {user.roleName} · {user.roleGroup}
                </RefText>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">ขอบเขตข้อมูล (scope)</dt>
              <dd>
                <RefText>{user.scope.kind}</RefText>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">เข้าสู่ระบบล่าสุด</dt>
              <dd className="font-medium text-slate-800">{fmtDateTime(user.loginAt)}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="เมนูที่บัญชีนี้เข้าถึงได้"
            description="กรองตาม Top Nav Visibility Matrix (`06` §7.2)"
          />
          <ul className="mt-4 space-y-1.5 text-sm">
            {menus.map((menu) => (
              <li key={menu.id} className="flex items-center justify-between gap-4">
                <span className="font-medium text-slate-800">{menu.label}</span>
                <RefText className="text-slate-400">{menu.path}</RefText>
              </li>
            ))}
          </ul>
          <InlineAlert tone="info" className="mt-4">
            การซ่อนเมนูเป็นเพียง UX — ทุก endpoint ยังตรวจสิทธิ์ซ้ำที่ API layer เสมอ (DEC-002)
          </InlineAlert>
        </Card>
      </div>
    </>
  )
}
