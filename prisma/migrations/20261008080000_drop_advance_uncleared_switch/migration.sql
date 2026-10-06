-- มติ PO 07/10/2569 U145 (Final ด่าน 5 ND-2) — ตัดสวิตช์ "เงินทดรองที่ยังไม่เคลียร์ให้ตั้งเป็นลูกหนี้พนักงาน"
-- สวิตช์ไม่เคยมีผู้ใช้ค่า: รอบจ่ายหักคืนเงินทดรอง approved/overdue ของผู้รับ **เสมอ** (D12 · `15` · `17`)
-- ค่าเดิมยังอยู่ใน audit_logs ของการแก้นโยบายการเงินครั้งก่อน ๆ (immutable)
ALTER TABLE "finance_policy_settings" DROP COLUMN "advance_uncleared_to_employee_receivable";
