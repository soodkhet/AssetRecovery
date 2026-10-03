# R4b v2 — ตีกลับหลักฐาน C4 (เจ้าหน้าที่อนุมัติเคส `uat.approver`) → พนักงานแก้หลักฐานส่งใหม่ (`uat.agent.in2`) · ค่าที่พัก (`uat.agent.in1`) · เงินทดรอง (`in1` / `in2` / `out1`)

> step sheet `uat/steps/R4.md` **v2** (R4.24–R4.38) · golden `uat/DATASET.md` **v2** · ต้นรอบ = ปลาย R4a v2 (`R4a-v2-end`)
> วันที่ทดสอบ: 03/10/2569 (พ.ศ.) 19:45–19:53 น. เวลาไทย (วันเดียวกับ R4a ⇒ TODAY = 03/10/2569, TODAY+7 = 10/10/2569, YESTERDAY = 02/10/2569)
> ผู้เล่น: role agent ผ่าน Playwright (Chrome headless · พนักงานจำลอง iPhone 14 · approver/การเงิน/ธุรการ desktop 1440×900) · สคริปต์ `uat/bin/r4v2/s12…s17-*.mjs` (log ต่อท้าย `uat/bin/r4v2/run.log`) · ภาพ `uat/shots/R4v2/24-…36-*.png` (**28 ภาพ**)
> **ผล: ✅ 15 / 🐞 3 (S4 ×1, S5 ×2 — ไม่บล็อก) / ⚠️ 0 / ❓ 2** (15 step) · **ไม่มี 500 ตลอดรอบ** (pm2 error log ไม่ถูกเขียนตั้งแต่ 19:29) · console error มีแค่ `ERR_NAME_NOT_RESOLVED` (แผนที่ BUG-062 known) และ 400 ที่ตั้งใจ (ADV-MAX)
> T0 ของ R4b (UTC) `2026-10-03 12:45:00+00` · อัปโหลดขึ้น Supabase Storage จริง **2 ไฟล์** (รูปสินค้า C4 v2 + ใบเสร็จค่าที่พัก in1) — ห้ามลบ

## สรุปผลต่อ step

| Step | เรื่อง | ผล |
|---|---|---|
| R4.24 | approver ดูหลักฐาน C3/C2/C4 + probe เหตุผลว่าง/สั้น + probe API (in2, mgr.in, C7) | ✅ |
| R4.25 | approver ตีกลับ C4 ผ่านหน้าจอ (ดับเบิลคลิก) | ✅ |
| R4.26 | in2 เห็นการตีกลับ (กระดิ่ง → `/field/tracking`) + probe ส่งใหม่ไม่แก้ไฟล์ | ✅ |
| R4.27 | in2 แทนรูปสินค้า v1 → v2 ส่งใหม่ (Q7, BUG-051) | ✅ + 🐞 R4bv2-B01 |
| R4.28 | in2 หน้าเบิก/รายได้/แดชบอร์ดหลังส่งใหม่ | ✅ |
| R4.29 | in1 เบิกค่าที่พัก ฿600 (+ probe) | ✅ + 🐞 R4bv2-B02, R4bv2-B03 |
| R4.30 | in1 หน้าเงินทดรอง + probe validation (UI + API วันย้อนหลัง Q8) | ✅ |
| R4.31 | in1 ADV1 ฿3,000 (ดับเบิลคลิก) | ✅ |
| R4.32 | in1 ADV2 ฿1,000 ซ้อนตอน ADV1 pending | ✅ |
| R4.33 | in2 ADV3 ฿2,000 — probe เมื่อวานบนจอ → วันนี้ | ✅ |
| R4.34 | out1 ADV-MAX ฿6,000 (`ADVANCE_EXCEEDS_MAX`) → ADV4 ฿1,000 | ✅ |
| R4.35 | การเงินเห็น ADV1–ADV4 รออนุมัติ (ไม่กด) | ✅ |
| R4.36 | แจ้งเตือนทั้งรอบ | ✅ (ยืนยัน B01) |
| R4.37 | audit ทั้งรอบ | ✅ |
| R4.38 | invariant ปลายรอบ | ✅ |

## ผลยืนยันจุดที่ต้องดูเป็นพิเศษ

