-- คิวแจ้งเตือนของ job (มติ PO 06/10/2569 U120 · DEC-015 · `02` v4.48)
--
-- ปัญหาเดิม: job เปลี่ยนสถานะใน $transaction แล้วค่อยเขียนแจ้งเตือน **หลัง** commit — ถ้าขั้นแจ้งเตือนล้ม
-- สถานะเปลี่ยนไปแล้ว รอบหน้าไม่หยิบซ้ำ ⇒ แจ้งเตือนหายถาวร
-- แก้: เขียนแถว outbox ใน $transaction เดียวกับการเปลี่ยนสถานะ (rollback = ไม่มีแถว) แล้วตัวส่งแยก
-- หยิบไปเขียน `notifications` ทีหลัง · retry/backoff ได้ · ส่งซ้ำไม่แจ้งซ้ำ (dedupe ของ notifications)
--
-- ตารางระบบ ⇒ ไม่มี created_by/updated_by/deleted_at (ผู้สร้าง = job — ตามรอยด้วย source_job_type/source_job_ref)

CREATE TYPE "notification_outbox_status" AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "notification_outbox_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 8,
    "last_error" TEXT,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "source_job_type" TEXT NOT NULL,
    "source_job_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_notification_outbox_attempts" CHECK ("attempts" >= 0 AND "max_attempts" > 0),
    CONSTRAINT "chk_notification_outbox_sent_at" CHECK (("status" = 'sent') = ("sent_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "uniq_notification_outbox_org_dedupe_key" ON "notification_outbox"("organization_id", "dedupe_key");
CREATE INDEX "idx_notification_outbox_status_available_at" ON "notification_outbox"("status", "available_at");
CREATE INDEX "idx_notification_outbox_org_status_available_at" ON "notification_outbox"("organization_id", "status", "available_at");

ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
