import { describe, expect, it } from 'vitest'
import {
  EMPTY_FIELD_BADGE_COUNTS,
  FIELD_NAV_ITEMS,
  activeFieldNavId,
  fieldBadgeCount,
  fieldBottomNavItems,
  fieldNavSections,
  findFieldNavItem,
} from '@/lib/field/field-nav'

describe('ทะเบียนเมนู Field Tracker (`41` §5)', () => {
  it('bottom nav มี 4 ปุ่มเรียงตาม flow การทำงานจริง', () => {
    expect(fieldBottomNavItems().map((item) => item.id)).toEqual([
      'pending_accept',
      'accepted',
      'tracking',
      'closed',
    ])
  })

  it('แฮมเบอร์เกอร์/sidebar แบ่ง 2 หมวด — งานของฉัน 5 รายการ / การเงิน 2 รายการ', () => {
    const sections = fieldNavSections()
    expect(sections.map((section) => section.section)).toEqual(['work', 'finance'])
    expect(sections[0]?.items.map((item) => item.id)).toEqual([
      'dashboard',
      'pending_accept',
      'accepted',
      'tracking',
      'closed',
    ])
    expect(sections[1]?.items.map((item) => item.id)).toEqual(['expenses', 'income'])
  })

  it('badge ของ "กำลังติดตาม" เป็นสีม่วงและผูกกับคำขอเปลี่ยนผู้รับผิดชอบ ไม่ใช่จำนวนเคส', () => {
    const tracking = findFieldNavItem('tracking')
    expect(tracking.badge).toBe('reassignment')
    expect(tracking.badgeTone).toBe('purple')
  })

  it('badge ไม่แสดงเมื่อค่าเป็น 0', () => {
    const pending = findFieldNavItem('pending_accept')
    expect(fieldBadgeCount(pending, EMPTY_FIELD_BADGE_COUNTS)).toBeNull()
    expect(fieldBadgeCount(pending, { ...EMPTY_FIELD_BADGE_COUNTS, pendingAccept: 3 })).toBe(3)
    expect(fieldBadgeCount(findFieldNavItem('closed'), { ...EMPTY_FIELD_BADGE_COUNTS, accepted: 9 })).toBeNull()
  })

  it('เมนูที่เปิดอยู่จับด้วย href ที่ยาวที่สุด (ไม่ตกไปหน้าแรกเสมอ)', () => {
    expect(activeFieldNavId('/field')).toBe('dashboard')
    expect(activeFieldNavId('/field/tracking')).toBe('tracking')
    expect(activeFieldNavId('/field/accepted')).toBe('accepted')
    expect(activeFieldNavId('/field/expenses')).toBe('expenses')
    expect(activeFieldNavId('/warehouse')).toBeNull()
  })

  it('ทุกเมนูมี href ไม่ซ้ำและอยู่ใต้ /field', () => {
    const hrefs = FIELD_NAV_ITEMS.map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs.every((href) => href === '/field' || href.startsWith('/field/'))).toBe(true)
  })
})
