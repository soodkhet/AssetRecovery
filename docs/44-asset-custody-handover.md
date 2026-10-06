# 44-asset-custody-handover.md

# 44 — Asset Custody & Handover (คลังสินค้าและการส่งมอบทรัพย์คืน)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — โครงสร้างตามมาตรฐานเอกสารชุดใหม่)
> Document Level: Case & Field Operations Module — Build Spec / Implementation-ready
> เอกสารอ้างอิง: `41-field-tracker-mobile.md` §6.6, `15-claims-and-advances.md`, `19-revenue-billing-receivable.md` §6.1, `23-finance-state-machines.md`, `38-case-submission.md`
> Supersedes: flag `pending_warehouse_confirm` แบบหยาบเดิม (ไฟล์ 41 §6.6) — ปิด Open Item #3 จากไฟล์ 41

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | ออกแบบเสร็จสมบูรณ์ พร้อม Mockup (`warehouse.html`) |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ (header/Changelog + แยก Decisions/Open Items ชัดเจน) — **เนื้อหา business logic เดิมคงไว้ครบ 100% ไม่มีการเปลี่ยนแปลง** |
| v2.1 | 14/08/2569 | §12 เพิ่ม 3 code ที่ตารางเดิมตกหล่น (`ASSET_NOT_FOUND`, `ASSET_INVALID_STATUS`, `LOT_NOT_FOUND`) — code ระดับ "ไม่พบ/สถานะไม่ตรง" ที่ทุก endpoint ของ §15 ต้องใช้ ลงพร้อม implementation Phase 2.13 ตาม Rule 04 (doc + code คอมมิตเดียวกัน) · **business logic เดิมไม่เปลี่ยน** |
| v2.2 | 03/10/2569 | **มติ PO 03/10/2569 (UAT Q13 · หนี้ #1) — แทนที่ "แนบใหม่ = ทับ" ของ §6.4 เดิม**: เอกสารล็อตใช้ path **ต่อเวอร์ชัน** `handover-lots/{lotId}/signed-doc/{uuid}.{ext}` / `handover-lots/{lotId}/delivery-proof/{uuid}.{ext}` (อัปโหลดแบบไม่ทับ — ไฟล์เดิมคงอยู่ให้ตามรอย) + ผูกเข้าล็อตผ่าน `POST /api/handover-lots/:id/documents` (§15) ที่ตรวจว่าล็อตยังไม่ `confirmed` แล้ว server ตรวจไฟล์เอง (มีจริง · path ใต้ล็อต/ชนิดนั้น · PDF/รูปจาก magic bytes · ≤ 10 MB) และเก็บ `signed_doc_hash`/`delivery_proof_hash` · `PATCH …/confirm` ที่ส่ง url ที่ยังไม่ผ่านการตรวจ (หรือไฟล์ที่แนบก่อนมติ) ถูกตรวจแบบเดียวกันก่อนยืนยัน · รูปรับเข้าคลัง (§8.2) ตรวจแบบเดียวกันใต้ `assets/{assetId}/intake/` แล้วเก็บ `assets.photo_hashes` · error `UPLOAD_*` อยู่ `24` §6.3 |
| v2.3 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U22–U24)**: (U22 · BUG-076) §5/§13 ผู้จัดการทีม/หัวหน้าทีม **อ่านคลังอย่างเดียว** เฉพาะทรัพย์ของเคสในทีมที่ตนดูแล (`team_managers` / ทีมของหัวหน้า — `06` §7.2 "✅ (read)") ผ่าน `intake_asset` ระดับ `view` · ทีมอื่นไม่เห็น (list กรอง · detail ตอบ `ASSET_NOT_FOUND`/`LOT_NOT_FOUND`) · ล็อตเห็นเฉพาะเครื่องของทีมตัวเอง ไม่เห็นไฟล์ทั้งล็อตและ export ไม่ได้ · ค่าเริ่มต้นไม่ให้สิทธิ์รับเข้า/ตีกลับกับผู้จัดการทีม (มอบเพิ่มได้ที่ตั้งค่าสิทธิ์) · (U23 · BUG-084) §13 Export Excel/PDF เพิ่ม **บริหาร** (อ่านอย่างเดียว ไม่แก้ล็อต) · (U24 · BUG-078) §6.5/§10/§18 IMEI รับเข้า = ตัดเฉพาะตัวคั่น ช่องว่าง/ขีด/จุด ทุกตำแหน่ง แล้วต้องเหลือตัวเลขล้วน 15 หลักพอดี — มีอักขระอื่นหรือไม่ครบ/เกิน = ปฏิเสธว่ารูปแบบผิด (ไม่ตัดทิ้งเงียบ ๆ) · เก็บเป็นตัวเลข 15 หลักล้วน · เทียบ exact ทุกหลัก ไม่ fuzzy ไม่ตรวจ Luhn (แทนข้อความเดิม "ห้าม trim, ห้าม ignore dash") |
| v2.4 | 05/10/2569 | **มติ PO 05/10/2569 (U54)**: §6.5 เติมคำเตือน (ไม่บล็อก) ตอนส่งเคส — ค่าในช่อง "IMEI หรือ Serial" ที่มีตัวอักษรถูกจัดเป็น Serial เสมอ (กติกา U24 คงเดิม) แต่ถ้าดูเหมือน IMEI พิมพ์ผิด (ตัดตัวคั่นแล้วเหลือ 15 ตัว = ตัวเลข 13–14 ตัว + O/o/I/l/S/B/Z) ระบบเตือนให้ตรวจอีกครั้ง · ไม่ fuzzy แก้ค่าให้ · ไม่กระทบการเทียบ exact match ตอนรับเข้าคลัง |
| v2.5 | 05/10/2569 | **มติ PO U64 (แก้บั๊ก UAT ค้าง)**: (BUG-074) §8.2 ขั้น 1/3 + §12 — ยืนยันรับเข้าโดย**ไม่กรอกค่าที่ตรวจจริง** = `REQUIRED_MISSING` (code กลางของ `24` §6.1 — ไม่ตั้ง code ใหม่): สัญญามี IMEI ⇒ บังคับ IMEI · เครื่องที่มีแค่ serial (A6) ⇒ บังคับ serial แทน · สัญญาไม่มีทั้งคู่ ⇒ กรอกช่องใดก็ได้ — "ว่าง" = ยังไม่ได้ตรวจ ต่างจาก "ไม่ตรงสัญญา" (`IMEI_MISMATCH` เตือนแล้วไปต่อได้เหมือนเดิม) · (BUG-075) §15 body ของ `reject-intake` รับ `imeiActual`/`serialActual` ที่ตรวจพบ (ไม่บังคับ — อ่าน IMEI ไม่ได้ก็ตีกลับได้ · รูปแบบผ่าน `parseImei()`) บันทึกลงเครื่อง + audit `asset.intake_rejected` เก็บ before/after ตาม §14 · (BUG-080) §6.4 ใบส่งมอบ PDF/Excel แสดง "วันนัดรับ"/"กำหนดจัดส่ง" ตามหน้าดูตัวอย่าง · (BUG-077) คอลัมน์วันที่รับเข้าแสดงวันเวลา · ไม่มีการเปลี่ยน state/enum |
| v2.7 | 07/10/2569 | มติ PO 07/10/2569 **U142** — §8.1/§8.5 แท็บ "ส่งมอบแล้ว" เปลี่ยนจากการ์ดสะสมไม่จำกัดเป็น**ตารางจัดกลุ่มตามบริษัท**: ค่าเริ่มต้น = เดือนปัจจุบัน (เวลาไทย · เลื่อนเดือนได้ · ป้าย พ.ศ.) · หัวกลุ่ม (ล็อต · เครื่อง · รอเอกสาร) คิดฝั่ง server · แบ่งหน้าจริงต่อบริษัทแทนเพดาน 200 · "วันส่งมอบ" = วันส่งมอบจริง → กำหนดส่ง → วันสร้าง · ตัวกรองเดิมคงไว้และกรองที่ server ทั้งหมด · §15 เพิ่ม `handedOverFrom`/`handedOverTo` + `GET /api/handover-lots/company-summary` (`45` v1.9) · แท็บ "รอส่งมอบ" ไม่เปลี่ยน · ไม่มีการเปลี่ยน state/enum/schema |
| v2.6 | 06/10/2569 | มติ PO 06/10/2569 **U111** — ยืนยันล็อต (`$transaction` เดิม ไม่เพิ่มขั้น) บันทึก `handover_lots.letterhead_snapshot` (ชื่อ/ชื่ออังกฤษ/เลขผู้เสียภาษี/สาขา/ที่อยู่/โทร/อีเมล/เว็บไซต์/โลโก้ + SHA-256) พร้อมการยึดล็อต — rollback ไปด้วยกัน · ใบส่งมอบพิมพ์ซ้ำ (ภายใน + พอร์ทัล) ใช้ snapshot ทั้งหัวกระดาษและช่องผู้ส่งมอบ · ล็อตก่อน U111/ยังไม่ยืนยัน = ค่าปัจจุบัน · ล็อต confirmed แก้ snapshot ไม่ได้ (trigger immutable เดิม) |
| v2.7 | 07/10/2569 | **มติ PO U129 + O72(1)**: §12 เพิ่ม `IMEI_DUPLICATE_ACTIVE_ASSET` (ปิดงานสำเร็จที่ IMEI ซ้ำเครื่องที่ยังไม่ส่งมอบ = 400 แทน 500) และ `PERIOD_LOCKED_DIRECT_EDIT` ตอนยืนยันล็อตในงวดที่ปิดแล้ว (รายได้ลงวันยืนยันล็อต — `19` v2.10) |

