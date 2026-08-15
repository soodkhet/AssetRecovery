# ด่าน 4/6 — สิทธิ์ + Audit + Multi-tenant leak

อ้างอิง `docs/07`, `25`, `05`, `90`, `97` + DEC-002/DEC-009 · **ทดสอบที่ endpoint จริง ไม่ใช่ดูแค่ UI ซ่อนปุ่ม**:

1. **ทุก endpoint ผ่าน `requirePermission(action, resource, scope)`** — ไล่ทุก route ใน `app/api/**` แล้วยืนยันว่าไม่มีตัวไหนหลุด (endpoint ที่ไม่มี = ช่องโหว่ ไม่ใช่ "ยังไม่ทำ")
2. **Matrix ตาม `25`:** สุ่มตรวจอย่างน้อย 1 endpoint ต่อหมวด · เคสบังคับ: Finance เรียกรายงาน E1 (Executive) ต้องได้ **403** (`96`)
3. **Scope ย่อย:** Manager เห็นเฉพาะทีมใน `team_managers` · Company User เห็นเฉพาะ `company_id` ตัวเอง · เจ้าหน้าที่เห็นเฉพาะงานตัวเอง — ทดสอบด้วยการยิง id ของคนอื่นตรง ๆ ต้อง 403 **แบบไม่ leak ว่ามี record อยู่จริง**
4. **7 รายการ "✅ only" ล็อก Superadmin** — มอบให้ role อื่นไม่ได้จริง
5. **Audit:** ทุก mutation ลงครบ 9 fields · `reason` บังคับเมื่อกระทบเงิน/สิทธิ์/ธนาคาร/ภาษี/lock period · **UPDATE/DELETE ถูกปฏิเสธที่ระดับ DB** (ลองยิงจริง) · login/logout/failed login ลงครบ
6. **Multi-tenant:** ทุก query กรอง `organization_id` · ไล่หา query ที่ลืมกรอง (list, detail, export, report, count/aggregate) — aggregate ที่ลืมกรองคือจุดรั่วที่หาเจอยากที่สุด
7. **Client Portal:** `/api/portal/*` = **GET เท่านั้น** · ผูก `company_id` จาก session ห้ามรับจาก query param
   — ⏸️ **ยังไม่มีของให้ตรวจ**: Phase 7 ถูกบล็อกด้วยคำตอบ PO (Auth method — `97` §22 #2) ยังไม่มีโค้ดใต้ `/api/portal` เลย ⇒ ข้อนี้เปิดตรวจเมื่อ Phase 7 เกิดจริง (ข้อ 6 ของด่าน 5 เช่นกัน)
8. **Session/Auth:** session 24 ชม. ตาม `05` · route guard ครบ · service_role key ไม่ถูก import เข้าโค้ดฝั่ง client (grep `SUPABASE_SERVICE_ROLE_KEY` ใน bundle)

รายงานตาราง `| หัวข้อ | สถานะ | หลักฐาน (ไฟล์/เทสต์) |` แล้วแก้จุดที่ ❌ พร้อม test ที่พิสูจน์
