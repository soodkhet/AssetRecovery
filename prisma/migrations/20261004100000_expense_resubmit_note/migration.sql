-- มติ UAT 04/10/2569 BUG-098 (`02` v4.13): แยกข้อความชี้แจงตอนส่งใหม่ออกจากหมายเหตุตอนเบิก
-- เดิม resubmit_expense เขียนทับ `revision_note` ⇒ หมายเหตุเดิมหาย · ไม่ย้ายข้อมูลเดิม (กู้ค่าที่ถูกทับไปแล้วไม่ได้)
ALTER TABLE "expenses" ADD COLUMN "resubmit_note" TEXT;