ขอบเขตเอกสารนี้: โมดูลบริหารจัดการสินทรัพย์ที่ยึดคืนจากเคส `closed_success` ตั้งแต่รับเข้าคลัง ตรวจสภาพ จัดล็อตส่งมอบ จนถึงยืนยันส่งมอบคืนบริษัทไฟแนนซ์ — พร้อม trigger ปลดล็อก expense และสร้าง Revenue อัตโนมัติเมื่อล็อต confirmed

**ไม่รวมอยู่ในไฟล์นี้**: GPS tracking การขนส่ง (เฟส 2), Auto Notification ไปบริษัทไฟแนนซ์ (เฟส 2)

---

## 1. Summary
โมดูลบริหารจัดการสินทรัพย์ที่ยึดคืนจากเคส `closed_success` ตั้งแต่รับเข้าคลัง ตรวจสภาพ จัดล็อตส่งมอบ จนถึงยืนยันส่งมอบคืนบริษัทไฟแนนซ์ — และ trigger ปลดล็อก expense + Revenue อัตโนมัติ

## 2. Purpose
แทนที่ flag หยาบ `pending_warehouse_confirm` (ไฟล์ 41 §6.6) ด้วย module จริงที่มี state machine ครบ เชื่อม 3 module:
- **expense** (ไฟล์ 15): ปลดล็อกเมื่อ Lot confirmed
- **Revenue** (ไฟล์ 19): trigger สร้างเมื่อ Lot confirmed + expense approved
- **Case** (ไฟล์ 38): ปิดสมบูรณ์เมื่อ asset ทุกตัว handed_over

## 3. In Scope
- รับเครื่องเข้าคลัง: ตรวจ IMEI, บันทึกสภาพ, ถ่ายรูป 7 มุม
- ตีกลับ (intake_rejected): IMEI ไม่ตรง — ยังไม่รับเข้าคลัง
- ในคลัง: ดูรายการเครื่อง grouped by บริษัทไฟแนนซ์
- นัดวันส่งมอบ (สร้าง Lot): เลือกเครื่อง + รูปแบบ + วันนัด
- ออกใบส่งมอบ PDF อัตโนมัติ
- แนบเอกสารและยืนยัน Lot → ปลดล็อก expense + Revenue

## 4. Out of Scope
- GPS Tracking การขนส่ง (เฟส 2)
- Auto Notification ไปบริษัทไฟแนนซ์ (เฟส 2)
- Inventory Management (สต็อก อุปกรณ์อื่น ฯลฯ)
- เคส `closed_fail` — ไม่มีการยึดทรัพย์ ไม่ผ่านโมดูลนี้เลย

---

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| ธุรการ / Admin | รับเครื่องเข้าคลัง, ตรวจ IMEI, ถ่ายรูป, ตีกลับ, สร้าง Lot, นัดวัน, แนบเอกสาร, ยืนยัน | Warehouse scope |
| ผู้จัดการทีม / Supervisor | ตรวจสอบกรณี IMEI ไม่ตรง · ดูคลังอย่างเดียวเฉพาะทรัพย์ของเคสในทีมตัวเอง (มติ PO U22) | Team scope — Read-only |
| การเงิน / Finance | ดู asset status ประกอบการอนุมัติ expense | Read-only |
| บัญชี / Accounting | ดู Lot confirmed ประกอบการลงบัญชี | Read-only |
| Executive | ดูภาพรวม Warehouse Summary | Read-only |
| บริษัทไฟแนนซ์ (Company User) | ดูสถานะ asset ของเคสบริษัทตัวเอง | Company scope — Read-only |

---

## 6. Core Concepts

### 6.1 Asset (ทรัพย์ที่ยึดคืน)
เครื่องที่ Field Agent ยึดได้จากเคส `closed_success` — **1 เคส = 1 Asset เสมอ**

Asset เกิดขึ้นอัตโนมัติเมื่อ Case เปลี่ยนเป็น `closed_success` (ไฟล์ 38) และเข้าคิวรอรับเข้าคลัง (`pending_intake`)

### 6.2 HandoverLot (ล็อตส่งมอบ)
กลุ่ม Asset ที่ส่งมอบพร้อมกันในครั้งเดียว

**กฎสำคัญ:**
- **1 Lot = 1 บริษัทไฟแนนซ์ เสมอ** — ห้ามผสมบริษัท (MIXED_COMPANY_LOT)
- **1 Lot = 1 ใบส่งมอบ** — เลขที่ออกอัตโนมัติ `DLV-YYYY-XXX` (พ.ศ.)
- **1 Lot = 1 เลขล็อต** — ออกอัตโนมัติ `LOT-YYYY-XXX` (พ.ศ.)
- เลขที่ทั้งสองไม่ซ้ำและแก้ไขไม่ได้หลังสร้าง

