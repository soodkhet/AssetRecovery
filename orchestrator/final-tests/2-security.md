# ด่าน 2/4 — Security + สิทธิ์ + ความลับข้อมูล

1. **RBAC ครบเมทริกซ์:** ทุก endpoint × 5 role (owner/sales/finance/content/viewer) — เรียกจริงผ่าน caller ตรวจว่า allow/deny ตรง `packages/db/src/rbac.ts` และ deny-by-default จริง
2. **Source Confidentiality (กติกา 4):** รัน leak test — partner identity / `source_external_id` / `source_url` / commission / ข้อมูล Order-การเงิน **ห้ามหลุด public ทุกช่องทาง** รวม URL, alt, metadata, error message, JSON-LD
3. **ไฟล์:** private bucket + signed URL หมดอายุ ≤5 นาที · media guard ของบทความ (bucket `cms` เท่านั้น) · entity-level authz ของ slip/เอกสาร
4. **Auth:** lockout · session expiry/absolute cap · CSRF · rate-limit · error ไม่รั่ว enumeration
5. **Audit:** ทุก mutation สำคัญเขียน `audit_logs` (append-only) พร้อม actor/time/before-after

รายงานตาราง `| ด้าน | สถานะ | หลักฐาน |` แล้วแก้จุดที่ ❌ + เพิ่ม test ที่กันการถดถอย
