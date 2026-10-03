# R4b v3 — ตีกลับหลักฐาน + ส่งใหม่ · ค่าที่พัก · เงินทดรอง (`uat.approver` / `uat.agent.in1` / `uat.agent.in2` / `uat.agent.out1` / `uat.finance` / `uat.mgr.in`)

> วันที่ทดสอบ: **04/10/2569** 00:55–00:59 น. เวลาไทย · ต้นรอบ: snapshot `R4a-end-v3` (ไม่ได้ restore) · ปลายรอบ: orchestrator snapshot `R4-end-v3` ได้
> ผู้เล่น: role agent ผ่าน Playwright (Chrome headless · จำลอง iPhone 14 สำหรับพนักงาน · desktop สำหรับ approver/finance) · สคริปต์ `uat/bin/r4v3/s12…s17` + 🆕 `s14a-hotel-receipt-probe.mjs` (probe ใบเสร็จปลอม/path นอกขอบเขต) · log `uat/bin/r4v3/run.log` (หลังบรรทัด `##### R4b v3 run start`) · ภาพ `uat/shots/R4v3/` (**+29 ภาพ** รวม 88)
> T0B (UTC) = `2026-10-03 17:55:00+00` · step sheet `uat/steps/R4.md` v3 · golden `uat/DATASET.md` v3
> **ผล: ✅ 15 / 🐞 1 ใหม่ (S5) / ⚠️ 0 / ❓ 3** (R4.24–R4.38) · ไม่มี 500 · pm2 log ไม่มี error ใหม่ตั้งแต่ R4a · console error มีแค่ 400 ที่ตั้งใจ (ใบเสร็จปลอม · ADV-MAX)
> อัปโหลดขึ้น Supabase Storage จริง **3 ไฟล์** (รูปสินค้า v2 · ใบเสร็จจริง · ใบเสร็จปลอม 1 ไฟล์ที่ server ปัด — ห้ามลบ)

## สรุปผลต่อ step

| Step | เรื่อง | ผล |
|---|---|---|
| R4.24 | approver ดูหลักฐาน C3/C2/C4 + probe เหตุผลว่าง/สั้น + probe API | ✅ |
| R4.25 | approver ตีกลับ C4 (ดับเบิลคลิก) | ✅ |
| R4.26 | in2 เห็นการตีกลับ + probe ส่งใหม่ไม่แก้ไฟล์ / เช็คอินเพิ่ม | ✅ |
| R4.27 | in2 แทนรูปสินค้า v1 → v2 แล้วส่งกลับ | ✅ + 🐞 R4bv3-B01 (S5) · ❓-R4bv3-1 |
| R4.28 | in2 หน้าเบิก/รายได้หลังส่งใหม่ | ✅ |
| R4.29 | in1 เบิกที่พัก ฿600 (+ probe ใบเสร็จปลอม/path) | ✅ · ❓-R4bv3-2, 3 |
| R4.30 | in1 หน้าเงินทดรอง + probe validation | ✅ |
| R4.31 | in1 ADV1 (ดับเบิลคลิก) | ✅ |
| R4.32 | in1 ADV2 ซ้อนขณะ ADV1 pending | ✅ (สร้างได้) |
| R4.33 | in2 ADV3 วันเคลียร์ = วันนี้ (+ probe เมื่อวาน) | ✅ |
| R4.34 | out1 ADV-MAX ถูกปัด → ADV4 | ✅ |
| R4.35 | การเงินเห็น ADV1–ADV4 + ปุ่ม (ไม่กด) | ✅ |
| R4.36 | แจ้งเตือนทั้งรอบ | ✅ (ต่างจาก step sheet 1 จุด — BUG-071 แก้แล้ว) |
| R4.37 | audit ทั้งรอบ | ✅ |
| R4.38 | invariant ปลายรอบ | ✅ ตรงทุกค่า |

## ผลยืนยันตามที่สั่งให้ตรวจ