| เรื่อง | ผล | step |
|---|---|---|
| ตีกลับหลักฐานผ่าน**หน้าจอ** (BUG-045) | ✅ ปุ่ม 'ตีกลับหลักฐานปิดงาน' ที่ footer modal รายละเอียด → modal 'ตีกลับหลักฐานปิดงาน — UAT-CO1-004' · เหตุผลว่าง / 'สั้น' / ช่องว่างล้วน → ปุ่ม 'ยืนยันตีกลับ' **disabled** ไม่มี request · ดับเบิลคลิก → POST **1 ครั้ง** · audit `reject` 1 แถว · event `case.evidence_rejected` 1 | R4.24–25 |
| แจ้งเตือนถึง in2 ลิงก์ `/field/tracking` (BUG-049) | ✅ 1 แถว 'หลักฐานปิดงานถูกตีกลับ' body 'เคส UAT-CO1-004 — รูปสินค้าไม่เห็น IMEI' · คลิกในกระดิ่ง → `/field/tracking` (ไม่ 404) บล็อกส้ม 'ถูกตีกลับ ต้องแก้ไขหลักฐาน (1)' | R4.25–26 |
| ส่งใหม่โดยไม่เปลี่ยนไฟล์ | ✅ UI: toast 'ยังไม่ได้แก้ไขหลักฐาน' ไม่มี request · API ชุดเดิม + note → 400 **`CLOSE_NO_EVIDENCE_REVISION`** · เช็คอินเพิ่ม → 400 `ASSIGNMENT_INVALID_STATUS` (status needs_revision) · ไม่มีแถวเปลี่ยน | R4.26 |
| superseded 3 แถว + ชุดใหม่ 3 แถว (รวม commission) | ✅ fuel/allowance/commission เดิม → `superseded` · ชุดใหม่ 20000/15000/50000 `pending_warehouse_confirm` · active ต่อชนิด = 1/1/1 | R4.27 |
| ลิงก์ superseded ชนิดเดียวกัน (BUG-051) | ✅ fuel→fuel, allowance→allowance, commission→commission · query ตรวจชนิดไม่ตรง = 0 แถว | R4.27, R4.38 |
| Q7 ราคา/plan/`expense_date` = การปิดครั้งแรก | ✅ (เท่าที่พิสูจน์ได้ในวันเดียว) ชุดใหม่ `comp_plan_id` 37ee8982… v1 · `expense_date` 2026-10-03 · ยอดเท่าเดิม — โค้ด `lib/field/queries.ts` ~1507/1590 ระบุ "วันที่รายการ = วันปิดงานครั้งแรก" ส่วน `case_assignments.completed_at` ใช้เวลาส่งใหม่ (19:47) ตามเจตนา | R4.27 |
| หลักฐานชุดใหม่มี `file_hashes` | ✅ แถวใหม่ `pending` hashed = 3 · `R4-C4-product-v2.jpg` sha `34a64d1e…` (ตรวจใหม่ฝั่ง server) · photo/video sha เท่าแถวเดิม | R4.27 |
| revenue ยังเป็น 0 | ✅ `revenues` = 0 | R4.27, R4.38 |
| ธุรการได้ 'รอรับเข้าคลัง' ซ้ำ? | **ยืนยัน — ซ้ำ** (C4 ได้ 2 แถว 19:37 + 19:47 ข้อความเหมือนกันทุกตัวอักษร) → 🐞 R4bv2-B01 (ข้อสังเกต R4v2-C) | R4.27, R4.36 |
| ค่าที่พัก in1 ฿600 ผ่าน 'เบิกแยก' → '+ เบิกที่พัก' | ✅ hotel 60000 `pending_approval` case_id NULL · plan NULL · approval_step_total 2 | R4.29 |
| ใบเสร็จผ่าน server-verify? / เพดาน ฿800? | **ยืนยันข้อสังเกต R4v2-B** (จากโค้ด + ข้อมูล) — `submitHotelClaim()` (`lib/field/expense-queries.ts`) ไม่เรียก verify ไม่เก็บ hash และ `hotelClaimSchema` ตรวจแค่ `amountSatang > 0` ไม่มีเพดาน hotelMax → 🐞 R4bv2-B02 · **ไม่ได้ยิง API ทดสอบ** (ถ้าผ่านจะได้แถว hotel เกิน golden) | R4.29 |
| เงินทดรองผ่าน**หน้าจอ** `/field/advances` (BUG-046) | ✅ เมนู 'เงินทดรองจ่าย' → หน้าว่าง → modal · ADV1 (ดับเบิลคลิก → POST 1 ครั้ง) · ADV2 ซ้อนตอน ADV1 pending **สร้างได้** · ADV3 due = วันนี้ · ADV-MAX → `ADVANCE_EXCEEDS_MAX` ค้างบนฟอร์ม · ADV4 ฿1,000 · **ทั้ง 4 ใบ `pending_approval`** | R4.30–34 |
| Q8 วันเคลียร์ย้อนหลัง | ✅ `min` = 2026-10-03 · fill เมื่อวานข้าม min → field error 'กำหนดเคลียร์ยอดต้องเป็นวันนี้หรือวันถัดไป — เลือกวันที่ผ่านมาแล้วไม่ได้' ไม่มี request · API → 400 `REQUIRED_MISSING` fields.dueClearDate ข้อความเดียวกัน · '2026-02-30' → 400 'ไม่ใช่วันที่ที่มีอยู่จริง' | R4.30, R4.33 |

---

# คู่มือ — ส่วนเจ้าหน้าที่อนุมัติเคส (ตีกลับหลักฐานปิดงาน)

## E. `uat.approver` (วิภา ตรวจเคส) — desktop

