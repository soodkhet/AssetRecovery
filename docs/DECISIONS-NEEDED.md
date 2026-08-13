# การตัดสินใจที่ยังค้างอยู่ (นอกเรื่องบัญชี)
> จัดทำ: 02/07/2569
> **วัตถุประสงค์**: รายการนี้ต้องตัดสินใจก่อน implement — บางข้อตัดสินใจแล้วเปลี่ยนยาก

---

## หมวด 1 — Product & Business (Product Owner)

**1.1 ชื่อ Product สุดท้าย**
ปัจจุบันใช้ "AssetRecovery" ใน Mockup
- ชื่อที่ต้องการจริง? (กระทบ URL, ชื่อแอป, เอกสารทั้งหมด)

**1.2 Client Portal — บริษัทไฟแนนซ์ Login เอง**
~~ระบบออกแบบรองรับ Company User แล้ว แต่ยังไม่กำหนด scope~~ **ตอบครบแล้ว 03/07/2569:**
- ~~เฟส 1 จะให้บริษัทไฟแนนซ์ login เองได้ไหม?~~ → ให้ login ได้ แต่ **read-only ทั้งหมด**
- ~~เห็นอะไรได้บ้าง?~~ → สถานะเคส (แบบสรุป ไม่ลง field-side ละเอียด), Billing/AR, ใบกำกับภาษี, ใบส่งมอบทรัพย์ (รวมรูปทรัพย์ตอนรับเข้าคลัง), รายงานสรุป — **ไม่มีฟอร์มส่งเคส** (ยังคงผ่าน API/import/manual ตามไฟล์ 38 เดิม)
- **อัปเดต 03/07/2569**: `97-client-portal.md` ขยายเป็น Build Spec เต็มรูปแบบแล้ว (v3) พร้อม HTML Mockup ทั้ง Desktop (`97-client-portal-mockup.html`) และ Mobile (`97-client-portal-mobile-mockup.html`)
- ~~เหลือแค่: จะ deploy Phase ไหน (Phase 1 พร้อม MVP หรือ Phase 2 ทำทีหลัง) — ยังไม่ตัดสินใจ~~ → **✅ ตอบแล้ว 04/07/2569: Client Portal deploy เป็นส่วนหนึ่งของ Phase 1** (ไม่เลื่อนไป Phase 2) — ปิด Open Item นี้สมบูรณ์ **หมายเหตุ**: "Phase 1" ในที่นี้หมายถึง**ขอบเขต product release** ไม่ใช่ลำดับ `implementation-todo.md` — ตามลำดับ dependency จริง (ต้องมีข้อมูล Case/Finance/Accounting/Warehouse ให้ portal แสดงผลก่อน) จึงยังคง implement เป็น Phase 7 ใน `implementation-todo.md` แต่ **ไม่ใช่ของที่จะเลื่อนไปทำทีหลัง release แรกอีกต่อไป**

**1.3 Notification**
~~ยังไม่มี spec ชัดเจนว่าส่ง notification ผ่านช่องทางไหน~~ **ตอบครบแล้ว 03/07/2569:**
- ~~ใช้ Email / LINE OA / SMS / Push notification (In-app)?~~ → **เฟส 1: Push/In-app notification เท่านั้น** (ไม่ออกนอกระบบ — ไม่ต้องใช้ SMS/Email Gateway ในเฟส 1) — Email/LINE OA/SMS เลื่อนไปพิจารณาเฟส 2
- ~~กรณีใดที่ต้องส่ง notification?~~ → **ทุก status change สำคัญของเคส/การเงิน** (ดู `90-platform-audit-notification-reporting.md` §6.3 สำหรับรายการ event เริ่มต้น)

---

## หมวด 2 — Tech Stack ✅ ตัดสินใจครบแล้ว (02/07/2569)

**2.1 Backend Framework** ✅
→ **Next.js App Router + TypeScript + Prisma + PostgreSQL** (DEC-001)

**2.2 Permission Architecture** ✅
→ **Backend middleware (API layer)** — ไม่ใช้ Supabase RLS (DEC-002)

**2.3 File Storage** ✅
→ **Supabase Storage** (DEC-003)
- นโยบาย retention — ยังต้องกำหนด (ดูหมวด 5)

**2.4 Hosting / Deployment** ✅
→ **Vercel** (DEC-001)
- Data residency — ยังต้องยืนยัน (ดูหมวด 5)

**2.5 Polymorphic Relation** ✅
→ **Separate FK columns** + DB CHECK constraint exactly one non-null (DEC-004)

---

## หมวด 3 — Business Rules ที่ยังไม่ชัด (Product Owner)

**3.1 กรณี Field Agent ไม่ active นาน**
ไม่มี spec ว่าถ้า agent ไม่ active นาน X วัน ระบบจะทำอะไร
- reassign เคสอัตโนมัติ? หลังกี่วัน?
- แจ้งเตือน manager ก่อนไหม?

**3.2 เคสที่ค้างนาน (SLA Breach)**
ไฟล์ 03 ระบุว่ามี `slaAlertHours` แต่ไม่ระบุว่าเกิดอะไรขึ้นเมื่อ breach
- มีโทษ/ค่าปรับกับทีมไหม?
- auto-reassign หรือแค่ alert?

**3.3 Outsource บริษัท vs บุคคลธรรมดา**
ระบบรองรับทั้งสองแบบ แต่ flow บางอย่างต่างกัน (เช่น WHT rate, เอกสาร)
- Outsource ที่ใช้อยู่ส่วนใหญ่เป็นแบบไหน? (กระทบ default settings)

