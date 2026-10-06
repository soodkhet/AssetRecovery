# ด่าน 4/7 — สิทธิ์ + Audit + Multi-tenant leak + Portal

> อ่าน `0-common.md` ก่อน (ฐาน `assetrecovery_test5` · รายงาน `uat/report/FINAL-4-security.md`)

อ้างอิง `docs/07`, `25`, `05`, `90`, `97` + DEC-002/DEC-009/DEC-014 + มติ U6/U8/U10/U12–U14/U17/U22/U23/U59–U62/U71/U90/U106 · **ทดสอบที่ endpoint จริง ไม่ใช่ดูแค่ UI ซ่อนปุ่ม**:

1. **ทุก endpoint ใน `app/api/**` ผ่าน `requirePermission(action, resource, scope)`** — ไล่ครบทุก route (ข้อยกเว้นที่บันทึกไว้: self-scoped `/api/notifications*` ต้องกรอง user+org)
2. **Matrix ตาม `25`:** ≥1 endpoint ต่อหมวด · Finance เรียกรายงาน E1 = **403** · บริษัทไฟแนนซ์เรียก `GET /api/dashboard` = **403**
3. **Scope ย่อย:** Manager เห็นเฉพาะทีมใน `team_managers` (รวมแดชบอร์ด) · Company User เห็นเฉพาะ `company_id` ตัวเอง · เจ้าหน้าที่เห็นเฉพาะงานตัวเอง — ยิง id ของคนอื่นตรง ๆ ต้อง 403/404 **ไม่ leak ว่ามี record**
4. **"✅ only" 9 รายการ** (Superadmin 6: `manage_companies`, `manage_service_fees`, `manage_tax_profiles`, `manage_period_lock_policy`, `manage_invoice_numbering`, `manage_roles` · บริหาร 3: `approve_adjustment_locked`, `unlock_period`, `authorize_exception`) — มอบให้ role อื่น/ลดระดับไม่ได้จริงที่ API · ค่าตั้งภาษี 3 ตัว (U8) · คนแก้ข้อมูลผู้รับ = คนยืนยันได้ (U106)
5. **Audit:** ทุก mutation 9 fields · `reason` บังคับเมื่อกระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period (รวมค่าตั้งใหม่ U121/U122 · อัปโหลดลายเซ็น) · **UPDATE/DELETE ถูกปฏิเสธที่ DB** (ยิงจริง) · login/logout/failed login · การเปิดไฟล์ผ่าน signed URL (U90) · DB trigger immutable ตาม `02` §13
6. **Multi-tenant:** ทุก query กรอง `organization_id` — list, detail, export, report, count/aggregate, แดชบอร์ด, outbox drain
7. **Client Portal:** `/api/portal/*` = **GET เท่านั้น** · `company_id` จาก session ห้ามรับจาก query · สิทธิ์ผู้ใช้บริษัท 3 ระดับ (U12) · เอกสารดาวน์โหลด (U13) · ยอดเมื่อมี Adjustment ภายใน (U14) · audit ใน portal (U61)
8. **Storage (DEC-014):** ไม่มี policy ให้ผู้ใช้ · ทุกไฟล์ผ่าน server + signed URL อายุสั้น · อัปโหลดตรวจ magic bytes/ขนาด/path (โลโก้ ลายเซ็น หลักฐาน เอกสารล็อต)
9. **Session/Auth:** session 24 ชม. · route guard ครบ · `SUPABASE_SERVICE_ROLE_KEY` ไม่อยู่ใน client bundle · dev-only route/alias (dev admin, asOf, dev trigger) **ปิดใน production**