### R4.24 ดูหลักฐานปิดงาน + probe ก่อนตีกลับจริง
**เมนู**: จัดการเคส → รับเคส (`/cases/submit`) → 'กรองตามสถานะ' (สถานะทั้งหมด / ร่าง / … / ปิดงานสำเร็จ / ปิดงานไม่สำเร็จ / รออนุมัติรีไซเกิล)
![](../shots/R4v2/24-c3-evidence.png)
**ทำ**: กรอง 'ปิดงานไม่สำเร็จ' → 1 แถว UAT-CO2-003 → 'ดูรายละเอียด'
**ผลบนจอ**: กล่อง 'หลักฐานปิดงาน' ป้าย 'ปิดงานไม่สำเร็จ' · 'ส่งโดย บุญมี ภาคสนาม · ส่งเมื่อ 03/10/2569 19:36' · `evidence-fail-reason` = 'ไม่พบลูกหนี้ — ไปบ้านตามที่อยู่ปัจจุบัน บ้านปิด เพื่อนบ้านแจ้งย้ายออกแล้ว' · `evidence-note` = 'นัดลูกหนี้ทางโทรศัพท์ไม่ได้ 3 ครั้ง' · รูปถ่าย (1) R4-C3-photo.jpg · วิดีโอ (1) · เช็คอิน 1 จุด 13.66810, 100.63400 · ไม่มีปี ค.ศ.
**ทำ**: กรอง 'ปิดงานสำเร็จ' → **4 แถว** (C5, C4, C2, C1) · C2 'ดูรายละเอียด' → `evidence-note` = 'ลูกหนี้คืนเครื่องที่หน้าบ้าน กล่องและสายชาร์จครบ' · C4 'ดูรายละเอียด' → รูปถ่าย/วิดีโอ/รูปสินค้ายืนยัน 'R4-C4-product-v1.jpg' → คลิกชื่อไฟล์เปิด viewer
![](../shots/R4v2/24-c4-product-v1-viewer.png)
**ผล**: viewer โหลด signed URL `…/storage/v1/object/sign/case-documents/cases/d4d82f78…/field_evidence/product_photo/…` → 200 image/jpeg 14,378 ไบต์
**ทำ (probe)**: 'ตีกลับหลักฐานปิดงาน' → modal 'ตีกลับหลักฐานปิดงาน — UAT-CO1-004' → เหตุผลว่าง / 'สั้น' (4 ตัว) / ช่องว่างล้วน
![](../shots/R4v2/24-c4-reject-modal.png)
**ผล**: ปุ่ม 'ยืนยันตีกลับ' **disabled** ทุกกรณี · ไม่มี request · assignment C4 ยัง `closed_success` (ไม่มีข้อความบอกขั้นต่ำ 5 ตัวหลังเริ่มพิมพ์ — placeholder บอก '(5–1,000 ตัวอักษร)' แต่หายเมื่อพิมพ์ · จดเป็น UX ไม่เปิดบั๊ก)
**ผล API probe** (ไม่มีแถวเปลี่ยน · audit ตั้งแต่ T0B = 0):
- in2 `POST /api/cases/<C4>/reject-evidence {reason:'ขอแก้รูปเอง'}` → **403 `PERMISSION_DENIED`**
- `uat.mgr.in` → **403 `PERMISSION_DENIED`** · เปิด `/cases/submit` → เด้งไป `/dashboard` (ไม่มีสิทธิ์เข้าหน้า ⇒ ไม่เห็นปุ่มตีกลับ)
- approver กับ C7 (`accepted_unscheduled`) → **400 `ASSIGNMENT_INVALID_STATUS`** (status accepted_unscheduled, action reject_evidence)
**สถานะ**: ✅ ผ่าน

### R4.25 ตีกลับ C4 (ดับเบิลคลิก)
**ทำ**: เหตุผล **'รูปสินค้าไม่เห็น IMEI'** → ดับเบิลคลิก 'ยืนยันตีกลับ'
![](../shots/R4v2/25-c4-rejected.png)
**ผลบนจอ**: toast **'ตีกลับหลักฐานปิดงานแล้ว'** 'UAT-CO1-004 — แจ้งพนักงานให้แก้ไขหลักฐานในหน้าติดตามภาคสนามแล้ว' 1 ครั้ง · รายละเอียดรีโหลด: ป้าย **'ต้องแก้ไขหลักฐาน'** + แถบ 'หลักฐานชุดนี้ถูกตีกลับแล้ว / รูปสินค้าไม่เห็น IMEI / 03/10/2569 19:46 · วิภา ตรวจเคส' · ปุ่มตีกลับหายไป
**ผลหลังบ้าน**: POST 1 ครั้ง (200) · assignment C4 **`needs_revision`** · `case_evidences` แถวเดิม `rejected` reject_reason 'รูปสินค้าไม่เห็น IMEI' reviewed_by `uat.approver` · expenses C4 ยัง 3 แถว `pending_warehouse_confirm` · asset C4 `pending_intake` · audit 1 แถว `reject` `case_assignments` actor_role 'เจ้าหน้าที่อนุมัติเคส' reason ครบ events `["case.evidence_rejected"]` · noti in2 1 แถว link `/field/tracking`
**สถานะ**: ✅ ผ่าน

---

# คู่มือ — ส่วนพนักงานภาคสนาม (มือถือ)

## E (ต่อ). `uat.agent.in2` (บุญมี ภาคสนาม) — แก้หลักฐานแล้วส่งใหม่

