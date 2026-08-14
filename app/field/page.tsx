import { FieldComingSoon } from '@/components/field/field-coming-soon'

/**
 * หน้าแรกของ Field Tracker (Dashboard 5 บล็อก — `41` §7.1)
 * เนื้อหาจริงอยู่ Phase 2.12 (แผนงาน `docs/01_PLAN.md` §2.12) — shell/เมนู/แท็บงานพร้อมแล้วตั้งแต่ 2.10
 */
export default function FieldDashboardPage() {
  return (
    <FieldComingSoon
      title="หน้าแรก (แดชบอร์ดพนักงาน)"
      description="สรุปงานวันนี้ · % ความสำเร็จ · คอมมิชชั่นเดือนนี้ · แนวโน้ม 7 วัน — อยู่ระหว่างพัฒนา (Phase 2.12)"
      goTo={{ href: '/field/pending', label: 'ไปแท็บรอรับงาน' }}
    />
  )
}
