'use client'

import type { RoleGroup } from '@/lib/generated/prisma/enums'
import { cn } from '@/components/ui/cn'
import { ROLE_GROUP_LABEL, ROLE_GROUP_TABS, findRoleGroupTab, type RoleGroupTabId } from '@/lib/roles/role-groups'

/**
 * แท็บ 3 ระดับของหน้า "บทบาทและสิทธิ์" / "ผู้ใช้งาน" (`07` §8 — PO ยืนยัน 03/07/2569)
 * แท็บ "เจ้าหน้าที่ติดตามทรัพย์" มีปุ่มสลับย่อย Inhouse/Outsource ภายใน ไม่ใช่แท็บเรียบ 4 อัน
 *
 * ⚠️ shared component — Users module (Phase 1.9) ใช้ตัวนี้ซ้ำ ห้ามสร้างใหม่ในโมดูลตัวเอง
 */
export function RoleGroupTabs({
  tab,
  onTabChange,
  subGroup,
  onSubGroupChange,
  tabs,
  className,
}: {
  tab: RoleGroupTabId
  onTabChange: (tab: RoleGroupTabId) => void
  /** role group ที่เลือกอยู่ภายในแท็บที่มี sub-toggle */
  subGroup: RoleGroup
  onSubGroupChange: (roleGroup: RoleGroup) => void
  /** แท็บที่ผู้ใช้เห็น (ไม่ส่ง = ครบทุกแท็บ) — หน้าผู้ใช้งานซ่อนแท็บ "แอดมิน" จากธุรการ (UAT BUG-021) */
  tabs?: readonly RoleGroupTabId[]
  className?: string
}) {
  const active = findRoleGroupTab(tab)

  return (
    <div className={className}>
      {/* จอแคบ: ช่องไฟเล็กลง + ชื่อแท็บไม่ตัดกลางคำ (preship R3-037) */}
      <div className="flex flex-wrap gap-x-4 border-b border-slate-200 sm:gap-x-6" role="tablist" aria-label="กลุ่มบทบาท">
        {ROLE_GROUP_TABS.filter((item) => tabs === undefined || tabs.includes(item.id)).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === tab}
            onClick={() => onTabChange(item.id)}
            className={cn(
              'focus-ring-inset border-b-2 py-2.5 text-sm font-medium whitespace-nowrap transition-colors pointer-coarse:min-h-11',
              item.id === tab
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {active.hasSubToggle && (
        <div className="mt-4 flex w-fit gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="ฝั่งทีม">
          {active.roleGroups.map((group) => (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={group === subGroup}
              onClick={() => onSubGroupChange(group)}
              className={cn(
                'focus-ring-inset rounded-md px-4 py-1.5 text-xs font-medium transition-colors pointer-coarse:min-h-11',
                group === subGroup ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {ROLE_GROUP_LABEL[group]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