### R4.26 เห็นการตีกลับ + probe ส่งใหม่โดยไม่แก้ไฟล์
**เมนู**: กระดิ่ง → 'หลักฐานปิดงานถูกตีกลับ'
![](../shots/R4v2/26-in2-bell.png)
![](../shots/R4v2/26-in2-tracking-revision.png)
**ผลบนจอ**: แผง '3 ยังไม่อ่าน' แถวบนสุด 'หลักฐานปิดงานถูกตีกลับ / เคส UAT-CO1-004 — รูปสินค้าไม่เห็น IMEI / ภาคสนาม · 03/10/2569 19:46' → คลิก → `/field/tracking` บล็อกส้ม **'ถูกตีกลับ ต้องแก้ไขหลักฐาน (1)'** การ์ด 'นางมณี ส่งช้า · กรุงเทพมหานคร · รอบที่ 1' ปุ่ม **'แก้ไขหลักฐาน'**
**ทำ**: 'แก้ไขหลักฐาน'
![](../shots/R4v2/26-in2-revision-dialog.png)
**ผลบนจอ**: dialog **'แก้ไขหลักฐานปิดงาน'** · แบนเนอร์ 'หลักฐานปิดงานถูกตีกลับ — ต้องแก้ไข' + **'เหตุผล: รูปสินค้าไม่เห็น IMEI'** · ผลการติดตาม 'ล็อกไว้ตามรอบเดิม — แก้ไม่ได้' · เช็คอิน 'จุดที่ 1 … 03/10/2569 19:37 · พิกัดล็อกไว้ แก้ไขไม่ได้' · **ไม่มี 'บันทึก Draft' และไม่มีปุ่มเช็คอิน** · ปุ่มท้าย 'ส่งกลับยืนยันอีกครั้ง'
**ทำ (probe UI)**: 'ส่งกลับยืนยันอีกครั้ง' ทันที
![](../shots/R4v2/26-in2-no-revision-toast.png)
**ผล**: toast **'ยังไม่ได้แก้ไขหลักฐาน'** 'ต้องเพิ่ม/ลบ/แทนที่รูป วิดีโอ เสียง หรือรูปสินค้าอย่างน้อย 1 รายการก่อนส่งกลับ' · ไม่มี request
**ผล API probe**: resubmit ชุดเดิม + `note:'แก้แค่ข้อความ'` → **400 `CLOSE_NO_EVIDENCE_REVISION`** · `checkin` → **400 `ASSIGNMENT_INVALID_STATUS`** (needs_revision / add_checkin) · หลังบ้าน: expenses 3 · evidences 1 · check_ins 1 · ไม่มี audit ใหม่
**สถานะ**: ✅ ผ่าน

### R4.27 แทนรูปสินค้า v1 → v2 แล้วส่งกลับ
**ทำ**: 'รูปสินค้ายืนยัน' → ปุ่มกากบาท 'ลบรูปสินค้ายืนยันลำดับที่ 1' (ลบทันที ไม่มี confirm ไม่มี request) → 'เลือกไฟล์' ← `R4-C4-product-v2.jpg` (อัปโหลด Storage 200) → 'ส่งกลับยืนยันอีกครั้ง'
![](../shots/R4v2/27-in2-product-v2.png)
![](../shots/R4v2/27-in2-closed.png)
**ผลบนจอ**: toast **'ส่งหลักฐานกลับให้ตรวจอีกครั้งแล้ว'** 'รายการเบิกของรอบเดิมจะถูกแทนที่ด้วยรายการใหม่' · 'กำลังติดตาม' ว่าง (บล็อกส้มหาย) · 'จบงาน' → 'นางมณี ส่งช้า · ปิดงานสำเร็จ · ปิดงานเมื่อ 03/10/2569 19:47' ค่าใช้จ่าย 'รอยืนยันคืนคลัง'
**ผลหลังบ้าน**:
- assignment C4 `closed_success` · `case_evidences` C4 **2 แถว**: `rejected` (v1) + `pending` (product_photos = …/7d772c98…-R4-C4-product-v2.jpg, photos/videos เดิม, **hashed 3**)
- **expenses C4 = 6 แถว**: `cd96ffe9…` fuel → `superseded` → `edbad7fa…` (fuel) · `db6f0455…` allowance → `f0e67e23…` (allowance) · `9675c9c1…` commission → `fafc5c66…` (commission) · ชุดใหม่ 20000 + 15000 + 50000 `pending_warehouse_confirm` · plan 37ee8982… v1 · expense_date 2026-10-03 (= ชุดเดิม) · approval_step_total 2
- active ต่อชนิด fuel 1 / allowance 1 / commission 1 · check_ins C4 1 · asset C4 1 · **revenues 0** · drafts 0
- audit (in2): `status_change` expenses ×3 reason 'ส่งหลักฐานปิดงานใหม่หลังถูกตีกลับ — แทนที่รายการเบิกรอบเดิม' · `create` expenses ×3 events `expense.case_bound_created` · `status_change` case_assignments events `case.close_resubmitted` after_data มี `expenseIds` + `supersededExpenseIds` ครบ
- noti: `uat.admin` ได้ 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง' ของ C4 **แถวที่ 2** (ข้อความเหมือนครั้งแรก) → 🐞 R4bv2-B01
**สถานะ**: ✅ ผ่าน + 🐞 R4bv2-B01

### R4.28 หน้า 'เบิกค่าใช้จ่าย' / 'สรุปรายได้' หลังส่งใหม่
![](../shots/R4v2/28-in2-expenses.png)
![](../shots/R4v2/28-in2-income.png)
**ผลบนจอ**: 'รอดำเนินการ' **฿1,400.00** (C3 ฿550 + C4 ฿850) · การ์ด C4 'UAT-CO1-004 · 3 รายการ · **3 รายการถูกแทนที่**' ฿850.00 'รอยืนยันคืนคลัง' · ตัวกรองสถานะมีแค่ 'ทุกสถานะ/รอยืนยันคืนคลัง/รออนุมัติจ่าย/อนุมัติแล้ว' (ไม่มี 'ถูกแทนที่แล้ว' — step เขียน "ถ้ามี") · สรุปรายได้ 'รายได้รวม (คอมมิชชั่น)' **฿500.00** 'จากเคสสำเร็จ 1 เคส' · เคสไม่สำเร็จ ฿200.00 (เบี้ยเสี่ยง) · แดชบอร์ด '1 สำเร็จ' **50.00%** '฿500.00 คอมมิชชั่นเดือนนี้'
**สถานะ**: ✅ ผ่าน

