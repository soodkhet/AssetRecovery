import type { FieldGroup } from '@/lib/field/field-status'

/**
 * ทะเบียนเมนูของ Field Tracker (`41` §5.1 mobile / §5.2 desktop) — **pure ล้วน**
 *
 * Shell ของไฟล์ 41 **ไม่ผ่าน `<AppShell>`** ของหลังบ้าน (`06` §8) — mobile ใช้ bottom nav 4 ปุ่ม
 * + แฮมเบอร์เกอร์ · desktop ใช้ sidebar 260px `position: fixed` — แต่ทั้งสองอ่านเมนูจากตารางนี้ตัวเดียวกัน
 * (`41` §11 "Mobile และ Desktop ใช้ logic เดียวกัน 100%")
 *
 * ⚠️ เพิ่ม/ย้ายเมนู = แก้ที่นี่ที่เดียว (มีเทสต์ยามลำดับ bottom nav 4 ปุ่มและหมวดของแฮมเบอร์เกอร์)
 */

export const FIELD_NAV_IDS = [
  'dashboard',
  'pending_accept',
  'accepted',
  'tracking',
  'closed',
  'expenses',
  'income',
] as const
export type FieldNavId = (typeof FIELD_NAV_IDS)[number]

/** หมวดของเมนู (`41` §5.1 — งานของฉัน / การเงิน · "บัญชี" = ปุ่มออกจากระบบ ไม่ใช่หน้า) */
export const FIELD_NAV_SECTIONS = ['work', 'finance'] as const
export type FieldNavSection = (typeof FIELD_NAV_SECTIONS)[number]

export const FIELD_NAV_SECTION_LABEL: Readonly<Record<FieldNavSection, string>> = {
  work: 'งานของฉัน',
  finance: 'การเงิน',
}

/** ตัวนับที่แสดงเป็น badge บนเมนู (`41` §5.1) */
export type FieldBadgeKey = 'pendingAccept' | 'accepted' | 'reassignment'

/** สีของ badge — แดง = งานค้าง · ม่วง = คำขอเปลี่ยนผู้รับผิดชอบรอตอบ (`41` §5.1 · §6.7) */
export type FieldBadgeTone = 'red' | 'purple'

export interface FieldNavItem {
  id: FieldNavId
  label: string
  /** ป้ายในแฮมเบอร์เกอร์/sidebar (ยาวกว่าใน bottom nav ได้) */
  menuLabel: string
  href: string
  section: FieldNavSection
  /** ลำดับใน bottom nav ของ mobile (null = ไม่อยู่ใน bottom nav — เข้าจากแฮมเบอร์เกอร์/sidebar เท่านั้น) */
  bottomNavOrder: number | null
  badge: FieldBadgeKey | null
  badgeTone: FieldBadgeTone | null
  /** กลุ่มสถานะของรายการเคสที่หน้านี้แสดง (null = ไม่ใช่หน้ารายการเคส) */
  group: FieldGroup | null
}