| เรื่อง | ผล |
|---|---|
| ตีกลับ C4 ผ่านหน้าจอ + เหตุผล | ✅ ปุ่ม 'ยืนยันตีกลับ' กดไม่ได้เมื่อเหตุผลว่าง/'สั้น'/ช่องว่าง · เหตุผล 'รูปสินค้าไม่เห็น IMEI' ดับเบิลคลิก → POST **1 ครั้ง** · assignment `needs_revision` · evidence `rejected` + reject_reason + reviewed_by approver · audit `reject` 1 แถว event `case.evidence_rejected` 1 |
| resubmit แทนที่เฉพาะ commission | ✅ commission เดิม `ad7e5be8-…` → `superseded` → `superseded_by_expense_id` = `2b46fa31-…` (commission ใหม่ 50000 `pending_warehouse_confirm`) · **แถวรายวัน fuel `b6ea275a-…` / allowance `c7b25cb3-…` id เดิม สถานะเดิม ไม่มีลิงก์ superseded** · active C4 = fuel 1/10000, allowance 1/7500, commission 1/50000 (ไม่ซ้ำไม่หาย) · Q7: expense_date 2026-10-04 + comp_plan_version 1 = ใบเดิม |
| ยอดบนจอ | ✅ in2 'รอดำเนินการ' ฿1,050.00 (ไม่เปลี่ยน) · in1 แท็บ 'ผูกกับเคส' ฿1,350.00 + แท็บ 'เบิกแยก' ฿600.00 (กล่องแยกต่อแท็บ — ไม่มีจุดไหนแสดงรวม ฿1,950.00 → ❓-R4bv3-2) |
| ใบเสร็จค่าที่พักตรวจฝั่ง server (BUG-072) | ✅ **แก้แล้ว** · ใบจริง `receipt_file_hash` = c49a023f… ตรง `SHA256SUMS-R4.tsv` · ไฟล์ปลอม `.jpg` (เนื้อเป็นข้อความ) ผ่านหน้าจอ → 400 `UPLOAD_FILE_TYPE_INVALID` toast 'ชนิดไฟล์ไม่รองรับ' ไม่มีแถว · path ของ in2 / path หลักฐาน C1 / `../` → `UPLOAD_PATH_OUT_OF_SCOPE` · ไฟล์ไม่มีจริง → `UPLOAD_FILE_NOT_FOUND` |
| เงินทดรองทุกใบ pending | ✅ ADV1 300000 / ADV2 100000 (in1, due 11/10) · ADV3 200000 (in2, due **04/10**) · ADV4 100000 (out1, due 11/10) · ADV-MAX 600000 → `ADVANCE_EXCEEDS_MAX` ไม่มีแถว |
| ห้ามเบิกซ้อน | ✅ ส่วนที่ทดสอบได้ใน R4: ดับเบิลคลิกได้แถวเดียว · pending ไม่บล็อก (ตาม DATASET) · DB มี `uniq_active_advance_per_payee` (partial: approved/overdue) · การบล็อกจริง (`ADVANCE_PENDING_SETTLEMENT`) ทดสอบใน R6 หลังอนุมัติ ADV1 |
| แจ้งเตือนถึงคนถูกต้อง | ✅ ตีกลับ → in2 1 แถว link `/field/tracking` (คลิกแล้วไม่ 404) · ส่งใหม่ → uat.admin **`case.close_resubmitted` 'ส่งหลักฐานใหม่แล้ว — UAT-CO1-004'** link `/warehouse` (BUG-071 แก้แล้ว — step sheet ยังคาด `case.closed_success` ซ้ำ) · ค่าที่พัก/เงินทดรอง 0 แถว |
| R4v3-A | ยืนยันส่วนที่ทดสอบได้: resubmit เช็คอินเพิ่มไม่ได้ (`POST …/checkin` → 400 `ASSIGNMENT_INVALID_STATUS` action `add_checkin`) · check_ins ยัง 5 · fds ยัง 3 |
| R4v3-B | ยังเป็นอยู่ — ทั้งรอบ `expense.case_bound_created` มีแค่ 1 แถว (ตอนปิด C3) · job ไม่แจ้ง |
| R4v3-C | ยังเป็นอยู่ — in2 'สรุปรายได้' ฿500.00 + ฿200.00 (เบี้ยเสี่ยง) · ไม่นับค่าน้ำมัน/เบี้ยเลี้ยง |
| known อื่น | BUG-073 (ข้อความยอด 0/ติดลบของฟอร์มค่าที่พัก) **แก้แล้ว** — 'จำนวนเงินต้องมากกว่า 0' · BUG-059 ยังเห็นในกระดิ่ง in1/in2 (แจ้งเตือน timeout จาก R3 ลิงก์ `/cases/assign`) |

---

# คู่มือ (ทำตามได้จริง)

## E. เจ้าหน้าที่อนุมัติเคส ตีกลับหลักฐานปิดงาน

