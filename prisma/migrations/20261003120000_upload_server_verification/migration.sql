-- มติ PO 03/10/2569 (UAT Q13 · BUG-037/050 · หนี้ #1): server ตรวจไฟล์ที่อัปโหลดเอง
-- (มีจริงใน Storage · path อยู่ใต้รายการนั้น · ชนิดจาก magic bytes · ขนาด) แล้วเก็บ SHA-256 ที่คำนวณเอง
-- (`02` v4.9 · `41` · `44` §6.4)
--
-- รูปแบบ JSONB: { "<path>": { "sha256": "<hex64>", "mimeType": "...", "sizeBytes": <int> } }
-- แถวเดิม = '{}' (ยังไม่เคยตรวจ — ตอนส่งใหม่/แนบใหม่ server จะตรวจไฟล์เดิมซ้ำ)

ALTER TABLE "case_evidences" ADD COLUMN "file_hashes" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "close_case_drafts" ADD COLUMN "file_hashes" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "assets" ADD COLUMN "photo_hashes" JSONB NOT NULL DEFAULT '{}';

-- เอกสารล็อต: path ต่อเวอร์ชัน (ไม่ทับ) + hash ของไฟล์ที่ล็อตชี้อยู่
ALTER TABLE "handover_lots"
  ADD COLUMN "signed_doc_hash" VARCHAR(64),
  ADD COLUMN "delivery_proof_hash" VARCHAR(64);