### 6.3 รูปแบบการส่งมอบ (HandoverType)

| Type | Description | เอกสารที่ต้องแนบก่อน confirmed | Draft อยู่ที่ tab ไหน |
|---|---|---|---|
| `finance_pickup` | บริษัทไฟแนนซ์มารับที่คลัง | ① ใบส่งมอบที่มีลายเซ็นผู้รับ | **"รอส่งมอบ"** (รอแนบเซ็น) |
| `we_deliver` | เราจัดส่งไปให้ | ① ใบส่งมอบลายเซ็น + ② หลักฐานจัดส่ง | **"ส่งมอบแล้ว"** (เครื่องออกไปแล้ว รอหลักฐาน) |

> **เหตุผลที่ we_deliver อยู่ใน "ส่งมอบแล้ว" ทันที**: เมื่อจัดส่งออกไปแล้ว เครื่องไม่อยู่ในคลังแล้ว จึงจัดอยู่ใน "ส่งมอบแล้ว" แม้จะยังรอหลักฐานยืนยัน

### 6.4 เอกสาร
- **ใบส่งมอบ PDF**: ออกจากระบบอัตโนมัติตาม template — เลขที่ไม่ซ้ำ ไม่แก้ไขได้ — พิมพ์ให้ผู้รับเซ็น แล้วสแกนแนบกลับ
- **Export Excel ต่อ Lot**: รายการเครื่องทั้งหมดในล็อต (case ref, ชื่อลูกหนี้, IMEI, สภาพ)
- **ใบส่งมอบลายเซ็น**: Supabase Storage — `handover-lots/{lotId}/signed-doc/{uuid}.{ext}` (path ต่อเวอร์ชัน — แนบใหม่ = เวอร์ชันใหม่ที่ล็อตชี้ ไม่ทับไฟล์เดิม · มติ PO 03/10/2569 Q13 แทนที่ "ทับ" เดิม)
- **หลักฐานจัดส่ง** (we_deliver): Supabase Storage — `handover-lots/{lotId}/delivery-proof/{uuid}.{ext}`
- **ผูกเข้าล็อตผ่าน API เท่านั้น** (`POST /api/handover-lots/:id/documents`): ตรวจว่าล็อตยังไม่ `confirmed` · server ดาวน์โหลดไฟล์มาตรวจเอง (มีจริง · path ใต้ล็อต/ชนิด · PDF หรือรูปจาก magic bytes · ≤ 10 MB) · เก็บ SHA-256 ที่ server คำนวณ (`signed_doc_hash` / `delivery_proof_hash`) — hash ที่ browser ส่งมาใช้เทียบเท่านั้น ไม่ตรง = ปฏิเสธ

### 6.5 IMEI Validation
- **รูปแบบตอนรับค่า (มติ PO 05/10/2569 U24)**: ทุกช่องทางที่รับ IMEI (ส่งเคส/นำเข้าไฟล์/API/รับเข้าคลัง) ตัด**เฉพาะตัวคั่น** ช่องว่าง / ขีด (`-`) / จุด (`.`) ทุกตำแหน่ง แล้วต้องเหลือ **ตัวเลขล้วน 15 หลักพอดี** — มีตัวอักษรหรืออักขระอื่น หรือไม่ครบ/เกิน 15 หลัก = **ปฏิเสธ** ว่ารูปแบบไม่ถูกต้อง (ห้ามตัดทิ้งเงียบ ๆ) · ไม่ตรวจ Luhn · DB เก็บเป็นตัวเลข 15 หลักล้วนเสมอ
- **เตือน IMEI พิมพ์ผิด (มติ PO U54)**: ตอนส่งเคส (ฟอร์ม/นำเข้าไฟล์/API) ค่าที่มีตัวอักษร = Serial ตามเดิม แต่ถ้าตัดตัวคั่นแล้วเหลือ 15 ตัว เป็นตัวเลข 13–14 ตัว + ตัวอักษรที่สับสนกับตัวเลข (O/o/I/l/S/B/Z) ⇒ เตือน "ดูเหมือน IMEI ที่มีตัวอักษรปน — ตรวจอีกครั้ง" **ไม่บล็อก** และไม่แก้ค่าให้
- เปรียบเทียบ `imei_actual` กับ `imei_contract` (ค่าที่ผ่านรูปแบบข้างบนแล้ว) แบบ **exact match ทุกหลัก**
- ห้าม fuzzy match เด็ดขาด — IMEI ที่ต่างกัน 1 หลักถือว่าไม่ตรง
- ถ้าไม่ตรง: แสดงค่าทั้งสองเคียงกันให้ธุรการเปรียบเทียบ และแนะนำให้ตีกลับ

---

## 7. Data Entities / Required Objects

### 7.1 Asset

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | ✅ | Primary key |
| organization_id | uuid | ✅ | Multi-tenant (ไฟล์ 02 §5) |
| case_id | uuid | ✅ | FK → Case (ไฟล์ 38) — ต้องเป็น closed_success |
| company_id | uuid | ✅ | FK → FinanceCompany (ไฟล์ 10) |
| lot_id | uuid \| null | — | FK → HandoverLot — null ถ้ายังไม่มี Lot |
| case_ref | string | ✅ | snapshot จาก Case เช่น SF-2026-00832 |
| debtor_name | string | ✅ | snapshot ชื่อลูกหนี้ |
| device_desc | string | ✅ | ยี่ห้อ รุ่น สี |
| imei_contract | varchar(15) | ✅ | IMEI จากสัญญา (ดึงจาก Case) |
| imei_actual | varchar(15) \| null | — | IMEI ที่ตรวจจริง (null ก่อนตรวจ) |
| asset_status | enum | ✅ | ดู §9.1 |
| condition | enum \| null | — | normal / damaged / partial_loss |
| condition_note | string \| null | — | บังคับถ้า condition ≠ normal |
| photos | string[] | — | Supabase Storage URLs (7 มุม) |
| closed_at | timestamptz | ✅ | วันที่เคสปิด (snapshot จาก Case) |
| received_at | timestamptz \| null | — | วันเวลารับเข้าคลัง |
| reject_reason | string \| null | — | เหตุผลตีกลับ (บังคับถ้า intake_rejected) |
| rejected_at | timestamptz \| null | — | — |
| rejected_by | uuid \| null | — | FK → User |
| created_at | timestamptz | ✅ | UTC |
| created_by | uuid | ✅ | FK → User |
| updated_at | timestamptz | ✅ | UTC |
| updated_by | uuid \| null | — | FK → User |
| deleted_at | timestamptz \| null | — | Soft delete |

**Constraints:**
- `UNIQUE(organization_id, imei_contract)` — 1 IMEI ต่อ 1 organization
- `INDEX(organization_id, asset_status)` — query รายการตาม status
- `INDEX(organization_id, company_id, asset_status)` — filter ตาม company