### R4.24 ดูหลักฐานปิดงานก่อนตีกลับ
**เมนู**: เคส → ส่งเคส (`/cases/submit`) → 'กรองตามสถานะ' = 'ปิดงานไม่สำเร็จ' → แถว UAT-CO2-003 'ดูรายละเอียด'
![](../shots/R4v3/24-c3-evidence.png)
**ผลบนจอ**: กล่อง 'หลักฐานปิดงาน' — 'ส่งเมื่อ 04/10/2569 00:45' · 'เหตุผลที่ไม่สำเร็จ: ไม่พบลูกหนี้ — ไปบ้านตามที่อยู่ปัจจุบัน บ้านปิด…' · 'บันทึกเพิ่มเติม: นัดลูกหนี้ทางโทรศัพท์ไม่ได้ 3 ครั้ง' · รูป 1 / วิดีโอ 1 / เช็คอิน 1 จุด (13.66810, 100.63400) · ไม่มีปี ค.ศ.
**ทำต่อ**: กรอง 'ปิดงานสำเร็จ' → 4 แถว (C1, C2, C4, C5) · C2 บันทึกเพิ่มเติม = 'ลูกหนี้คืนเครื่องที่หน้าบ้าน กล่องและสายชาร์จครบ' · C4 'ดูรายละเอียด' → คลิกไฟล์ 'R4-C4-product-v1.jpg' เปิดภาพผ่าน signed URL (200 image/jpeg 14,378 ไบต์)
![](../shots/R4v3/24-c4-product-v1-viewer.png)
**probe**: กด 'ตีกลับหลักฐานปิดงาน' → modal 'ตีกลับหลักฐานปิดงาน — UAT-CO1-004' · ปุ่ม 'ยืนยันตีกลับ' **กดไม่ได้** เมื่อเหตุผลว่าง / 'สั้น' (4 ตัว) / ช่องว่าง · ไม่มี request
![](../shots/R4v3/24-c4-reject-modal.png)
**probe API (ไม่มีแถวเปลี่ยน)**: in2 → 403 `PERMISSION_DENIED` · `uat.mgr.in` → 403 · approver กับ C7 → 400 `ASSIGNMENT_INVALID_STATUS` (status `accepted_unscheduled`) · `uat.mgr.in` เปิด `/cases/submit` ถูกพากลับ `/dashboard` (ไม่มีสิทธิ์หน้านี้ จึงไม่เห็นปุ่มตีกลับ) · audit ใหม่ 0
**สถานะ**: ✅ ผ่าน

### R4.25 ตีกลับ C4
**ทำ**: เหตุผล 'รูปสินค้าไม่เห็น IMEI' → ดับเบิลคลิก 'ยืนยันตีกลับ'
![](../shots/R4v3/25-c4-rejected.png)
**ผลบนจอ**: toast 'ตีกลับหลักฐานปิดงานแล้ว' + 'UAT-CO1-004 — แจ้งพนักงานให้แก้ไขหลักฐานในหน้าติดตามภาคสนามแล้ว' (1 ครั้ง) · รายละเอียดรีโหลดเป็น 'ต้องแก้ไขหลักฐาน' + กล่อง 'หลักฐานชุดนี้ถูกตีกลับแล้ว · รูปสินค้าไม่เห็น IMEI · 04/10/2569 00:55 · วิภา ตรวจเคส' · ปุ่มตีกลับหายไป
**ผลหลังบ้าน**: POST 1 ครั้ง (200) · assignment `needs_revision` · evidence `rejected` reviewed_by `uat.approver` · expenses C4 ไม่เปลี่ยน (commission 50000 + fuel 10000 + allowance 7500 `pending_warehouse_confirm`) · asset C4 `pending_intake` · audit `reject case_assignments` reason ครบ events `["case.evidence_rejected"]` 1 แถว · noti in2 'หลักฐานปิดงานถูกตีกลับ' → `/field/tracking`
**สถานะ**: ✅ ผ่าน

## E (ต่อ). พนักงาน in2 แก้หลักฐาน

### R4.26 เห็นการตีกลับ + ลองส่งโดยไม่แก้
**เมนู**: กระดิ่ง → 'หลักฐานปิดงานถูกตีกลับ'
![](../shots/R4v3/26-in2-bell.png)
![](../shots/R4v3/26-in2-tracking-revision.png)
**ผลบนจอ**: ไป `/field/tracking` (ไม่ 404) · บล็อกส้ม 'ถูกตีกลับ ต้องแก้ไขหลักฐาน (1)' → 'แก้ไขหลักฐาน' → dialog 'แก้ไขหลักฐานปิดงาน': 'หลักฐานปิดงานถูกตีกลับ — ต้องแก้ไข · เหตุผล: รูปสินค้าไม่เห็น IMEI' · ผล/เช็คอิน 'ล็อกไว้ตามรอบเดิม' · ไม่มี 'บันทึก Draft' · ไม่มีปุ่มเช็คอิน
![](../shots/R4v3/26-in2-revision-dialog.png)
**probe**: กด 'ส่งกลับยืนยันอีกครั้ง' ทันที → toast 'ยังไม่ได้แก้ไขหลักฐาน' + 'ต้องเพิ่ม/ลบ/แทนที่รูป วิดีโอ เสียง หรือรูปสินค้าอย่างน้อย 1 รายการก่อนส่งกลับ' ไม่มี request · API ชุดไฟล์เดิม → 400 `CLOSE_NO_EVIDENCE_REVISION` · API เช็คอิน → 400 `ASSIGNMENT_INVALID_STATUS` (`add_checkin`)
![](../shots/R4v3/26-in2-no-revision-toast.png)
**ผลหลังบ้าน**: ไม่มีแถวเปลี่ยน (expenses C4 3 · evidence 1 · check_ins C4 1)
**สถานะ**: ✅ ผ่าน

