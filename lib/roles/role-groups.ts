import type { RoleGroup } from '@/lib/generated/prisma/enums'

/**
 * โครงแท็บของหน้า "บทบาทและสิทธิ์" และ "ผู้ใช้งาน" — **3 tab หลัก** โดยแท็บเจ้าหน้าที่ติดตามทรัพย์
 * แบ่งย่อยเป็น Inhouse/Outsource ภายใน (`07` §8 v2.1 · §17 — PO ยืนยัน 03/07/2569)
 *
 * ⚠️ mockup `settings.html` วาดเป็น 4 แท็บเรียบ (system/inhouse/outsource/finance_company) ซึ่งเป็น
 * เวอร์ชันก่อน PO แก้ — ยึดสเปค `07` §8 เป็นหลักตามลำดับ "spec ชนะ mockup" (CLAUDE.md)
 * ⚠️ ใช้ร่วมกับ Users module (Phase 1.9) — อย่า duplicate โครงแท็บนี้ในโมดูลอื่น
 */

export type RoleGroupTabId = 'admin' | 'field' | 'finance_company'

export interface RoleGroupTab {
  id: RoleGroupTabId
  label: string
  /** role group ที่อยู่ใต้แท็บนี้ (เรียงตามลำดับที่แสดงผล) */
  roleGroups: readonly RoleGroup[]
  /** ปุ่มสลับย่อยภายในแท็บ — มีเฉพาะแท็บ `field` (Inhouse/Outsource) */
  hasSubToggle: boolean
}

/** ชื่อกลุ่มภาษาไทยสำหรับ badge/หัวตาราง (`07` §7.3) */
export const ROLE_GROUP_LABEL: Readonly<Record<RoleGroup, string>> = {
  system: 'ระบบ (System)',
  inhouse: 'Inhouse',
  outsource: 'Outsource',
  finance_company: 'บริษัทไฟแนนซ์',
}

export const ROLE_GROUP_TABS: readonly RoleGroupTab[] = [
  { id: 'admin', label: 'แอดมิน', roleGroups: ['system'], hasSubToggle: false },
  {
    id: 'field',
    label: 'เจ้าหน้าที่ติดตามทรัพย์',
    // คนละ assignment กันจริงแม้ชื่อ role เหมือนกัน (`07` §5.2) — UI ต้องแยกให้ชัด
    roleGroups: ['inhouse', 'outsource'],
    hasSubToggle: true,
  },
  { id: 'finance_company', label: 'บริษัทไฟแนนซ์', roleGroups: ['finance_company'], hasSubToggle: false },
]

export function findRoleGroupTab(tabId: RoleGroupTabId): RoleGroupTab {
  const tab = ROLE_GROUP_TABS.find((each) => each.id === tabId)
  if (!tab) throw new Error(`ไม่รู้จักแท็บ role group: ${tabId}`)
  return tab
}

export function roleGroupsForTab(tabId: RoleGroupTabId): readonly RoleGroup[] {
  return findRoleGroupTab(tabId).roleGroups
}

/** role group → แท็บที่ต้องเปิดเพื่อเห็น role นั้น */
export function tabForRoleGroup(roleGroup: RoleGroup): RoleGroupTabId {
  const tab = ROLE_GROUP_TABS.find((each) => each.roleGroups.includes(roleGroup))
  if (!tab) throw new Error(`role group นี้ยังไม่ถูกจัดลงแท็บ: ${roleGroup}`)
  return tab.id
}