### 7.2 HandoverLot

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | ✅ | Primary key |
| organization_id | uuid | ✅ | Multi-tenant |
| company_id | uuid | ✅ | FK → FinanceCompany |
| lot_number | string | ✅ | Auto-gen: LOT-2569-001 — UNIQUE |
| doc_ref | string | ✅ | Auto-gen: DLV-2569-001 — UNIQUE |
| type | enum | ✅ | finance_pickup / we_deliver |
| status | enum | ✅ | ดู §9.2 |
| scheduled_at | timestamptz \| null | — | วันนัดรับ/ส่ง |
| contact_person | string \| null | — | ผู้ประสานงาน (finance_pickup) |
| delivery_addr | string \| null | — | ที่อยู่จัดส่ง (we_deliver — บังคับ) |
| delivered_at | timestamptz \| null | — | วันส่งมอบจริง (กรอกตอนยืนยัน) |
| tracking_no | string \| null | — | เลขพัสดุ (we_deliver — ไม่บังคับ กรณีไรเดอร์) |
| confirmed_at | timestamptz \| null | — | วันยืนยัน |
| confirmed_by | uuid \| null | — | FK → User |
| signed_doc_url | string \| null | — | ① ใบส่งมอบลายเซ็น (บังคับก่อน confirmed) |
| signed_doc_hash / delivery_proof_hash | string \| null | — | SHA-256 ที่ server คำนวณจากไฟล์จริงตอนแนบ (มติ PO 03/10/2569 Q13) |
| delivery_proof_url | string \| null | — | ② หลักฐานจัดส่ง (บังคับเฉพาะ we_deliver) |
| note | string \| null | — | หมายเหตุ |
| created_at | timestamptz | ✅ | UTC |
| created_by | uuid | ✅ | FK → User |
| updated_at | timestamptz | ✅ | UTC |
| updated_by | uuid \| null | — | FK → User |
| deleted_at | timestamptz \| null | — | Soft delete (ห้ามถ้า confirmed) |

**Constraints:**
- `UNIQUE(lot_number)` / `UNIQUE(doc_ref)` — ใช้ PostgreSQL sequence
- `INDEX(organization_id, status)` — filter "รอส่งมอบ"
- `INDEX(organization_id, company_id, status)` — filter ตาม company

---

## 8. UI / UX Rules (อ้างอิง warehouse.html)

### 8.1 โครงสร้างหน้า

4 แท็บหลัก (ตัวเลขใน badge = จำนวนรายการ):

| แท็บ | Badge นับจาก | หน้าตา |
|---|---|---|
| รับเข้าคลัง | `pending_intake` + `intake_rejected` | ตาราง + filter bar |
| ในคลัง | `in_custody` + `handover_pending` | การ์ด grouped by บริษัท |
| รอส่งมอบ | `pending_attach` Lots | การ์ด Lot |
| ส่งมอบแล้ว | `confirmed` + `pending_delivery_proof` Lots | ตารางจัดกลุ่มตามบริษัท (มติ PO U142) |

### 8.2 แท็บ "รับเข้าคลัง"

**Filter Bar (7 filter):**
- Search: IMEI / ชื่อลูกหนี้ / เลขสัญญา
- วันที่ปิดเคส (date picker)
- บริษัทไฟแนนซ์ (dropdown)
- ทีม (dropdown)
- พนักงาน (dropdown)
- สถานะ: รอรับเข้าคลัง / ตีกลับ
- สภาพ: ปกติ / ชำรุด / สูญหายบางส่วน

**ตาราง Columns:** เลขสัญญา | ลูกหนี้ | IMEI สัญญา | อุปกรณ์ | ทีม/พนักงาน | วันปิดเคส | สภาพ | สถานะ | Action

**Action Buttons ตามสถานะ:**
- `pending_intake` → [รับเข้าคลัง] [ตีกลับ]
- `intake_rejected` → [ดูเหตุผล] [รับใหม่]

**Modal "รับเข้าคลัง" (intake) — 3 ขั้นตอนใน modal เดียว:**

```
ขั้น 1/3: ตรวจสอบ IMEI
  - แสดง IMEI สัญญา (อ่านอย่างเดียว)
  - กรอก IMEI จริงบนเครื่อง
  - ถ้าตรง → highlight เขียว ไปขั้น 2
  - ถ้าไม่ตรง → highlight แดง เตือน แต่ยังไปต่อได้ (force proceed ถ้าธุรการยืนยัน)

ขั้น 2/3: บันทึกสภาพ
  - Radio: ปกติ / ชำรุด / อุปกรณ์ขาดหาย
  - Textarea: รายละเอียด (บังคับถ้าไม่ใช่ "ปกติ")

ขั้น 3/3: ถ่ายรูปหลักฐาน
  - File upload 7 มุม: หน้า/หลัง/บน/ล่าง/ซ้าย/ขวา/IMEI
  - Preview thumbnail
  - ปุ่ม "ยืนยันรับเข้าคลัง" → asset_status = in_custody
```

**Modal "ตีกลับ" (reject-intake):**
- แสดง Asset header (case ref, debtor, IMEI เปรียบเทียบ)
- Textarea: เหตุผลตีกลับ (บังคับ)
- ปุ่ม "ยืนยันตีกลับ" → asset_status = intake_rejected

**Modal "ดูเหตุผลตีกลับ" (view-reject):** read-only — แสดง reject_reason + rejected_at

### 8.3 แท็บ "ในคลัง"

**Filter Bar:** Search | บริษัทไฟแนนซ์

**การ์ด (grouped by บริษัทไฟแนนซ์):**
- 1 การ์ด = 1 บริษัท
- แสดง: ชื่อบริษัท | จำนวนเครื่อง (breakdown: พร้อมส่ง vs ใน Lot แล้ว)
- คลิกการ์ด → drill-down ตาราง

**Drill-down ตาราง:**
- Filter: Search | วันที่รับเข้า
- Columns: ✓ (checkbox) | Case Ref | ลูกหนี้ | อุปกรณ์ | IMEI | สภาพ | วันรับเข้า | Action
- Checkbox: เลือกได้เฉพาะ `in_custody` (ยังไม่ได้อยู่ใน Lot)
- เมื่อเลือก ≥ 1 → ปุ่ม "นัดวันส่งมอบ (N)" active
- Action: [ดู] → modal ดูรายละเอียด

**Modal "ดูรายละเอียดเครื่อง" (view-custody):** แสดง IMEI, สภาพ, รูปถ่าย, วันรับเข้า

**Modal "นัดวันส่งมอบ" (handover-lot):**
```
1. เลือกรูปแบบ (Radio card):
   🏢 บริษัทไฟแนนซ์มารับ | 🚚 เราจัดส่งไปให้
   (แต่ละ option แสดง note ว่าต้องแนบเอกสารอะไรในขั้นตอนถัดไป)

2. ข้อมูลการนัด (conditional):
   - วันนัดรับ / กำหนดจัดส่ง (datetime-local) *
   - ชื่อผู้ประสานงาน (finance_pickup — optional)
   - ที่อยู่จัดส่ง (we_deliver — บังคับ, default จากบริษัทไฟแนนซ์)

3. หมายเหตุ (optional)

4. แสดง (Auto-gen — อ่านอย่างเดียว):
   เลขล็อต: LOT-2569-XXX | เลขใบส่งมอบ: DLV-2569-XXX
   ปุ่ม: [ดูตัวอย่าง] [พิมพ์/PDF]

5. รายการเครื่อง (ด้านล่าง collapsible):
   แสดงเครื่องที่เลือกทั้งหมด + ปุ่ม Export Excel
```