### R4.27 แทนรูปสินค้า v1 → v2 แล้วส่งกลับ
**ทำ**: 'ลบรูปสินค้ายืนยันลำดับที่ 1' → 'เลือกไฟล์' ← `R4-C4-product-v2.jpg` → 'ส่งกลับยืนยันอีกครั้ง'
![](../shots/R4v3/27-in2-product-v2.png)
**ผลบนจอ**: toast 'ส่งหลักฐานกลับให้ตรวจอีกครั้งแล้ว' + 'รายการเบิกของรอบเดิมถูกแทนที่ด้วย: คอมมิชชั่น ฿500.00' · บล็อกส้มหาย · 'จบงาน' แสดง C4 'ปิดงานสำเร็จ · ปิดงานเมื่อ 04/10/2569 **00:56**' (เวลาเปลี่ยนเป็นเวลาส่งใหม่ — ❓-R4bv3-1)
![](../shots/R4v3/27-in2-tracking-after.png)
![](../shots/R4v3/27-in2-closed.png)
**ผลหลังบ้าน**:
- assignment `closed_success` · evidence C4 2 แถว: `rejected` (v1) + `pending` (v2 · hashed 3 · sha v2 = 34a64d1e… ตรง fixture)
- expenses C4 4 แถว: commission `ad7e5be8-…` `superseded` → commission ใหม่ `2b46fa31-…` (ชนิดเดียวกัน) · fuel/allowance รายวัน id เดิม `pending_warehouse_confirm` ลิงก์ NULL · ใบใหม่ expense_date 2026-10-04, comp_plan_version 1 = ใบเดิม (Q7)
- check_ins C4 1 · asset 1 · revenues 0 · drafts 0
- audit: `status_change expenses` (superseded, reason 'ส่งหลักฐานปิดงานใหม่หลังถูกตีกลับ — แทนที่รายการเบิกรอบเดิม') · `create expenses` events `expense.case_bound_created` · `status_change case_assignments` events `case.close_resubmitted` (after มี `supersededExpenseIds` / `expenseIds`) — แต่ audit ของแถวที่ถูกแทน**ไม่มี `supersededByExpenseId`** (🐞 R4bv3-B01)
- noti: uat.admin `case.close_resubmitted` 'ส่งหลักฐานใหม่แล้ว — UAT-CO1-004' → `/warehouse`
**สถานะ**: ✅ ผ่าน + 🐞 R4bv3-B01

### R4.28 หน้าเบิกค่าใช้จ่าย/รายได้หลังส่งใหม่
![](../shots/R4v3/28-in2-expenses.png)
**ผลบนจอ**: 'รอดำเนินการ' **฿1,050.00** · การ์ด C4 'UAT-CO1-004 · 3 รายการ · 1 รายการถูกแทนที่' ฿675.00 'รอยืนยันคืนคลัง' · ตัวกรองสถานะไม่มี 'ถูกแทนที่แล้ว' (มีป้ายบนการ์ดแทน) · ไม่มีกล่อง 'รอคำนวณหลังจบวัน' · รายได้ ฿500.00 (คอมมิชชั่น 1 เคส) + ฿200.00 เบี้ยเสี่ยง · แดชบอร์ด 50.00%
![](../shots/R4v3/28-in2-income.png)
**สถานะ**: ✅ ผ่าน

## F. ค่าที่พัก in1 ฿600

