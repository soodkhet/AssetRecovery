-- Phase 2.8 (ต่อจาก `20260814150000_field_tracker_core`) — ปรับ FK ของ 2 ตารางใหม่ให้ตรงแบบที่ Prisma สร้าง
-- (`ON DELETE RESTRICT ON UPDATE CASCADE`) ไม่งั้น `migrate diff` จะ drift ค้างทุกครั้งที่ generate migration ใบใหม่
-- แยกเป็นใบใหม่เพราะใบเดิม apply ไปแล้ว — ห้ามแก้ไฟล์ที่ apply แล้ว (checksum drift)

ALTER TABLE "travel_origins" DROP CONSTRAINT "travel_origins_organization_id_fkey";
ALTER TABLE "travel_origins" DROP CONSTRAINT "travel_origins_case_id_fkey";
ALTER TABLE "travel_origins" DROP CONSTRAINT "travel_origins_assignment_id_fkey";
ALTER TABLE "travel_origins" DROP CONSTRAINT "travel_origins_created_by_fkey";
ALTER TABLE "travel_origins" DROP CONSTRAINT "travel_origins_updated_by_fkey";

ALTER TABLE "travel_origins" ADD CONSTRAINT "travel_origins_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "travel_origins" ADD CONSTRAINT "travel_origins_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "travel_origins" ADD CONSTRAINT "travel_origins_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "travel_origins" ADD CONSTRAINT "travel_origins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "travel_origins" ADD CONSTRAINT "travel_origins_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "close_case_drafts" DROP CONSTRAINT "close_case_drafts_organization_id_fkey";
ALTER TABLE "close_case_drafts" DROP CONSTRAINT "close_case_drafts_case_id_fkey";
ALTER TABLE "close_case_drafts" DROP CONSTRAINT "close_case_drafts_assignment_id_fkey";
ALTER TABLE "close_case_drafts" DROP CONSTRAINT "close_case_drafts_agent_id_fkey";
ALTER TABLE "close_case_drafts" DROP CONSTRAINT "close_case_drafts_created_by_fkey";
ALTER TABLE "close_case_drafts" DROP CONSTRAINT "close_case_drafts_updated_by_fkey";

ALTER TABLE "close_case_drafts" ADD CONSTRAINT "close_case_drafts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "close_case_drafts" ADD CONSTRAINT "close_case_drafts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "close_case_drafts" ADD CONSTRAINT "close_case_drafts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "case_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "close_case_drafts" ADD CONSTRAINT "close_case_drafts_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "close_case_drafts" ADD CONSTRAINT "close_case_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "close_case_drafts" ADD CONSTRAINT "close_case_drafts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