### 8.4 แท็บ "รอส่งมอบ"

**แสดง:** Lot ที่ `status = pending_attach` เท่านั้น (finance_pickup รอแนบเซ็น)

**Filter Bar:** Search (เลขล็อต / IMEI / ชื่อลูกหนี้) | วันที่ | บริษัทไฟแนนซ์

**การ์ด Lot:**
- Badge ประเภท: 🏢 ไฟแนนซ์มารับ / 🚚 เราส่งให้
- Badge สถานะ: "รอแนบใบเซ็นรับ"
- แสดงเอกสารที่ต้องการ
- วันนัด
- Actions: [ดูรายการ] [แนบเอกสาร]

**Drill-down:** ตารางรายการเครื่องใน Lot + ปุ่ม [ใบส่งมอบ PDF] [แนบเซ็นรับ & ยืนยัน]

**Modal "แนบเอกสาร" (attach-doc):**
- แสดง Lot info (id, บริษัท, ประเภท, จำนวนเครื่อง)
- Banner สีตามประเภท: สีน้ำเงิน (finance_pickup) / สีส้ม (we_deliver)
- Upload zone แบ่งตามประเภท:
  - finance_pickup: 1 upload zone (ใบเซ็นรับ)
  - we_deliver: 2 upload zones (ใบเซ็นรับ + หลักฐานจัดส่ง)
- กรอกวันที่ส่งมอบจริง
- Banner สีเขียว: แจ้งผลที่จะเกิดขึ้นหลังยืนยัน (ปลดล็อก expense + Revenue)
- ปุ่ม "ยืนยันสำเร็จ" → Lot.status = confirmed + trigger side effects

### 8.5 แท็บ "ส่งมอบแล้ว"

**แสดง:** Lot ที่ `status = confirmed` + `pending_delivery_proof`

**Filter Bar:** Search (เลขล็อต / IMEI / ชื่อลูกหนี้) | วันส่งมอบ (วันเดียว) | บริษัทไฟแนนซ์ | สถานะ (รอยืนยัน / ยืนยันแล้ว) — กรองที่ server ทั้งหมด

**ตารางจัดกลุ่มตามบริษัท (มติ PO 07/10/2569 U142 — แทนการ์ด Lot เดิมของแท็บนี้ · แท็บ "รอส่งมอบ" ยังเป็นการ์ดเหมือนเดิม):**
- **เดือน**: ค่าเริ่มต้น = เดือนปัจจุบันตามเวลาไทย · ปุ่มเดือนก่อน/เดือนถัดไป/กลับเดือนนี้ · ป้ายเดือนเป็น พ.ศ. · เลือก "วันส่งมอบ" วันเดียว = กรองวันนั้น (เดือนขยับตาม) · เลื่อนเดือน = ล้างวันที่เลือก
- **"วันส่งมอบ" ของล็อต** = วันส่งมอบจริง (`delivered_at` — ตั้งตอนยืนยัน) → ยังไม่ยืนยัน (we_deliver รอหลักฐาน) ใช้กำหนดส่ง (`scheduled_at`) → ไม่มีกำหนดส่งใช้วันสร้างล็อต ⇒ ล็อตที่รอหลักฐานยังโผล่ในเดือนที่ของออกจากคลัง · ขอบวันตามปฏิทินไทย (00:00 น. ไทย = 17:00Z ของวันก่อน)
- **แถวหัวกลุ่มต่อบริษัท**: ชื่อบริษัท · จำนวนล็อต · เครื่องรวม · รอเอกสารกี่ล็อต (หรือ "ยืนยันครบ") · กดกาง/หุบ (มีบริษัทเดียว = กางให้อัตโนมัติ) — ยอดคิด**ฝั่ง server** (`GET /api/handover-lots/company-summary`) ตามตัวกรอง + scope เดียวกับรายการล็อต ไม่ใช่นับจากหน้าที่โหลด · จำนวนเครื่องนับเฉพาะเครื่องที่ผู้ใช้มองเห็น
- **แถวล็อต**: เลขล็อต (font-mono) + เลขใบส่งมอบ · ประเภท · วันส่งมอบจริง (ยังไม่มี = "—" + กำหนดส่ง) · วันยืนยัน · จำนวนเครื่อง · สถานะ (statusBadge กลาง: amber = รอแนบหลักฐาน · emerald = ยืนยันแล้ว) · Actions: [ดูรายการ] [แนบเอกสาร] (ยังไม่ยืนยัน · เฉพาะผู้มีสิทธิ์ยืนยัน) หรือ [เอกสาร] (confirmed)
- **แบ่งหน้าจริงต่อบริษัท** (20 ล็อต/หน้า · ก่อนหน้า/ถัดไป) — แทนเพดาน 200 ล็อต + ข้อความ "แสดงไม่ครบ" เดิม · เรียงล็อตที่ยังไม่มีวันส่งมอบจริงขึ้นก่อน แล้วตามวันส่งมอบจริงล่าสุด
- ครบ loading / empty ("ไม่มีล็อตที่ส่งมอบในช่วงนี้") / error (ลองใหม่) · มือถือเลื่อนตารางแนวนอนได้

**Modal "ดูเอกสารที่แนบ" (view-attached-doc):**
- แสดง Lot info + ประเภท
- finance_pickup: 1 เอกสาร (ใบเซ็นรับ) + ปุ่ม download
- we_deliver: 2 เอกสาร (ใบเซ็นรับ + หลักฐาน) + ปุ่ม download แต่ละชิ้น

---

## 9. Workflow / State Machines

### 9.1 Asset Status Flow

```mermaid
stateDiagram-v2
    [*] --> pending_intake : Case = closed_success (auto-create)

    pending_intake --> in_custody : IMEI ตรง + บันทึกสภาพ + รูปถ่าย
    pending_intake --> intake_rejected : IMEI ไม่ตรง + กรอก reason

    intake_rejected --> pending_intake : กดรับใหม่ (retry)

    in_custody --> handover_pending : ถูกใส่เข้า HandoverLot

    handover_pending --> handed_over : HandoverLot.status = confirmed

    note right of handed_over
        Terminal State
        ปลดล็อก expense
        trigger Revenue
    end note
```

### 9.2 HandoverLot Status Flow

