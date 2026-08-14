import { FieldComingSoon } from '@/components/field/field-coming-soon'

/** เบิกค่าใช้จ่าย (`41` §7.9) — 2 ขอบแท็บ (ผูกกับเคส / เบิกแยก) · เนื้อหาจริงอยู่ Phase 2.12 */
export default function FieldExpensesPage() {
  return (
    <FieldComingSoon
      title="เบิกค่าใช้จ่าย"
      description="รายการเบิกที่ระบบสร้างให้อัตโนมัติ + ฟอร์มเบิกที่พัก — อยู่ระหว่างพัฒนา (Phase 2.12)"
    />
  )
}