## F. `uat.agent.in1` (อนันต์ ตามทรัพย์) — เบิกค่าที่พัก

### R4.29 เบิกค่าที่พัก ฿600
**เมนู**: เบิกค่าใช้จ่าย → แท็บ 'เบิกแยก' (ว่าง 'ไม่พบรายการตามเงื่อนไขที่กรอง') → '+ เบิกที่พัก' → modal 'เบิกค่าที่พัก' (พักร่วมกับ: — พักคนเดียว — / ชัยวัฒน์ จัดการทีม / บุญมี ภาคสนาม / สุริยา หัวหน้าเอ)
![](../shots/R4v2/29-hotel-probe-empty.png)
![](../shots/R4v2/29-hotel-probe-no-receipt.png)
**probe** (ไม่มี request ทุกกรณี · hotel 0 แถว): ว่าง → 'กรุณากรอกวันที่และจำนวนเงิน' · วันที่ + `0` → 'กรุณากรอกวันที่และจำนวนเงิน' · `-100` → ข้อความเดียวกัน (🐞 R4bv2-B03) · `600.505` → 'จำนวนเงินกรอกทศนิยมได้ไม่เกิน 2 ตำแหน่ง' · 600 ไม่แนบใบเสร็จ → **'ต้องแนบใบเสร็จก่อนส่งคำขอเบิก'** · API `amountSatang:0` → 400 `REQUIRED_MISSING` 'จำนวนเงินต้องมากกว่า 0'
**ทำจริง**: 'วันที่เข้าพัก' 2026-10-03 · 'จำนวนเงิน (บาท)' 600 · '— พักคนเดียว —' · 'แตะเพื่อแนบใบเสร็จ' ← `R4-C1-photo.jpg` · หมายเหตุ 'UAT ค้างคืนหลังปิด C1' → 'ส่งคำขอเบิก'
![](../shots/R4v2/29-hotel-filled.png)
![](../shots/R4v2/29-hotel-listed.png)
**ผลบนจอ**: toast **'ส่งคำขอเบิกค่าที่พักแล้ว — รอผู้อนุมัติตรวจสอบ'** · modal ปิด · แท็บ 'เบิกแยก': 'รอดำเนินการ' ฿600.00 · '🏨 UAT ค้างคืนหลังปิด C1 · วันที่ 03/10/2569 · ฿600.00 · รออนุมัติจ่าย' (ไม่แสดงเคสที่จับคู่) · แท็บ 'ผูกกับเคส' ยัง ฿1,700.00 (กล่อง 'รอดำเนินการ' แยกต่อแท็บ ไม่รวม ฿2,300)
**ผลหลังบ้าน**: Storage 200 `expenses/88cb577d…/receipts/91324d20…-R4-C1-photo.jpg` · `expenses` hotel **60000** `pending_approval` expense_date 2026-10-03 · calculation_source `receipt` · case_id NULL · comp_plan_id/version NULL · step 1/2 · หมายเหตุเก็บใน `revision_note` · audit `create` expenses events `expense.hotel_claim_submitted` · ไม่มีแจ้งเตือน
**สถานะ**: ✅ ผ่าน + 🐞 R4bv2-B02 (ไม่ตรวจไฟล์/เพดาน) + 🐞 R4bv2-B03 (ข้อความยอด 0/ติดลบ)

## G. เงินทดรอง — `/field/advances`

### R4.30 in1 เปิดหน้าเงินทดรอง + probe
**เมนู**: hamburger 'เปิดเมนู' → 'เงินทดรองจ่าย' → `/field/advances`
![](../shots/R4v2/30-advances-empty.png)
![](../shots/R4v2/30-advance-modal.png)
**ผลบนจอ**: 'ขอเบิกเงินล่วงหน้าไปสำรองจ่าย แล้วเคลียร์ยอดด้วยใบเสร็จจริงภายหลัง' · ว่าง 'ยังไม่มีคำขอเงินทดรอง' · modal 'ขอเบิกเงินทดรองจ่าย (Advance Request)' + แถบกฎ '⚠️ ต้องเคลียร์ยอดเดิมให้เสร็จก่อนขอเบิกรอบใหม่…' · ช่องวันที่ `min=2026-10-03`
**probe** (วัตถุประสงค์ 'abc' ทุกครั้ง · ไม่มี request):
![](../shots/R4v2/30-advance-probe.png)
`0` → 'ยอดที่ขอเบิกต้องมากกว่า 0' · `-100` → 'ยอดที่ขอเบิก ต้องไม่ติดลบ' · `100.505` → 'ยอดที่ขอเบิก ต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง' · ทุกครั้ง + 'ระบุวัตถุประสงค์อย่างน้อย 5 ตัวอักษร'
**API**: dueClearDate เมื่อวาน → 400 `REQUIRED_MISSING` fields.dueClearDate 'กำหนดเคลียร์ยอดต้องเป็นวันนี้หรือวันถัดไป — เลือกวันที่ผ่านมาแล้วไม่ได้' · '2026-02-30' → 400 'กำหนดเคลียร์ยอด ไม่ใช่วันที่ที่มีอยู่จริง' · advances 0 แถว
**สถานะ**: ✅ ผ่าน