**3.4 การจัดการ advance ที่ไม่ถูก clear**
ถ้า Field Agent รับ advance ไปแล้วแต่ไม่ได้ clear ภายใน due date
- มีดอกเบี้ย/ค่าปรับไหม?
- ระบบบล็อก advance อันใหม่จนกว่าจะ clear อันเก่า ✅ (ออกแบบไว้แล้ว) แต่ถ้า clear ไม่ได้นาน — ทำอะไร?

**3.5 เพดานค่าตอบแทนต่อเดือนต่อคน**
ปัจจุบันไม่มี cap รายเดือน — คำนวณตามเคสที่ปิดจริงทั้งหมด
- ต้องการ cap ไหม? ถ้าใช่ — กำหนดที่เท่าไหร่และกระทบ WHT calculation อย่างไร?

---

## หมวด 4 — การ Integrate กับระบบภายนอก (Product Owner + Developer)

**4.1 Google Maps API**
ระบบใช้คำนวณระยะทางจริงสำหรับค่าน้ำมัน PER_KM
- มี Google Maps API Key อยู่แล้ว?
- ต้องการ budget limit ต่อเดือน?

**4.2 SMS / Email Gateway**
สำหรับ notification ออกนอกระบบ
- ใช้ provider อะไร? (Twilio / AWS SES / SendGrid / MailChimp)
- มี sender name / email ที่ต้องการใช้?
- **อัปเดต 03/07/2569**: เฟส 1 ใช้ Push/In-app notification เท่านั้น (ดู §1.3) จึง**ไม่บล็อกเฟส 1** — Product Owner จะส่งรายละเอียด provider ให้ตอน implement เฟส 2 ที่ต้องใช้จริง

**4.3 e-Tax Invoice / e-Withholding Tax (กรมสรรพากร)**
ถ้าต้องการส่งอิเล็กทรอนิกส์จริง — ต้องลงทะเบียนและ integrate กับกรมสรรพากร
- วางแผน integrate เฟสไหน?
- มีผู้ให้บริการ (Authorized Service Provider) ที่คุยไว้แล้วไหม? (เช่น Peak / FlowAccount / PEAK RD)

---

## หมวด 5 — Security & Compliance (Product Owner + Developer)

**5.1 PDPA Compliance**
ระบบเก็บข้อมูลส่วนบุคคล: ชื่อลูกหนี้, เลขบัตรประชาชน, ที่อยู่, รูปถ่าย
- มีนโยบาย Privacy Policy / Data Retention แล้วไหม?
- ต้องการ consent management ในระบบไหม?
- **อัปเดต 03/07/2569**: Product Owner ยืนยันว่ายังไม่มีนโยบายทางการ — ร่าง Draft scope เบื้องต้นแล้วที่ `90-platform-audit-notification-reporting.md` §6.2 (สถานะ Data Processor/Controller, เอกสารที่ต้องมี, data inventory) **ยังไม่ปิด** ต้องให้ทนายความ/ที่ปรึกษา PDPA ตรวจสอบก่อน go-live

**5.2 Audit Log Retention**
ระบบ spec ว่าต้องเก็บ audit log ทุก mutation
- ~~เก็บนานแค่ไหน?~~ → **ตอบแล้ว 03/07/2569: 5 ปี** (อ้างอิง พ.ร.บ.การบัญชี พ.ศ. 2543)
- ต้องการ export audit log ออกมาไหม และในรูปแบบใด? — ยังไม่ตอบ (ไม่บล็อก go-live)

**5.3 Backup Policy**
- ~~RPO ต้องการที่เท่าไหร่?~~ → **ตอบแล้ว 03/07/2569: 24 ชั่วโมง** — ใช้ daily automated backup ที่มากับ Supabase Pro plan (ไม่เปิด PITR add-on ที่ $100/เดือนเพิ่ม)
- ~~RTO ต้องการที่เท่าไหร่?~~ → **ตอบแล้ว 03/07/2569: 24 ชั่วโมง**

---

## สรุปลำดับความสำคัญ

| # | รายการ | ต้องตัดสินใจก่อน | ผลกระทบ |
|---|--------|-----------------|---------|
| 🔴 | เลขที่ใบกำกับภาษี format (C1) | ก่อนออก invoice แรก | เปลี่ยนไม่ได้ |
| ✅ | Tech Stack / Permission architecture (2.1, 2.2) | ~~ก่อน implement~~ | ปิดแล้ว DEC-001, 002 |
| ✅ | File Storage (2.3) | ~~ก่อน implement~~ | ปิดแล้ว DEC-003 |
| 🟡 | ชื่อ Product (1.1) | ก่อน deploy | กระทบ URL/branding |
| ✅ | Client Portal **Phase** (1.2) — ~~scope ปิดแล้ว เหลือแค่ deploy เฟสไหน~~ ตัดสินใจแล้ว 04/07/2569: **Phase 1** | ~~ก่อน deploy~~ | ปิดแล้ว — implement เป็น Phase 7 ใน `implementation-todo.md` (ตามลำดับ dependency ของโมดูล) |
| 🟡 | Bank File format + encoding (F1) | ก่อนทดสอบ payout | ต้องทดสอบกับธนาคาร |
| 🟡 | e-Tax Invoice / e-WHT integration (4.3) | ก่อนกำหนด scope เฟส 2 | ต้องลงทะเบียนกรมสรรพากร |
| 🟢 | PDPA, Backup, Retention (5.x) | ก่อน go-live | compliance risk |