### R4.29 เบิกค่าที่พัก
**เมนู**: เบิกค่าใช้จ่าย → แท็บ 'เบิกแยก' → '+ เบิกที่พัก'
**probe ฟอร์ม (ไม่มี request)**: กดส่งทันที → 'กรุณาเลือกวันที่เข้าพัก' · ยอด 0 / -100 → 'จำนวนเงินต้องมากกว่า 0' · 600.505 → 'จำนวนเงินกรอกทศนิยมได้ไม่เกิน 2 ตำแหน่ง' · ไม่แนบใบเสร็จ → 'ต้องแนบใบเสร็จก่อนส่งคำขอเบิก' · API ยอด 0 → 400 `REQUIRED_MISSING` fields.amountSatang
![](../shots/R4v3/29-hotel-probe-empty.png)
![](../shots/R4v3/29-hotel-probe-no-receipt.png)
**probe ใบเสร็จฝั่ง server (`s14a`)**: แนบไฟล์ `R4b-fake-receipt.jpg` (เนื้อเป็นข้อความ) → อัปโหลดขึ้น Storage ได้ → ส่ง → 400 `UPLOAD_FILE_TYPE_INVALID` toast 'ชนิดไฟล์ไม่รองรับ' (modal ยังเปิด ไม่มีแถว) · API: path ใบเสร็จของ in2 / path หลักฐาน C1 / path มี `../` → `UPLOAD_PATH_OUT_OF_SCOPE` 'ที่อยู่ไฟล์ไม่ถูกต้อง' · path ที่ไม่มีไฟล์ → `UPLOAD_FILE_NOT_FOUND` · hotel ยัง 0 แถว
![](../shots/R4v3/29-hotel-fake-receipt.png)
**ทำจริง**: วันที่เข้าพัก 2026-10-04 · 600 · '— พักคนเดียว —' · แนบ `R4-C1-photo.jpg` · หมายเหตุ 'UAT ค้างคืนหลังปิด C1' → 'ส่งคำขอเบิก'
![](../shots/R4v3/29-hotel-filled.png)
**ผลบนจอ**: toast 'ส่งคำขอเบิกค่าที่พักแล้ว — รอผู้อนุมัติตรวจสอบ' · modal ปิด · แท็บ 'เบิกแยก' '🏨 UAT ค้างคืนหลังปิด C1 · วันที่ 04/10/2569 · ฿600.00 · รออนุมัติจ่าย' · กล่อง 'รอดำเนินการ' ของแท็บนี้ ฿600.00 · แท็บ 'ผูกกับเคส' ยัง ฿1,350.00 · การ์ดไม่แสดงเคสที่จับคู่
![](../shots/R4v3/29-hotel-listed.png)
**ผลหลังบ้าน**: hotel 60000 `pending_approval` expense_date 2026-10-04 · `calculation_source` receipt · `receipt_file_url` `expenses/88cb577d-…/receipts/da2904f1-…-R4-C1-photo.jpg` · `receipt_file_hash` = SHA-256 ของ fixture ตรง · case_id/comp_plan_id NULL · approval_step_total 2 · audit `create expenses` events `expense.hotel_claim_submitted` · แจ้งเตือน 0
**สถานะ**: ✅ ผ่าน (BUG-072, BUG-073 ยืนยันว่าแก้แล้ว)

## G. เงินทดรอง

### R4.30 in1 เปิดหน้าเงินทดรอง + probe
**เมนู**: hamburger → 'เงินทดรองจ่าย' (`/field/advances`) → ว่าง 'ยังไม่มีคำขอเงินทดรอง' → '+ ขอเงินทดรอง'
![](../shots/R4v3/30-advances-empty.png)
![](../shots/R4v3/30-advance-modal.png)
**probe (ไม่มี request)**: 0 → 'ยอดที่ขอเบิกต้องมากกว่า 0' · -100 → 'ยอดที่ขอเบิก ต้องไม่ติดลบ' · 100.505 → 'ทศนิยมไม่เกิน 2 ตำแหน่ง' · 'abc' → 'ระบุวัตถุประสงค์อย่างน้อย 5 ตัวอักษร' · ช่องวันที่ `min` = 2026-10-04 · API เมื่อวาน → 400 `REQUIRED_MISSING` 'กำหนดเคลียร์ยอดต้องเป็นวันนี้หรือวันถัดไป — เลือกวันที่ผ่านมาแล้วไม่ได้' · 2026-02-30 → 400 'ไม่ใช่วันที่ที่มีอยู่จริง' · advances 0
![](../shots/R4v3/30-advance-probe.png)
**สถานะ**: ✅ ผ่าน

### R4.31 ADV1 (ดับเบิลคลิก)
**ทำ**: 3000 · 'UAT ADV1 สำรองค่าเดินทางติดตามทรัพย์ ต.ค.' · 2026-10-11 → ดับเบิลคลิก 'ส่งคำขออนุมัติ'
![](../shots/R4v3/31-adv1-listed.png)
**ผล**: POST 1 ครั้ง (201) · toast 'ส่งคำขอแล้ว' + 'รอการเงินอนุมัติก่อนรับเงิน' · การ์ด ฿3,000.00 'รออนุมัติ' 'ขอเมื่อ 04/10/2569 00:58' 'กำหนดเคลียร์ยอด 11/10/2569' · DB 1 แถว 300000 `pending_approval` · audit create 1
**สถานะ**: ✅ ผ่าน

### R4.32 ADV2 ขณะ ADV1 pending
![](../shots/R4v3/32-adv2-listed.png)
**ผล**: สร้างได้ 100000 `pending_approval` (pending ไม่บล็อก ตาม DATASET)
**สถานะ**: ✅ ผ่าน

### R4.33 in2 ADV3 วันเคลียร์ = วันนี้
**probe**: ใส่วันที่ 2026-10-03 (ข้าม `min`) → ข้อความใต้ช่อง 'กำหนดเคลียร์ยอดต้องเป็นวันนี้หรือวันถัดไป — เลือกวันที่ผ่านมาแล้วไม่ได้' ไม่มี request
![](../shots/R4v3/33-adv3-past-date.png)
**ทำจริง**: 2026-10-04 → 201 · การ์ด ฿2,000.00 'กำหนดเคลียร์ยอด 04/10/2569'
![](../shots/R4v3/33-adv3-listed.png)
**สถานะ**: ✅ ผ่าน