### R4.31 ADV1 ฿3,000 (ดับเบิลคลิก)
**ทำ**: 3000 · 'UAT ADV1 สำรองค่าเดินทางติดตามทรัพย์ ต.ค.' · 2026-10-10 → ดับเบิลคลิก 'ส่งคำขออนุมัติ'
![](../shots/R4v2/31-adv1-listed.png)
**ผล**: POST **1 ครั้ง** (201) · toast 'ส่งคำขอแล้ว' 'รอการเงินอนุมัติก่อนรับเงิน' · รายการ '฿3,000.00 · รออนุมัติ · ขอเมื่อ 03/10/2569 19:50 · กำหนดเคลียร์ยอด 10/10/2569' · `advances` 1 แถว in1 300000 approved NULL `pending_approval` due 2026-10-10 · audit `create` advances 1 · **ADV1 = `cf7d36ff-2620-4809-985d-dcfb97c9d0e1`**
**สถานะ**: ✅ ผ่าน

### R4.32 ADV2 ฿1,000 ขณะ ADV1 ยัง pending
![](../shots/R4v2/32-adv2-listed.png)
**ผล**: สร้างได้ (201) `pending_approval` due 2026-10-10 — pending ไม่บล็อกตามคาด · **ADV2 = `20b58ece-4b09-452d-8a5f-9de6fe539c1e`**
**สถานะ**: ✅ ผ่าน

### R4.33 in2 ADV3 ฿2,000 — probe เมื่อวาน → วันนี้
![](../shots/R4v2/33-adv3-past-date.png)
**probe**: fill 2026-10-02 (ข้าม min) → field error ใต้ช่อง **'กำหนดเคลียร์ยอดต้องเป็นวันนี้หรือวันถัดไป — เลือกวันที่ผ่านมาแล้วไม่ได้'** · ไม่มี request · ไม่มีแถว
**ทำจริง**: แก้เป็น 2026-10-03 → 201 · รายการ '฿2,000.00 · รออนุมัติ · กำหนดเคลียร์ยอด 03/10/2569'
![](../shots/R4v2/33-adv3-listed.png)
**หลังบ้าน**: in2 200000 `pending_approval` due **2026-10-03** · **ADV3 = `5e56d2dc-7808-4376-8a3e-5224ea09c772`** · ⚠️ `advance_overdue` เปลี่ยนสถานะได้หลังเที่ยงคืนเวลาไทยของ 03/10/2569 เท่านั้น
**สถานะ**: ✅ ผ่าน

### R4.34 out1 ADV-MAX ฿6,000 → ADV4 ฿1,000
![](../shots/R4v2/34-adv-max.png)
**ผล ADV-MAX**: 400 `ADVANCE_EXCEEDS_MAX` → กล่องแดงค้างบนฟอร์ม **'ยอดขอเบิกเกินเพดานต่อครั้ง / ขอได้สูงสุดครั้งละ ฿5,000.00 — ลดยอดแล้วส่งคำขอใหม่'** + toast เดียวกัน · ไม่มีแถว · API ตรง → `{code:ADVANCE_EXCEEDS_MAX, requestedSatang:600000, maxSatang:500000}`
**ทำ**: แก้เป็น 1000 · 'UAT ADV4 ทดสอบใช้เกินยอดอนุมัติ (Q3)' · 2026-10-10 → 201 · กล่องแดงหาย modal ปิด
![](../shots/R4v2/34-adv4-listed.png)
**หลังบ้าน**: out1 100000 `pending_approval` due 2026-10-10 · **ADV4 = `d6b06c7e-56ef-4c80-8e8f-aca3cab3bd83`**
**สถานะ**: ✅ ผ่าน

### R4.35 การเงินเห็นคำขอ (อ่านอย่างเดียว)
**SQL**: `approve_advance` → **การเงิน manage** (แถวเดียว)
**เมนู**: `uat.finance` → การเงิน → แท็บ 'เงินทดรองจ่าย' (`/finance?tab=advances`)
![](../shots/R4v2/35-finance-advances.png)
**ผลบนจอ**: KPI 'ยอดเงินทดรองที่ยังอยู่กับผู้เบิก ฿0.00' · 'เลยกำหนดเคลียร์ 0' · ตาราง **4 แถว** D6B06C7E (ADV4 ประเสริฐ รับเหมา ทีม C) / 5E56D2DC (ADV3 บุญมี due 03/10/2569) / 20B58ECE (ADV2) / CF7D36FF (ADV1) ทุกแถว 'รออนุมัติ' + ปุ่ม 'อนุมัติ' 'ปฏิเสธ' — **ไม่ได้กด** (non-GET = 0)
**สถานะ**: ✅ ผ่าน

## H. ตรวจปลายรอบ