```mermaid
stateDiagram-v2
    [*] --> pending_attach : สร้าง Lot (finance_pickup)
    [*] --> pending_delivery_proof : สร้าง Lot (we_deliver)

    note left of pending_attach
        อยู่ใน Tab "รอส่งมอบ"
        รอแนบใบเซ็นรับ
    end note

    note right of pending_delivery_proof
        อยู่ใน Tab "ส่งมอบแล้ว"
        เครื่องออกไปแล้ว
        รอแนบหลักฐาน
    end note

    pending_attach --> confirmed : แนบใบเซ็นรับ + วันส่งมอบจริง
    pending_delivery_proof --> confirmed : แนบใบเซ็นรับ + หลักฐานจัดส่ง + วันส่งมอบจริง

    note right of confirmed
        Terminal State
        Trigger side effects (§11)
    end note
```

### 9.3 สรุป Draft / Confirmed ใน UI

| Lot status | Tab | Label |
|---|---|---|
| `pending_attach` | รอส่งมอบ | รอแนบใบเซ็นรับ (amber) |
| `pending_delivery_proof` | ส่งมอบแล้ว | รอแนบหลักฐานจัดส่ง (amber) |
| `confirmed` | ส่งมอบแล้ว | ยืนยันแล้ว ✅ (emerald) |

---

## 10. Security / Control Rules

| Rule | Detail |
|---|---|
| IMEI Exact Match | ตัดเฉพาะช่องว่าง/ขีด/จุด แล้วต้องเหลือตัวเลข 15 หลักพอดี (ไม่งั้นปฏิเสธว่ารูปแบบผิด — มติ PO U24) · เปรียบเทียบ 15 หลักตรงกันเป๊ะ ห้าม fuzzy |
| Reject Requires Reason | reject_reason บังคับ ห้าม null/empty string |
| Condition Note | บังคับถ้า condition = damaged หรือ partial_loss |
| Lot Must Have Assets | ห้ามสร้าง Lot ที่ asset_ids ว่าง (EMPTY_LOT) |
| 1 Lot = 1 Company | ทุก Asset ใน Lot ต้องมี company_id เดียวกัน (MIXED_COMPANY_LOT) |
| Asset Must Be in_custody | ห้ามใส่ Asset ที่ไม่ใช่ `in_custody` เข้า Lot |
| Asset Already in Lot | ห้ามใส่ Asset ที่มี `lot_id` แล้วเข้า Lot อื่น |
| Confirmed is Terminal | ห้ามแก้ไข / เพิ่ม / ลด Asset ใน Lot ที่ confirmed แล้ว |
| Confirm Requires Docs | signed_doc_url บังคับทุกประเภท + delivery_proof_url บังคับเฉพาะ we_deliver |
| Lot Number Immutable | lot_number และ doc_ref ออกครั้งเดียว ไม่เปลี่ยน ไม่ recycle |

---

## 11. ผลกระทบต่อ Module อื่นเมื่อ Lot.status = confirmed

ทั้งหมดเกิดใน **Prisma `$transaction` เดียว** — ถ้า step ใด fail ต้อง rollback ทั้งหมด

```
WHEN HandoverLot.status → confirmed:

  Step 1: UPDATE assets
    SET asset_status = 'handed_over'
    WHERE lot_id = :lotId

  Step 2: UPDATE expenses (ไฟล์ 15, 41 §6.6)
    SET status = 'pending_approval'
    WHERE case_id IN (SELECT case_id FROM assets WHERE lot_id = :lotId)
      AND status = 'pending_warehouse_confirm'

  Step 3: CREATE audit_log entries
    (lot_confirmed, who, when, expense_ids_unlocked)

  Step 4: CALL RevenueService.tryCreateRevenue() (ไฟล์ 19 §6.1)
    — ตรวจแต่ละ case ที่อยู่ใน lot:
      ถ้า case.outcome = closed_success
      AND expense.status = approved (หลัง step 2)
      AND lot.status = confirmed (เพิ่งเปลี่ยน)
      → CREATE Revenue record
```

| Module | Event | อ้างอิง |
|---|---|---|
| Asset | asset_status → handed_over | §9.1 |
| Expense (ไฟล์ 15) | status: pending_warehouse_confirm → pending_approval | ไฟล์ 41 §6.6 |
| Revenue (ไฟล์ 19) | tryCreateRevenue() trigger | ไฟล์ 19 §6.1 |
| Case (ไฟล์ 38) | ปิดสมบูรณ์ (ทุก asset = handed_over) | ไฟล์ 38 |
| Accounting (ไฟล์ 32) | expense ปรากฏใน รอบบัญชีถัดไป | ไฟล์ 32 |
| Audit Log | บันทึก lot_confirmed + expense_ids_unlocked | ไฟล์ 90 |

---

## 12. Validation & Error Handling

| Code | Condition | System Behavior |
|---|---|---|
| `IMEI_MISMATCH` | imei_actual ≠ imei_contract (exact) | แสดงค่าทั้งสองเปรียบเทียบ + เตือน แต่ไม่ block (ธุรการยืนยันได้) |
| `INTAKE_MISSING_CONDITION` | ยืนยันรับโดยไม่เลือกสภาพ | reject — inline error |
| `REQUIRED_MISSING` | ยืนยันรับโดยไม่กรอกค่าที่ตรวจจริง (IMEI · หรือ serial สำหรับเครื่องที่ไม่มี IMEI) | reject — inline error (code กลาง `24` §6.1) |
| `INTAKE_MISSING_NOTE` | condition = damaged/partial_loss ไม่มี note | reject — inline error |
| `REJECT_MISSING_REASON` | กดตีกลับโดยไม่กรอก reason | reject — inline error |
| `MIXED_COMPANY_LOT` | Asset ใน Lot มี company_id ต่างกัน | reject — show mismatched companies |
| `EMPTY_LOT` | สร้าง Lot โดยไม่เลือก Asset | reject |
| `ASSET_NOT_IN_CUSTODY` | เลือก Asset ที่ไม่ใช่ in_custody | reject — ระบุ asset IDs |
| `ASSET_ALREADY_IN_LOT` | Asset มี lot_id แล้ว | reject — ระบุ lot number |
| `LOT_MISSING_SIGNED_DOC` | ยืนยัน Lot ไม่แนบใบเซ็นรับ | reject — บังคับทุกประเภท |
| `LOT_MISSING_DELIVERY_PROOF` | ยืนยัน we_deliver ไม่แนบหลักฐาน | reject |
| `LOT_ALREADY_CONFIRMED` | แก้ไข/เพิ่ม/ลด Asset ใน Lot ที่ confirmed | reject — Terminal State |
| `CONFIRM_TRANSACTION_FAILED` | side effects ใน $transaction fail | rollback ทั้งหมด + alert |
| `ASSET_NOT_FOUND` | ไม่พบ asset ที่ระบุ **หรือ** อยู่นอก scope ของผู้เรียก | reject 404 — ข้อความเดียวกันทั้งสองกรณี (ห้าม leak ว่ามีของบริษัทอื่นอยู่จริง §13) |
| `ASSET_INVALID_STATUS` | asset_status ปัจจุบันไม่รองรับ action ที่สั่ง (§9.1) | reject — ให้รีเฟรชแล้วลองใหม่ (กันสองคนกดพร้อมกัน) |
| `LOT_NOT_FOUND` | ไม่พบ lot ที่ระบุ **หรือ** อยู่นอก scope ของผู้เรียก | reject 404 — เช่นเดียวกับ `ASSET_NOT_FOUND` |
| `IMEI_DUPLICATE_ACTIVE_ASSET` | ปิดงานสำเร็จ (สร้าง asset §6.1) แต่ IMEI ตามสัญญาตรงกับเครื่องอีกเครื่องที่ยัง**ไม่** `handed_over` (`uniq_assets_active_imei`) — มติ PO U129 | reject 400 — ข้อความระบุ IMEI + เลขเคสของเครื่องเดิม ให้ติดต่อคลังตรวจสอบ (เดิมหลุดเป็น 500) · ตอนส่งเคส/นำเข้าเป็นแค่คำเตือนในฟอร์ม (`38`) |
| `PERIOD_LOCKED_DIRECT_EDIT` | ยืนยันล็อตขณะงวดบัญชีของวันยืนยันถูกส่งสำนักงานบัญชี/ล็อกแล้ว — รายได้รับรู้ ณ วันยืนยันล็อต (มติ PO O72(1) · `19` §7.1) | reject 400 — ล็อตไม่ขยับ · ยืนยันได้เมื่อเข้างวดถัดไป หรือขอผู้บริหารปลดล็อกงวด |

