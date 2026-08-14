import { FieldComingSoon } from '@/components/field/field-coming-soon'

/** แท็บ "จบงาน" (`41` §7.11) — pill filter 4 ตัว + การ์ดสรุป · เนื้อหาจริงอยู่ Phase 2.12 */
export default function FieldClosedPage() {
  return (
    <FieldComingSoon
      title="จบงาน"
      description="รายการเคสที่ปิดแล้ว (สำเร็จ/ไม่สำเร็จ/ถูกโอนไป) พร้อมสถานะค่าใช้จ่าย — อยู่ระหว่างพัฒนา (Phase 2.12)"
      goTo={{ href: '/field/tracking', label: 'ไปแท็บกำลังติดตาม' }}
    />
  )
}