export const FIELD_NAV_ITEMS: readonly FieldNavItem[] = [
  {
    id: 'dashboard',
    label: 'หน้าแรก',
    menuLabel: 'หน้าแรก',
    href: '/field',
    section: 'work',
    bottomNavOrder: null,
    badge: null,
    badgeTone: null,
    group: null,
  },
  {
    id: 'pending_accept',
    label: 'รอรับงาน',
    menuLabel: 'รอรับงาน',
    href: '/field/pending',
    section: 'work',
    bottomNavOrder: 1,
    badge: 'pendingAccept',
    badgeTone: 'red',
    group: 'pending_accept',
  },
  {
    id: 'accepted',
    label: 'รับงานแล้ว',
    menuLabel: 'รับงานแล้ว (จัดวันที่)',
    href: '/field/accepted',
    section: 'work',
    bottomNavOrder: 2,
    badge: 'accepted',
    badgeTone: 'red',
    group: 'accepted',
  },
  {
    id: 'tracking',
    label: 'กำลังติดตาม',
    menuLabel: 'กำลังติดตาม',
    href: '/field/tracking',
    section: 'work',
    bottomNavOrder: 3,
    // ม่วง = เฉพาะตอนมีคำขอเปลี่ยนผู้รับผิดชอบค้างตอบ (`41` §5.1) ไม่ใช่จำนวนเคสที่กำลังติดตาม
    badge: 'reassignment',
    badgeTone: 'purple',
    group: 'tracking',
  },
  {
    id: 'closed',
    label: 'จบงาน',
    menuLabel: 'จบงาน',
    href: '/field/closed',
    section: 'work',
    bottomNavOrder: 4,
    badge: null,
    badgeTone: null,
    group: 'closed',
  },
  {
    id: 'expenses',
    label: 'เบิกค่าใช้จ่าย',
    menuLabel: 'เบิกค่าใช้จ่าย',
    href: '/field/expenses',
    section: 'finance',
    bottomNavOrder: null,
    badge: null,
    badgeTone: null,
    group: null,
  },
  {
    id: 'income',
    label: 'สรุปรายได้',
    menuLabel: 'สรุปรายได้',
    href: '/field/income',
    section: 'finance',
    bottomNavOrder: null,
    badge: null,
    badgeTone: null,
    group: null,
  },
]

/** 4 ปุ่มล่างของ mobile เรียงตาม flow การทำงานจริง (`41` §5.1 — ไม่ใช่ "หน้าแรก" เป็นปุ่มแรก) */
export function fieldBottomNavItems(): FieldNavItem[] {
  return FIELD_NAV_ITEMS.filter((item) => item.bottomNavOrder !== null).sort(
    (a, b) => (a.bottomNavOrder ?? 0) - (b.bottomNavOrder ?? 0),
  )
}

export interface FieldNavSectionGroup {
  section: FieldNavSection
  label: string
  items: FieldNavItem[]
}

/** เมนูทั้งหมดแบ่งหมวด — ใช้ทั้งแฮมเบอร์เกอร์ (mobile) และ sidebar (desktop) */
export function fieldNavSections(): FieldNavSectionGroup[] {
  return FIELD_NAV_SECTIONS.map((section) => ({
    section,
    label: FIELD_NAV_SECTION_LABEL[section],
    items: FIELD_NAV_ITEMS.filter((item) => item.section === section),
  }))
}

export function findFieldNavItem(id: FieldNavId): FieldNavItem {
  const item = FIELD_NAV_ITEMS.find((entry) => entry.id === id)
  if (item === undefined) throw new Error(`ไม่พบเมนู Field Tracker: ${id}`)
  return item
}

/**
 * เมนูที่กำลังเปิดอยู่จาก pathname — จับด้วย href ที่ยาวที่สุดที่ตรง
 * (`/field` เป็น prefix ของทุกหน้า จึงต้องเทียบตัวยาวก่อน)
 */
export function activeFieldNavId(pathname: string): FieldNavId | null {
  const matches = FIELD_NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)
  return matches[0]?.id ?? null
}

/** ตัวนับ badge ของ shell — โหลดครั้งเดียวที่ระดับ shell แล้วแชร์ให้ทุกเมนู (`41` §5.1) */
export interface FieldBadgeCounts {
  pendingAccept: number
  accepted: number
  reassignment: number
}

export const EMPTY_FIELD_BADGE_COUNTS: FieldBadgeCounts = {
  pendingAccept: 0,
  accepted: 0,
  reassignment: 0,
}

/** จำนวนที่ต้องแสดงบน badge ของเมนูนั้น — `null` = ไม่ต้องแสดง badge เลย (0 ไม่แสดง) */
export function fieldBadgeCount(item: FieldNavItem, counts: FieldBadgeCounts): number | null {
  if (item.badge === null) return null
  const value = counts[item.badge]
  return value > 0 ? value : null
}