---

## 13. Permission Requirements

| Capability | Roles ที่ทำได้ | Notes |
|---|---|---|
| ดูทุกรายการ | Superadmin, Executive, การเงิน, บัญชี | Read-only |
| ดูทรัพย์ของเคสในทีมตัวเอง | ผู้จัดการทีม, หัวหน้าทีม (ทั้ง in-house/outsource) | Read-only · team scope (`team_managers` / ทีมของหัวหน้า) — ทีมอื่นไม่เห็น · ล็อตเห็นเฉพาะเครื่องของทีม ไม่เห็นไฟล์ทั้งล็อต · ไม่มีปุ่มแก้ไข (มติ PO U22) |
| รับเครื่องเข้าคลัง | ธุรการ, ผู้จัดการทีม¹ | — |
| ตีกลับ IMEI ไม่ตรง | ธุรการ, ผู้จัดการทีม¹ | บังคับกรอก reason |
| สร้าง Lot / นัดวัน | ธุรการ | — |
| แนบเอกสาร / ยืนยัน Lot | ธุรการ | — |
| ดูสถานะ Asset บริษัทตัวเอง | Company User (ไฟล์ 10) | company_id scope เท่านั้น |
| Export Excel / PDF | ธุรการ, การเงิน, บัญชี, บริหาร | บริหาร = อ่านอย่างเดียว ไม่แก้ล็อต (มติ PO U23) · ผู้จัดการ/หัวหน้าทีมไม่มีสิทธิ์ (ใบส่งมอบมีเครื่องของทีมอื่นปน) |

> ¹ ค่าเริ่มต้นของระบบ**ไม่ให้**สิทธิ์รับเข้า/ตีกลับกับผู้จัดการทีม (ธุรการเป็นผู้ทำงานคลัง — มติ PO 03/10/2569 UAT Q1 · และ U22 ให้ผู้จัดการ/หัวหน้าทีม "อ่านอย่างเดียว") — Superadmin มอบเพิ่มได้ที่หน้าตั้งค่าสิทธิ์

---

## 14. Audit Log Requirements

ทุก event บันทึกตาม AuditLog schema (ไฟล์ 90):

| Event | Fields ที่บันทึก |
|---|---|
| `asset.intake` | asset_id, imei_actual, imei_match, condition, photos_count, received_at |
| `asset.intake_rejected` | asset_id, imei_actual, imei_contract, reject_reason |
| `asset.intake_retry` | asset_id (reset from intake_rejected) |
| `lot.created` | lot_id, lot_number, type, company_id, asset_ids, scheduled_at |
| `lot.doc_attached` | lot_id, doc_type (signed/delivery_proof), file_url |
| `lot.confirmed` | lot_id, confirmed_by, confirmed_at, expense_ids_unlocked[], revenue_ids_created[] |

ห้ามแก้ไข audit log ย้อนหลัง

---

## 15. API Endpoints

### Assets

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/assets` | internal | List assets with filter |
| GET | `/api/assets/:id` | internal | Get single asset + lot info |
| POST | `/api/assets/:id/intake` | ธุรการ+ | รับเข้าคลัง |
| POST | `/api/assets/:id/reject-intake` | ธุรการ+ | ตีกลับ |

**GET /api/assets — Query Params:**
```
status?:    AssetStatus | AssetStatus[]
companyId?: string
teamId?:    string
agentId?:   string
condition?: AssetCondition
search?:    string   // caseRef | debtorName | imeiContract
dateFrom?:  string   // ISO date
dateTo?:    string
page?:      number   (default: 1)
limit?:     number   (default: 50)
```

**POST /api/assets/:id/intake — Request Body:**
```json
{
  "imeiActual":    "355000000000001",
  "condition":     "normal",
  "conditionNote": null,
  "photos":        ["https://storage.../front.jpg", "..."]
}
```

**POST /api/assets/:id/reject-intake — Request Body:**
```json
{
  "rejectReason": "IMEI บนเครื่อง (355000000000999) ไม่ตรงกับสัญญา (355000000000001)",
  "imeiActual":   "355000000000999",
  "serialActual": null
}
```
`imeiActual`/`serialActual` ไม่บังคับ (v2.4) — ไม่ส่ง = คงค่าเดิมของเครื่อง

### HandoverLots

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/handover-lots` | internal | List lots with filter |
| GET | `/api/handover-lots/company-summary` | internal | ยอดรวมต่อบริษัทของแท็บ "ส่งมอบแล้ว" (ล็อต · เครื่อง · ยังไม่ยืนยัน) — ตัวกรองเดียวกับ list ไม่มี page/limit · scope เดียวกัน (มติ PO U142) |
| GET | `/api/handover-lots/:id` | internal | Get lot + assets |
| POST | `/api/handover-lots` | ธุรการ | สร้าง Lot + นัดวัน |
| POST | `/api/handover-lots/:id/documents` | ธุรการ | ผูกเอกสารที่อัปโหลดแล้ว (body: `document`, `fileUrl`, `fileHash?`) — server ตรวจไฟล์ + เก็บ SHA-256 · ล็อต confirmed แล้วไม่ได้ (§6.4 · มติ PO 03/10/2569 Q13) |
| PATCH | `/api/handover-lots/:id/confirm` | ธุรการ | ยืนยัน + แนบเอกสาร → trigger side effects |
| GET | `/api/handover-lots/:id/pdf` | ธุรการ+ | ดาวน์โหลดใบส่งมอบ PDF |
| GET | `/api/handover-lots/:id/export-excel` | ธุรการ+ | Export รายการเครื่องใน Lot |

**GET /api/handover-lots — Query Params:**
```
status?:    HandoverLotStatus | HandoverLotStatus[]
companyId?: string
type?:      HandoverType
dateFrom?:  string
dateTo?:    string
handedOverFrom?: string  // YYYY-MM-DD วันตามปฏิทินไทย — ช่วง "วันส่งมอบ" (delivered_at → scheduled_at → created_at) · มติ PO U142
handedOverTo?:   string  // รวมวันสุดท้าย
search?:    string   // lotNumber | docRef
page?:      number
limit?:     number
```