### R4.36 แจ้งเตือนทั้งรอบ (ตั้งแต่ T0 R4a 12:28 UTC)
| event | ผู้รับ | จริง | คาด |
|---|---|---|---|
| `assignment.accepted` → `/cases/assign` | mgr.in 5 · sup.in 5 · mgr.out 1 | **11** | 11 ✅ |
| `case.closed_success` → `/warehouse` | uat.admin (C1, C2, C4, C5, **C4 ซ้ำ**) | **5** | 5 ✅ (แต่ดู B01) |
| `case.closed_fail` → `/cases/assign` | mgr.in 1 · sup.in 1 | **2** | 2 ✅ |
| `expense.case_bound_created` → `/finance/approvals` | mgr.in | **1** | 1 ✅ (ชุดใหม่ C4 เป็น pending_warehouse_confirm จึงไม่แจ้ง) |
| `case.evidence_rejected` → `/field/tracking` | in2 | **1** | 1 ✅ |
| ค่าที่พัก / เงินทดรอง | — | 0 | 0 ✅ |
- ต้องเป็น 0: ถึง `uat.mgr.out` นอก C5 = 0 · ถึงผู้ใช้บริษัท = 0 · `assignment.created` ใหม่ = 0 ✅
- `GET /api/field/notifications` ตรง DB ทั้ง 3 คน: in1 1 แถว (unread 1) · in2 3 แถว (unread 2 — แถวตีกลับอ่านแล้ว) · out1 0 ✅ · หมายเหตุ: แถว `assignment.reassignment_timeout_resolved` ของ in1/in2 ลิงก์ `/cases/assign` เป็นข้อมูล R3 (สร้าง 16:43 ก่อน fix BUG-059 `250bd88` 18:35) — ไม่ใช่บั๊กใหม่
![](../shots/R4v2/36-admin-bell-c4-twice.png)
**สถานะ**: ✅ ผ่าน (กระดิ่งธุรการเห็น C4 สองแถว 19:37 + 19:47 → B01)

### R4.37 audit ทั้งรอบ (ไม่นับ login)
`case_assignments` status_change **17** (in1 7 · in2 7 · out1 3 = รับ 6 + จัดวัน 5 + ปิด 5 + ส่งใหม่ 1) · `reject` 1 (approver) · `check_ins` create 5 · `expenses` create 18 (14 ปิดงาน + 3 ชุดใหม่ C4 + hotel 1) + status_change 3 (superseded) · `advances` create 4 (in1 2 · in2 1 · out1 1) · `close_case_drafts` update 28 (autosave R4a) · **probe ที่ถูกปัดใน R4b ไม่มี audit** (นับ audit ก่อนตีกลับจริง = 0) · actor/role ถูกคนทุกแถว
**สถานะ**: ✅ ผ่าน

### R4.38 invariant ปลายรอบ
| ค่า | จริง | คาด |
|---|---|---|
| revenues | 0 | 0 ✅ |
| expenses ทั้งหมด / superseded | 18 / 3 | 18 / 3 ✅ |
| **expense active sum** | **1020000** | 1020000 ✅ |
| ผูกเคส (ไม่รวม hotel) | 960000 | 960000 ✅ |
| commission + no_success_fee active | 5 | 5 ✅ |
| assets (pending_intake) | 4 (4) | 4 ✅ |
| check_ins | 5 | 5 ✅ |
| case_evidences / ไม่มี hash | 6 / 0 | 6 / 0 ✅ |
| close_case_drafts | 0 | 0 ✅ |
| advances | 4 | 4 ✅ |
| active ซ้ำต่อ (assignment, type) | 0 แถว | 0 ✅ |
| ลิงก์ superseded ชนิดไม่ตรง | 0 แถว | 0 ✅ |
- pm2: ไม่มี error ใหม่ (error log mtime 19:29) · serverErrors ทุกสคริปต์ว่าง
**สถานะ**: ✅ ผ่าน

---

## สถานะปลาย R4 (ส่งต่อ R5/R6)

| เคส | expenses active | superseded | evidence | asset |
|---|---|---|---|---|
| C1 UAT-CO1-001 | fuel 20000 + allowance 15000 + commission 50000 = 85000 `pending_warehouse_confirm` | — | 1 pending (hash 3) | pending_intake |
| C2 UAT-CO1-002 | 85000 `pending_warehouse_confirm` | — | 1 pending + note | pending_intake |
| C3 UAT-CO2-003 | 20000 + 15000 + no_success_fee 20000 = 55000 `pending_approval` | — | 1 pending (hash 2) | — |
| C4 UAT-CO1-004 | ใหม่ 85000 `pending_warehouse_confirm` (edbad7fa / f0e67e23 / fafc5c66) | 3 แถว 85000 (cd96ffe9 / db6f0455 / 9675c9c1) | 2: rejected (v1) + pending (v2) hash 3/3 | pending_intake |
| C5 UAT-CO2-005 | fuel 550000 + commission 100000 = 650000 `pending_warehouse_confirm` | — | 1 pending (hash 3) | pending_intake |
| hotel in1 | 60000 `pending_approval` (expense_date 2026-10-03, `46330ab9-8e17-4840-ac49-d7277402ecb5`) | — | — | — |
| **รวม** | **15 แถว = 1020000** (ผูกเคส 960000) | 3 แถว | 6 | 4 |