### R4.34 out1 ADV-MAX → ADV4
**ทำ**: 6000 → modal แสดง 'ยอดขอเบิกเกินเพดานต่อครั้ง · ขอได้สูงสุดครั้งละ ฿5,000.00 — ลดยอดแล้วส่งคำขอใหม่' (API `ADVANCE_EXCEEDS_MAX` maxSatang 500000) ไม่มีแถว → แก้เป็น 1000 'UAT ADV4 ทดสอบใช้เกินยอดอนุมัติ (Q3)' → 201
![](../shots/R4v3/34-adv-max.png)
![](../shots/R4v3/34-adv4-listed.png)
**สถานะ**: ✅ ผ่าน

### R4.35 การเงินเห็นคำขอ (อ่านอย่างเดียว)
**ผลหลังบ้าน**: `approve_advance` = การเงิน manage
**เมนู**: การเงิน → แท็บ 'เงินทดรองจ่าย'
![](../shots/R4v3/35-finance-advances.png)
**ผลบนจอ**: 4 แถว (ADV4, ADV3, ADV2, ADV1) 'รออนุมัติ' พร้อมปุ่ม 'อนุมัติ' / 'ปฏิเสธ' ทุกแถว (ไม่ได้กด — non-GET 0) · กล่องสรุป ฿0.00 / 0 / 0 (ยังไม่มีใบอนุมัติ ถูกต้อง)
**สถานะ**: ✅ ผ่าน

## H. ตรวจปลายรอบ

### R4.36 แจ้งเตือนทั้ง R4 (ตั้งแต่ 17:40 UTC)
| event | ผู้รับ | จำนวน |
|---|---|---|
| `assignment.accepted` → `/cases/assign` | mgr.in 5 · sup.in 5 · mgr.out 1 | 11 ✅ |
| `case.closed_success` → `/warehouse` | uat.admin | **4** (C1, C2, C4, C5) |
| 🆕 `case.close_resubmitted` 'ส่งหลักฐานใหม่แล้ว — UAT-CO1-004' → `/warehouse` | uat.admin | **1** (แทนที่ closed_success ซ้ำตาม step sheet — BUG-071 แก้แล้ว) |
| `case.closed_fail` → `/cases/assign` | mgr.in, sup.in | 2 ✅ |
| `expense.case_bound_created` → `/finance/approvals` | mgr.in | 1 (BUG-096 ลิงก์ 404 — known) |
| `case.evidence_rejected` → `/field/tracking` | in2 | 1 ✅ |
| job / ค่าที่พัก / เงินทดรอง | — | 0 |
- แถวถึง mgr.out จากทีม A = 0 · ถึงผู้ใช้บริษัท = 0 · ถึงพนักงานที่ไม่ใช่เจ้าของเคส = 0 · notifications รวม 31 (29 + 2)
- API `GET /api/field/notifications` ตรง DB: in1 1 รายการ · in2 3 รายการ (1 อ่านแล้ว) · out1 0 · (รายการ timeout จาก R3 ลิงก์ `/cases/assign` = BUG-059 known)
![](../shots/R4v3/36-admin-bell-c4-twice.png)
**สถานะ**: ✅ ผ่าน

### R4.37 audit
R4 ทั้งรอบ: `case_assignments` status_change 17 (= รับ 6 + จัดวัน 5 + ปิด 5 + ส่งใหม่ 1) · reject 1 · `check_ins` create 5 · `expenses` create 16 (ปิดงาน 5 + รายวัน 9 + commission ใหม่ 1 + hotel 1) · status_change 1 (superseded) · `field_day_settlements` create 3 · `jobs` create 2 / status_change 2 · `advances` create 4 · `close_case_drafts` update 29 (R4a) · **R4b มี audit 9 แถว — ไม่มีจาก probe ที่ถูกปัด** (403/400 `UPLOAD_*`, `CLOSE_NO_EVIDENCE_REVISION`, `ADVANCE_EXCEEDS_MAX`, `REQUIRED_MISSING`) · actor/role ถูกคนทุกแถว
**สถานะ**: ✅ ผ่าน