**POST /api/handover-lots — Request Body:**
```json
{
  "companyId":    "uuid",
  "assetIds":     ["uuid1", "uuid2"],
  "type":         "finance_pickup",
  "scheduledAt":  "2569-07-10T10:00:00+07:00",
  "contactPerson": "คุณวิภา ฝ่ายติดตามทรัพย์",
  "deliveryAddr": null,
  "trackingNo":   null,
  "note":         ""
}
```

**PATCH /api/handover-lots/:id/confirm — Request Body:**
```json
{
  "deliveredAt":       "2569-07-10T11:30:00+07:00",
  "signedDocUrl":      "https://storage.../signed-doc.pdf",
  "deliveryProofUrl":  null
}
```

**Response ทุก endpoint:**
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```

**Error Response:**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code":    "MIXED_COMPANY_LOT",
    "message": "ไม่สามารถสร้าง Lot ที่มี Asset จากบริษัทไฟแนนซ์ต่างกันได้",
    "field":   "assetIds"
  }
}
```

---

## 16. Acceptance Criteria

- [ ] เคส `closed_success` สร้าง Asset อัตโนมัติพร้อม `pending_intake`
- [ ] IMEI mismatch แสดงค่าทั้งสองเปรียบเทียบ — ไม่ block แต่เตือน
- [ ] condition = damaged/partial_loss บังคับกรอก note
- [ ] lot_number และ doc_ref ไม่ซ้ำกันข้าม organization
- [ ] ห้ามผสม company ใน Lot เดียว
- [ ] finance_pickup Lot → `pending_attach` → อยู่ใน "รอส่งมอบ"
- [ ] we_deliver Lot → `pending_delivery_proof` → ย้ายไป "ส่งมอบแล้ว" ทันที
- [ ] ยืนยัน Lot → expense `pending_warehouse_confirm` → `pending_approval` ใน $transaction เดียวกัน
- [ ] ยืนยัน Lot → Revenue trigger ถูกต้องตามไฟล์ 19 §6.1
- [ ] Lot `confirmed` แก้ไขย้อนหลังไม่ได้
- [ ] Export PDF และ Excel ถูกต้องตรงกับข้อมูลจริง

---

## 17. Test Cases

| # | Test Case | Steps | Expected Result |
|---|---|---|---|
| T01 | รับเครื่อง IMEI ตรง + normal | กรอก IMEI ตรง เลือก normal กด confirm | asset_status = in_custody |
| T02 | รับเครื่อง IMEI ตรง + damaged (ไม่มี note) | เลือก damaged ไม่กรอก note | reject INTAKE_MISSING_NOTE |
| T03 | IMEI ไม่ตรง แต่ยืนยันรับต่อ | กรอก IMEI ต่างจากสัญญา กด force proceed | รับได้ แต่ imei_actual ≠ imei_contract บันทึกไว้ |
| T04 | ตีกลับไม่กรอก reason | กดตีกลับ ปล่อย reason ว่าง | reject REJECT_MISSING_REASON |
| T05 | สร้าง Lot mixed company | เลือก asset ต่างบริษัท | reject MIXED_COMPANY_LOT |
| T06 | สร้าง Lot asset ว่าง | กด confirm ไม่เลือก asset | reject EMPTY_LOT |
| T07 | finance_pickup Lot — อยู่ใน tab ไหน | สร้าง finance_pickup Lot | ปรากฏใน "รอส่งมอบ" เท่านั้น |
| T08 | we_deliver Lot — อยู่ใน tab ไหน | สร้าง we_deliver Lot | ปรากฏใน "ส่งมอบแล้ว" ทันที |
| T09 | ยืนยัน finance_pickup ไม่แนบเซ็น | กด confirm ไม่ upload signed_doc | reject LOT_MISSING_SIGNED_DOC |
| T10 | ยืนยัน we_deliver แนบครบ | upload signed_doc + delivery_proof | status = confirmed → expense ปลดล็อก |
| T11 | $transaction rollback | mock DB fail ใน step 2 | Lot ไม่ confirmed, expense ไม่เปลี่ยน |
| T12 | Revenue trigger | Lot confirmed + expense = approved | Revenue record ถูกสร้าง (ไฟล์ 19 §6.1) |
| T13 | Revenue ยังไม่เกิด | Lot confirmed แต่ expense ยัง pending_approval | Revenue ยังไม่สร้าง — รอ expense approved |
| T14 | แก้ไข Lot confirmed | พยายาม PATCH Lot ที่ confirmed | reject LOT_ALREADY_CONFIRMED |
| T15 | Company User ดู asset อื่น | Company User ของ SF ดู ATF asset | 403 Permission Denied |

---

## 18. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Module นี้แทนที่ flag หยาบ `pending_warehouse_confirm`** (ไฟล์ 41 §6.6) ด้วย state machine เต็มรูปแบบ เชื่อม 3 module: expense (ไฟล์ 15), Revenue (ไฟล์ 19), Case (ไฟล์ 38) (§2)
- **1 Lot = 1 Company เท่านั้น** ทุก Asset ใน Lot ต้องมี `company_id` เดียวกัน — ห้ามสร้าง Lot ที่ asset_ids ว่าง (§10)
- **IMEI ต้อง exact match 15 หลัก** — ตอนรับค่าตัดได้เฉพาะช่องว่าง/ขีด/จุด แล้วต้องเหลือตัวเลข 15 หลักพอดี ไม่งั้นปฏิเสธ · ห้าม fuzzy (§6.5 · §10 · มติ PO U24)
- **Lot ที่ confirmed แล้วเป็น terminal state** ห้ามแก้ไข/เพิ่ม/ลด Asset ใน Lot อีก — `lot_number`/`doc_ref` ออกครั้งเดียว ไม่ recycle (§10)
- **การ confirm Lot ต้องมีเอกสารครบ**: `signed_doc_url` บังคับทุกประเภท, `delivery_proof_url` บังคับเฉพาะ `we_deliver` (§10)
- **เมื่อ Lot confirmed ทั้งหมดเกิดใน Prisma `$transaction` เดียว** — ถ้า step ใด fail ต้อง rollback ทั้งหมด: (1) asset → `handed_over` (2) expense → `pending_approval` (3) audit log (4) trigger `RevenueService.tryCreateRevenue()` (§11)
- **Revenue สร้างได้ก็ต่อเมื่อ** `case.outcome = closed_success` AND `expense.status = approved` AND `lot.status = confirmed` ครบทั้ง 3 เงื่อนไข (§11)
- **Case ปิดสมบูรณ์ก็ต่อเมื่อ asset ทุกตัวในเคส = `handed_over`** เท่านั้น (§11)

## 19. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ✅ ปิด Open Item #3 จากไฟล์ 41 — Warehouse module ออกแบบครบ
- GPS tracking การขนส่ง → เฟส 2 (ไฟล์ 41 Open Item #1)
- Auto Notification ไปบริษัทไฟแนนซ์ → เฟส 2