| เงินทดรอง | payee | requested | status | due | id |
|---|---|---|---|---|---|
| ADV1 | in1 | 300000 | pending_approval | 2026-10-10 | cf7d36ff-2620-4809-985d-dcfb97c9d0e1 |
| ADV2 | in1 | 100000 | pending_approval | 2026-10-10 | 20b58ece-4b09-452d-8a5f-9de6fe539c1e |
| ADV3 | in2 | 200000 | pending_approval | **2026-10-03** | 5e56d2dc-7808-4376-8a3e-5224ea09c772 |
| ADV4 | out1 | 100000 | pending_approval | 2026-10-10 | d6b06c7e-56ef-4c80-8e8f-aca3cab3bd83 |
| ADV-MAX | out1 | 600000 | ไม่มีแถว (`ADVANCE_EXCEEDS_MAX`) | — | — |

ไฟล์ที่อัปโหลดขึ้น Storage ใน R4b (ห้ามลบ): `case-documents/cases/d4d82f78-7500-4e10-94ae-c703483b7272/field_evidence/product_photo/7d772c98-390a-4e5b-bb22-8628d08a949c-R4-C4-product-v2.jpg` · `case-documents/expenses/88cb577d-32b4-49ff-96fb-06a2e093d339/receipts/91324d20-6d25-4434-a67a-9fb8732ea937-R4-C1-photo.jpg` (รวมทั้ง R4 = 15 + 2 = **17 object**)

## 🐞 บั๊กที่พบ

| รหัส | step | ระดับ | ชนิด | อาการ | คาดหวัง |
|---|---|---|---|---|---|
| **R4bv2-B01** | R4.27/R4.36 | S5 | code / spec-gap | ส่งหลักฐานใหม่ (resubmit_close) แจ้งธุรการ 'ปิดงานสำเร็จ — รอรับทรัพย์เข้าคลัง' **ซ้ำ** ข้อความเหมือนครั้งแรกทุกตัวอักษร (C4 มี 2 แถว 19:37 + 19:47) — ธุรการแยกไม่ได้ว่าเป็นทรัพย์ชิ้นเดิม (ยืนยันข้อสังเกต R4v2-C) | dedupe หรือข้อความเฉพาะ 'ส่งหลักฐานใหม่ — ทรัพย์ชิ้นเดิมรอรับเข้าคลัง' (ให้ PO เลือก) |
| **R4bv2-B02** | R4.29 | S4 | code | ใบเสร็จค่าที่พัก (`POST /api/field/expenses/hotel` → `submitHotelClaim()` ใน `lib/field/expense-queries.ts`) ไม่ผ่าน server-verify ของ Q13 (ไม่ตรวจ path/มีจริง/magic bytes/ไม่เก็บ SHA-256) และ `hotelClaimSchema` ไม่ตรวจเพดาน hotelMax ฿800 ของแผน (ยืนยันข้อสังเกต R4v2-B / DATASET S8 จากโค้ด + แถว hotel ไม่มี hash) — ไม่ยิง probe เพราะถ้าผ่านจะได้แถวเกิน golden | ใบเสร็จผ่าน `verifyUploadedFile` เหมือนหลักฐานปิดงาน · ยอดเกิน hotelMax ถูกปัดหรือเตือน |
| **R4bv2-B03** | R4.29 | S5 | code | modal 'เบิกค่าที่พัก': กรอกวันที่แล้ว ใส่ยอด `0` หรือ `-100` → ข้อความ 'กรุณากรอกวันที่และจำนวนเงิน' (ชวนเข้าใจว่าวันที่ว่าง) — ต่างจาก modal เงินทดรองที่บอก 'ต้องมากกว่า 0' / 'ต้องไม่ติดลบ' | ข้อความเฉพาะช่อง เช่น 'จำนวนเงินต้องมากกว่า 0' |

ข้อสังเกตเล็ก (ไม่เปิดบั๊ก): modal ตีกลับไม่บอกขั้นต่ำ 5 ตัวหลังเริ่มพิมพ์ (ปุ่มแค่ disabled) · หน้าเบิกของพนักงานไม่มีตัวกรอง 'ถูกแทนที่แล้ว' (การ์ดบอก '3 รายการถูกแทนที่' แทน) · หมายเหตุค่าที่พักเก็บใน `expenses.revision_note` · audit แถว superseded ไม่ใส่ `supersededByExpenseId` ใน after_data (ลิงก์ใน DB ถูกต้อง และ audit ของ assignment มี `supersededExpenseIds` ครบ)

## ❓ ต้องตัดสินใจ

- **❓-R4bv2-1** แจ้งเตือนธุรการตอนส่งหลักฐานใหม่ (B01): dedupe ทิ้ง / เปลี่ยนข้อความเป็น 'ส่งหลักฐานใหม่' / คงไว้ตามเดิม
- **❓-R4bv2-2** หลังส่งใหม่ `case_assignments.completed_at` = เวลาส่งใหม่ (หน้า 'จบงาน'/'สรุปรายได้' แสดง 'ปิดงานเมื่อ 03/10/2569 19:47') ส่วน expense ใช้วันที่ปิดครั้งแรก (Q7 — ตามคอมเมนต์โค้ด) — ยืนยันว่าเวลาบน list ควรเป็นเวลาส่งใหม่ (ปัจจุบัน) หรือเวลาปิดครั้งแรก
- (ส่งต่อจาก step sheet) ❓-R4v2-2: ADV3 due = 03/10/2569 ⇒ R6 สั่ง `advance_overdue` ได้ผลหลังเที่ยงคืนไทย 04/10/2569 เท่านั้น