### R4.38 invariant
| ค่า | คาด | จริง |
|---|---|---|
| revenues | 0 | 0 |
| expenses ทั้งหมด / superseded / active | 16 / 1 / 15 | 16 / 1 / 15 |
| ผลรวม active | 950000 | **950000** |
| ผูกเคส (ไม่รวม hotel) | 890000 | 890000 |
| commission+no_success active | 5 | 5 |
| แถวรายวัน / ถูกแทน | 9 / 0 | 9 / 0 |
| field_day_settlements | 3 | 3 (diff fuel/allowance = 0 ทุกแถว) |
| assets / check_ins | 4 / 5 | 4 / 5 |
| case_evidences / ไม่มี hash | 6 / 0 | 6 / 0 |
| close_case_drafts | 0 | 0 |
| advances | 4 | 4 |
| active ซ้ำต่อ assignment×ชนิด | 0 แถว | 0 แถว |
| superseded ข้ามชนิด | 0 แถว | 0 แถว |
- สถานะ: `pending_warehouse_confirm` 11 (852500) · `pending_approval` 4 (97500 = C3 37500 + hotel 60000) · `superseded` 1 (50000)
- pm2 log ไม่มี error ใหม่ · ไม่มี 500
**สถานะ**: ✅ ผ่าน

### ไฟล์ใน Storage รอบนี้ (ห้ามลบ)
- `cases/d4d82f78-7500-4e10-94ae-c703483b7272/field_evidence/product_photo/d8721d04-39fa-436e-80c3-27d96ea5a963-R4-C4-product-v2.jpg` (หลักฐานจริง)
- `expenses/88cb577d-32b4-49ff-96fb-06a2e093d339/receipts/da2904f1-5b20-4550-bded-fcd0ed53ed4a-R4-C1-photo.jpg` (ใบเสร็จจริง)
- **ขยะ**: `expenses/88cb577d-32b4-49ff-96fb-06a2e093d339/receipts/f7f77b14-26af-40f1-9883-73f4d694a9c2-R4b-fake-receipt.jpg` (ไฟล์ปลอมที่ server ปัด — ไม่มีแถวอ้างถึง)

---

## 🐞 บั๊กที่พบ

| ID | Severity | เรื่อง | หลักฐาน |
|---|---|---|---|
| **R4bv3-B01** | S5 | audit ของรายการเบิกที่ถูกแทนตอนส่งหลักฐานใหม่ ไม่บันทึกว่าถูกแทนด้วยใบไหน (`after_data` = `{status:'superseded', expenseType, grossSatang, events:[]}` ไม่มี `supersededByExpenseId`) — ข้อมูลลิงก์อยู่แค่คอลัมน์ `expenses.superseded_by_expense_id` · ไล่ย้อนจาก audit ได้ทางอ้อมผ่าน audit ของ `case_assignments` (`supersededExpenseIds` + `expenseIds`) | R4.27 · audit 17:56:00 target `ad7e5be8-…` |

ยืนยันว่าแก้แล้ว (ไม่ต้องเปิดใหม่): **BUG-071** (ส่งใหม่แจ้งเป็น `case.close_resubmitted` แล้ว) · **BUG-072** (ใบเสร็จตรวจ path/มีจริง/magic bytes + เก็บ hash) · **BUG-073** (ข้อความยอด 0/ติดลบ) · ยังเห็น: BUG-059, BUG-096, R4v3-B, R4v3-C

## ❓ ต้องตัดสินใจ

- **❓-R4bv3-1 เวลาปิดงานหลังส่งใหม่**: ส่งหลักฐานใหม่เขียนทับ `case_assignments.completed_at` (00:45 → 00:56) ⇒ หน้า 'จบงาน'/'สรุปรายได้' แสดง 'ปิดงานเมื่อ 04/10/2569 00:56' · ขณะที่รายการเบิกใหม่ยึดวันที่ปิดครั้งแรก (Q7) · spec ไม่ระบุ — ควรแสดงเวลาปิดครั้งแรก (แล้วเพิ่ม 'ส่งใหม่เมื่อ …') หรือเวลาล่าสุด? ถ้าวันปิดครั้งแรกกับวันส่งใหม่คนละเดือน หน้า 'สรุปรายได้' ที่กรองตามเดือนอาจย้ายเคสไปเดือนใหม่
- **❓-R4bv3-2 ยอด 'รอดำเนินการ' ของหน้าเบิก**: กล่องแสดงยอดแยกต่อแท็บ (ผูกกับเคส ฿1,350.00 / เบิกแยก ฿600.00) ไม่มีจุดแสดงรวม ฿1,950.00 — ตามที่ออกแบบไว้ หรือควรมียอดรวมทุกแท็บ?
- **❓-R4bv3-3 'พักร่วมกับ'**: รายการให้เลือกมีผู้จัดการทีม (ชัยวัฒน์ จัดการทีม) และหัวหน้าทีม (สุริยา หัวหน้าเอ) นอกจากพนักงานภาคสนาม (บุญมี ภาคสนาม) — ตรงกับคำว่า 'คนในทีม' หรือควรเป็นเฉพาะพนักงานภาคสนาม?
- ค้างจาก step sheet: ❓-R4v2-1 (ADV4 เล่นใน R6) · ❓-R4v3-1 (bank-R7.csv) · ❓-R4v3-2 (R6 step sheet) — ไม่เปลี่ยน
- หมายเหตุถึง orchestrator: step sheet R4.36 ยังคาด `case.closed_success` 5 แถว — ควรแก้เป็น 4 + `case.close_resubmitted` 1 · brief ระบุ "active 16 แถว" แต่ค่าจริง/step sheet = ทั้งหมด 16 · active 15 (950000) ตรงกัน

