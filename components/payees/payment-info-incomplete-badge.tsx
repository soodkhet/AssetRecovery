import { StatusBadge } from '@/components/ui'

/** ข้อความป้าย — ใช้ร่วมหน้ารายการเบิกของพนักงาน + คิวอนุมัติ (มติ PO U131) */
export const PAYMENT_INFO_INCOMPLETE_LABEL = 'ข้อมูลรับเงินไม่ครบ'

/**
 * ป้าย "ข้อมูลรับเงินไม่ครบ" (มติ PO U131) — แสดงตั้งแต่ส่งเบิก เพื่อให้เติมข้อมูลก่อนถึงรอบจ่าย
 * (ไม่ครบ = ยืนยันผู้รับไม่ได้ ⇒ เข้ารอบจ่ายไม่ได้) · สีกลุ่ม `warning` ของ mapper กลาง
 */
export function PaymentInfoIncompleteBadge({ title }: { title?: string }) {
  return (
    <span title={title}>
      <StatusBadge status="warning" group="warning" label={PAYMENT_INFO_INCOMPLETE_LABEL} />
    </span>
  )
}