---

## R4.38b แก้การอนุมัติผิดคน

**เหตุ**: เผลอใช้ `admin` (Superadmin) กด "อนุมัติขั้น 1" ค่าที่พัก in1 ฿600 (04/10/2569 01:24) → รายการไปรอขั้น 2 การเงิน · มติ PO: ตีกลับผ่านหน้าจอ แล้วให้ in1 ส่งใหม่ · สคริปต์ `uat/bin/r4v3/s18-misapprove-fix.mjs` (`PHASE=admin` / `PHASE=in1`)

| # | ผู้ใช้ | ทำอะไร | ผลที่เห็น | ภาพ |
|---|---|---|---|---|
| 1 | admin | การเงิน → แท็บ "ค่าตอบแทน" → แถว "ไม่ผูกเคส · อนันต์ ตามทรัพย์ · ค่าที่พัก ฿600 · ขั้น 2/2" → **ตีกลับ** → เหตุผล "อนุมัติผิดคน — ส่งกลับให้ผู้จัดการทีมอนุมัติขั้น 1" → **ตีกลับรายการ** | toast "ตีกลับให้แก้ไขแล้ว รายการกลับไปเริ่มที่ขั้น 1 ใหม่ทั้งหมด" · `needs_revision` ขั้น 1 · ล้างผู้อนุมัติ/เวลาแล้ว · ประวัติอนุมัติ = approve (ขั้น 1) + reject (ขั้น 2) · in1 ได้แจ้งเตือน "รายการเบิกถูกตีกลับ" | ![](../shots/R4v3/88-admin-comp-queue.png) ![](../shots/R4v3/89-admin-reject-dialog.png) ![](../shots/R4v3/90-admin-after-reject.png) |
| 2 | in1 (มือถือ) | กระดิ่ง → "รายการเบิกถูกตีกลับ" → พาไปหน้า**รายได้** (ไม่ใช่หน้าเบิก) → เข้า "เบิก" เอง → แท็บ **เบิกแยก** → กล่อง "ถูกตีกลับ ต้องแก้ไขแล้วส่งใหม่ (1)" → **แก้ไขและส่งใหม่** → ยอด 600.00 คงเดิม · "ใช้ใบเสร็จเดิม" · กรอกชี้แจง → **ส่งกลับเข้าคิวอนุมัติ** | toast "ส่งรายการเบิกกลับเข้าคิวอนุมัติแล้ว" · `pending_approval` ขั้น 1 · 60000 · ใบเสร็จ/hash เดิม (`c49a023f…`) · ไม่มีแถวใหม่ | ![](../shots/R4v3/91-in1-bell.png) ![](../shots/R4v3/92-in1-separate-needs-revision.png) ![](../shots/R4v3/93-in1-resubmit-dialog.png) ![](../shots/R4v3/94-in1-after-resubmit.png) |
| 3 | — | ตรวจฐาน | expense ทั้งหมด 16 / active 15 / **950000** · `pending_approval` 4 (97500) · audit ครบ 2 แถว (admin `reject` มีเหตุผล · in1 `status_change` event `expense.resubmitted`) · console/500/pm2 ไม่มี error ใหม่ · ไม่มีไฟล์ Storage ใหม่ | — |

**สถานะ**: ✅ ผ่าน — รายการพร้อมให้ R6 ทดสอบ "ไม่ผูกเคส → ผู้จัดการทีมของผู้เบิกอนุมัติขั้น 1"

**ข้อสังเกต (บั๊ก)**
- **R4bv3-B02 (S4)** หมายเหตุตอนเบิกถูกเขียนทับเมื่อส่งใหม่: เดิม "UAT ค้างคืนหลังปิด C1" กลายเป็นข้อความชี้แจงตอนส่งใหม่ (ฟิลด์เดียวกัน `revision_note`) · หน้าเบิกแสดงข้อความชี้แจงเป็นชื่อรายการแทน · audit ไม่เคยเก็บหมายเหตุเดิม → กู้คืนไม่ได้
- **R4bv3-B03 (S5)** แจ้งเตือน `expense.rejected` ลิงก์ไป `/field/income` (หน้ารายได้) แทนหน้าเบิก (`/field/expenses` แท็บที่มีรายการ) — ผู้ใช้ต้องหาเอง
- หมายเหตุ: การส่งใหม่ไม่ได้ลงประวัติอนุมัติ (`approval_history` ยังมี 2 รายการ) และไม่แจ้งผู้จัดการทีม — เหมือนตอนเบิกครั้งแรก (ไม่มีแจ้งเตือน `expense.*` ถึงผู้จัดการ) ให้ R6 ดูต่อ
