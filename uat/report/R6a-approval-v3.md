# R6a v3 — การเงิน: อนุมัติค่าตอบแทนตามสายอนุมัติ → รายได้เกิด → เงินทดรอง (ผู้จัดการทีม `uat.mgr.in`/`uat.mgr.out` · การเงิน `uat.finance` · บริหาร `uat.exec` · หัวหน้าทีม `uat.sup.in` · พนักงาน `uat.agent.in1`/`in2`)

> step sheet `uat/steps/R6.md` **v2** (R6.01–R6.20 เท่านั้น) · golden `uat/DATASET.md` v3 + มติ `uat/PO-DECISIONS-2569-10-04.md` (O1–O4) · ต้นรอบ = `R5-end-v3` · ปลายรอบ = `R6a-end-v3` (orchestrator เป็นผู้ snapshot)
> วันที่ทดสอบ: 04/10/2569 (พ.ศ.) 01:57–02:11 น. เวลาไทย · T0 (UTC) `2026-10-03 18:57:52+00`
> ผู้เล่น: role agent ผ่าน Playwright (Chrome headless · desktop 1440×900 · พนักงานจำลอง iPhone 14) · สคริปต์ `uat/bin/r6v3/*.mjs` · log `uat/bin/r6v3/run.log` · ภาพ `uat/shots/R6v3/*.png` (**37 ภาพ**) · ไม่มีไฟล์อัปโหลดในรอบนี้
> **ผล: ✅ 20/20 step · ไม่มี S1/S2 · ไม่มี 500 · probe ทุกตัวไม่เกิด mutation/audit** · golden ปลาย R6a ตรงทุกตัวเลข · 🐞 ใหม่ 1 (S4) · ⚠️ 2 (ข้อต่างจาก step sheet) · ❓ 0 ใหม่ (ยืนยันข้อเดิม R6-N1 / ❓-R6-5)

## ⚠️ ข้อต่างจาก step sheet (อ่านก่อน)
1. **R6.09 การเงินเห็น 15 แถว ไม่ใช่ 14** — 13 แถวทีม A + C5 อีก 2 แถว = 15 ทุกแถวรอขั้น 2 (step sheet นับพลาด) · ไม่กระทบผล
2. ป้ายประเภทบนจอสะกด **'คอมมิชชั่น'** (step sheet เขียน 'ค่าคอมมิชชัน') · ภาพ `R6.01-mgr.in-bell.png`/`R6.01-mgr.out-bell.png`/`R6.10-in2-notifications.png` เป็นภาพทดลองที่ไม่ได้ใช้เป็นหลักฐาน (กระดิ่งจริงอยู่ใน `R6.01-mgr-in-bell.png`, `R6.10-in2-bell.png`)

## สรุปผลต่อ step
| Step | เรื่อง | ผล |
|---|---|---|
| R6.01 | เมนู/คิว/กระดิ่ง 5 บทบาท | ✅ + ข้อสังเกต R6-N1 (ยืนยัน) |
| R6.02 | probe scope ทีม 3 ตัว → 404 | ✅ |
| R6.03 | probe ข้ามขั้น 3 ตัว → 403/403/400 | ✅ |
| R6.04 | race ขั้น 1 ใบเดียวกัน 2 context + ดับเบิลคลิกแท็บค้าง | ✅ + 🐞 R6av3-B01 |
| R6.05 | ผู้จัดการทีม A ขั้น 1 อีก 11 ใบ | ✅ |
| R6.06 | ค่าที่พัก in1 → `uat.mgr.in` ขั้น 1 (มติ R6-B) | ✅ |
| R6.07 | ผู้จัดการทีม C ขั้น 1 C5 ×2 (fuel 2/3) | ✅ |
| R6.08 | SoD — พึ่ง unit test + ตรวจทางอ้อม | ✅ (ทางอ้อม) |
| R6.09 | การเงินตีกลับ C3 เบี้ยเลี้ยงที่ขั้น 2 | ✅ (⚠️1) |
| R6.10 | in2 แก้ไขและส่งใหม่ (มือถือ) → ขั้น 1 ใหม่ | ✅ |
| R6.11 | การเงินขั้น 2 C1 ทีละใบ — รายได้เกิดตอนใบที่ 3 | ✅ |
| R6.12 | C2 ×3 + ค่าที่พัก | ✅ |
| R6.13 | C5 commission → fuel ขึ้นขั้น 3 + probe การเงินขั้น 3 | ✅ |
| R6.14 | บริหารขั้น 3 C5 fuel → รายได้ C5 | ✅ |
| R6.15 | ตรวจรายได้ต่อเคส | ✅ |
| R6.16 | อนุมัติ ADV1 (ดับเบิลคลิก) | ✅ |
| R6.17 | ADV2 ถูกปัด → probe เหตุผล → ปฏิเสธ | ✅ |
| R6.18 | in1 ขอใบใหม่ระหว่าง ADV1 ค้าง (มือถือ) | ✅ |
| R6.19 | อนุมัติ ADV4 · KPI ฿4,000.00 | ✅ |
| R6.20 | ตรวจปลาย R6a | ✅ ตรง golden ทุกตัว |

## ผลยืนยันจุดที่ต้องดูเป็นพิเศษ
| เรื่อง | ผล | step |
|---|---|---|
| สายอนุมัติทีละขั้นผ่านหน้าจอ | ✅ ผู้จัดการ 'อนุมัติขั้น 1' 15+1 ครั้ง → การเงิน 'อนุมัติขั้น 2' 9 → บริหาร 'อนุมัติขั้น 3' 1 · ทุกครั้ง toast 'อนุมัติแล้ว' '<ผู้รับ> — <ประเภท>' · ป้าย 'ขั้น 1/2: รอ ผู้จัดการทีมติดตามทรัพย์' → 'ขั้น 2/2: รอ การเงิน' / 'ขั้น 2/3' → 'ขั้น 3/3: รอ บริหาร' → '✓ ผ่านทุกขั้น' | R6.05–14 |
| แต่ละคนเห็นเฉพาะขั้นของตัวเอง | ✅ ต้นรอบ: mgr.in 13 แถว · mgr.out 2 แถว · การเงิน/บริหาร **ว่าง** (empty state) · หัวหน้าทีมไม่มีเมนู 'การเงิน' + `/finance` เด้ง `/dashboard` + API 403 · หลังขั้น 1 ปุ่มหายจากจอผู้จัดการ · บริหารเห็น 9 แถว (8 แถวอนุมัติแล้ว + C5 fuel ที่รอขั้น 3 แถวเดียวมีปุ่ม) ไม่เห็น C3/C4 ที่ค้างขั้น 2 | R6.01/06/14 |
| ข้ามขั้นทาง API ถูกปัด | ✅ การเงินขั้น 1 → 403 `PERMISSION_DENIED` · บริหารขั้น 1 → 403 · ผู้จัดการส่ง step 2 → 400 `APPROVAL_STEP_OUT_OF_ORDER` · การเงินขั้น 3 → 403 · updated_at ไม่เปลี่ยน audit 0 | R6.03/13 |
| scope ทีม | ✅ mgr.out → C1 / hotel และ mgr.in → C5 = 404 `EXPENSE_NOT_FOUND` (ไม่ leak) | R6.02 |
| ตีกลับไม่มีเหตุผล | ✅ ปุ่ม 'ตีกลับรายการ' disabled · API → 400 **`REJECT_REASON_REQUIRED`** · เงินทดรอง: 'ยืนยันปฏิเสธ' disabled · API → 400 **`REJECTION_REASON_REQUIRED`** (BUG-088 แก้แล้วจริง) | R6.09/17 |
| ตีกลับ → กลับขั้น 1 | ✅ `needs_revision` cur 1 · ล้าง `manager_approved_by` · h 2 · แจ้ง in2 1 แถว (ลิงก์ `/field/income` = BUG-099 เดิม) · in2 ส่งใหม่ → `pending_approval` gross 7500 คงเดิม · revision_note ถูกบันทึก · ผู้จัดการขั้น 1 ใหม่ → h 3 | R6.09–10 |
| ค่าที่พัก in1 → `uat.mgr.in` ขั้น 1 (R6-B) | ✅ manager_approved_by = uat.mgr.in · h 3 (Superadmin approve/reject เดิม + ผู้จัดการ approve) · ไม่ติด SoD ⇒ SoD นับเฉพาะรอบหลังตีกลับ · การเงินขั้น 2 → approved h 4 ไม่แตะรายได้ | R6.06/08/12 |
| แถวรายวัน 9 แถวนับรวมยอดต่อพนักงาน | ✅ คิว mgr.in: in1 195000 · in2 105000 · ปลายรอบ approved in1 **195000** · out1 **650000** · in2 รอขั้น 2 **105000** | R6.01/20 |
| รายได้เกิดเมื่อ expense ครบ + ล็อต confirmed | ✅ C1: ใบ 1–2 revenues = 0 → ใบ 3 = 1 ทันที · C2 เช่นกัน · C5 เกิดตอนบริหารอนุมัติ fuel · audit `after.revenue_ids_created` มี id เฉพาะใบสุดท้ายของแต่ละเคส | R6.11–14 |
| idempotent ต่อ case+tracking_round | ✅ ไม่มีคู่ (case_id, tracking_round) ซ้ำ · 1 แถวต่อเคส | R6.20 |
| หลักฐาน C3 | ✅ ยัง `pending` (C3 ค้างขั้น 2 โดยตั้งใจ — ผ่านใน R6b R6.32) | R6.15 |
| race / ดับเบิลคลิก | ✅ race 2 context: 200 + 400 `EXPENSE_INVALID_STATUS` · audit 1 · ดับเบิลคลิกแท็บค้าง = 1 request → toast แดง (ข้อความผิดทิศ 🐞 R6av3-B01) · ดับเบิลคลิก 'อนุมัติและปล่อยเงิน' ADV1 = 1 request | R6.04/16 |
| เงินทดรอง | ✅ ADV1 approved 300000 · ADV2 ถูกปัด `ADVANCE_PENDING_SETTLEMENT` ('มีเงินทดรองค้างอยู่') → ปฏิเสธพร้อมเหตุผล · in1 ขอใบใหม่ → 400 'ยังมีเงินทดรองที่ไม่ได้เคลียร์ยอด' advances คง 4 · ADV4 approved 100000 · ADV3 ไม่แตะ · KPI ฿4,000.00 / รอเคลียร์ 2 | R6.16–19 |
| SoD | ✅ ทางอ้อม (ค่าที่พัก) — ไม่มี role ถือ 2 ขั้น ⇒ พึ่ง unit test `lib/compensation/approval.test.ts` (มติ O2) | R6.08 |
| แจ้งเตือน | ✅ `expense.approved` 9 (in1 7, out1 2) 'รายการเบิกผ่านอนุมัติครบทุกขั้น' · `expense.rejected` 1 (in2) · ขั้นกลางไม่แจ้ง · ไม่มีแจ้งเตือนเงินทดรอง (spec ไม่มี event) · **R6-N1 ยืนยัน**: กระดิ่ง mgr.in มีแค่ 'มีรายการเบิกใหม่รออนุมัติ' ของ C3 (ลิงก์ `/finance/approvals` = BUG-096) — ไม่มีของค่าที่พัก/แถวรายวัน/ล็อตปลดล็อก · บริหารไม่ได้รับแจ้งเมื่อ C5 ถึงขั้น 3 | R6.01/13/20 |

---

### R6.01 ผู้จัดการทีมเปิดคิวอนุมัติ
**เมนู**: แถบบน 'การเงิน' → แท็บ 'ค่าตอบแทน' (`/finance?tab=comp`)
![](../shots/R6v3/R6.01-mgr.in-comp-tab.png)
**ทำ**: เปิดหน้าแรก + แท็บ 'ค่าตอบแทน' + `GET /api/compensation?status=all` ด้วย 5 บทบาท
**ผลบนจอ**: `uat.mgr.in` เมนู 'แดชบอร์ด | จัดการเคส | การเงิน | คลังสินค้า | รายงาน' · หน้าการเงินมี**แท็บเดียว 'ค่าตอบแทน'** · 13 แถวทุกแถว 'อนุมัติขั้น 1'/'ตีกลับ'/'ดูสูตร' · hotel '— ไม่ผูกเคส' 'อนันต์ ตามทรัพย์' ค่าที่พัก ฿600.00 · แถวรายวันฐานคิด '1 วัน × 150.00 บาท/วัน' คู่ ฿75.00 (BUG-095 เดิม) · `uat.mgr.out` 2 แถว (C5 fuel 'ขั้น 1/3' WHT ฿165.00, commission 'ขั้น 1/2' WHT ฿30.00) · `uat.sup.in` ไม่มีเมนู 'การเงิน' `/finance` → `/dashboard` · `uat.finance`/`uat.exec` 'ยังไม่มีรายการค่าตอบแทน'
![](../shots/R6v3/R6.01-finance-comp-empty.png)
![](../shots/R6v3/R6.01-mgr-in-bell.png)
**ผลหลังบ้าน**: API mgr.in 200 n=13 (ยอด in1 195000, in2 105000) · mgr.out 200 n=2 · sup.in 403 `PERMISSION_DENIED` · finance/exec 200 n=0 · กระดิ่ง mgr.in 7 ยังไม่อ่าน: 'มีรายการเบิกใหม่รออนุมัติ' (C3) + 'ปิดงานไม่สำเร็จ' + 'พนักงานกดรับงานแล้ว' ×5 + timeout
**สถานะ**: ✅ · ข้อสังเกต R6-N1 (S4 spec-gap ยืนยัน)

### R6.02–R6.03 probe สิทธิ์ (ไม่มี mutation)
**ทำ**: `PATCH /api/compensation/<id>/approve` ด้วย cookie ของแต่ละบทบาท
**ผลหลังบ้าน**: mgr.out→C1 fuel 404 · mgr.in→C5 commission 404 · mgr.out→hotel 404 (`EXPENSE_NOT_FOUND` 'ไม่พบรายการเบิกนี้ หรือไม่ใช่รายการของคุณ') · finance step1 403 · exec step1 403 ('ไม่มีสิทธิ์อนุมัติขั้นนี้') · mgr.in step2 400 `APPROVAL_STEP_OUT_OF_ORDER` (requestedStep 2, currentStep 1) · updated_at 4 แถวเดิม · audit 0
**สถานะ**: ✅

### R6.04 race ขั้น 1
![](../shots/R6v3/R6.04-stale-tab-error.png)
**ทำ**: `uat.mgr.in` 2 browser ยิง approve C1 ค่าน้ำมันพร้อมกัน แล้วดับเบิลคลิก 'อนุมัติขั้น 1' ในแท็บที่ค้าง
**ผลบนจอ**: แท็บค้าง → 1 request 400 · toast แดง 'อนุมัติข้ามขั้น / รายการนี้ยังไม่ถึงขั้นอนุมัติของคุณ — ต้องผ่านขั้นก่อนหน้าให้ครบก่อน' (ข้อความผิดทิศ — 🐞 R6av3-B01)
**ผลหลังบ้าน**: 200 `pending_finance_approval` + 400 `EXPENSE_INVALID_STATUS` · C1 fuel cur 2/2 mx 'ยอดไม่เกิน 5,000 บาท' m=t h=1 · audit approve 1 (step_role ผู้จัดการทีมติดตามทรัพย์, tot 2, revenue_ids_created []) · แจ้งเตือน 0
**สถานะ**: ✅ + 🐞 R6av3-B01

### R6.05–R6.07 ผู้จัดการทีมอนุมัติขั้น 1
![](../shots/R6v3/R6.06-mgr-in-all-step2.png)
**ทำ**: mgr.in 'อนุมัติขั้น 1' C1 เบี้ยเลี้ยง/คอมมิชชั่น · C2 ×3 · C3 ×3 · C4 ×3 → แถวค่าที่พัก · mgr.out C5 คอมมิชชั่น → ค่าน้ำมัน
**ผลบนจอ**: toast 'อนุมัติแล้ว' ทุกแถว · reload แล้วปุ่ม 'อนุมัติขั้น'/'ตีกลับ' เหลือ 0 · ป้าย 'รอการเงินอนุมัติ ขั้น 2/2: รอ การเงิน' (C5 fuel 'ขั้น 2/3')
![](../shots/R6v3/R6.07-mgr-out-after-step1.png)
**ผลหลังบ้าน**: 15 แถว `pending_finance_approval` cur 2 · C5 fuel tot 3 mx 'ยอดเกิน 5,000 บาท' · hotel manager = uat.mgr.in h 3 · audit approve 15 (role ผู้จัดการทีมติดตามทรัพย์) · แจ้งเตือน 0
**สถานะ**: ✅

### R6.08 SoD
พึ่ง unit test (มติ O2) · ตรวจทางอ้อม: hotel เคยถูก Superadmin อนุมัติขั้น 1 ก่อนตีกลับ แต่ผู้จัดการอนุมัติขั้น 1 รอบใหม่ได้ ⇒ SoD นับเฉพาะรอบปัจจุบัน · **สถานะ**: ✅

### R6.09 การเงินตีกลับรายการ
**เมนู**: การเงิน → 'ค่าตอบแทน' → แถว UAT-CO2-003 เบี้ยเลี้ยง → 'ตีกลับ'
![](../shots/R6v3/R6.09-reject-modal-empty.png)
**ทำ**: เปิด modal ช่องว่าง (ปุ่ม 'ตีกลับรายการ' disabled) · API reason '' → 400 `REJECT_REASON_REQUIRED` 'การตีกลับรายการเบิกต้องระบุเหตุผลให้ผู้เบิกเสมอ' · กรอก 'UAT R6 ตีกลับทดสอบ — ขอชี้แจงจำนวนวันเบี้ยเลี้ยง' → 'ตีกลับรายการ'
**ผลบนจอ**: toast 'ตีกลับให้แก้ไขแล้ว / รายการกลับไปเริ่มที่ขั้น 1 ใหม่ทั้งหมด' · ป้าย 'ถูกตีกลับ — รอแก้ไข ↩ ถูกตีกลับ — กลับไปขั้น 1'
![](../shots/R6v3/R6.09-after-reject.png)
**ผลหลังบ้าน**: `needs_revision` cur 1 tot 2 manager_approved_by NULL h 2 · audit reject reason, rejected_at_step 2, approval_step_current 1 · แจ้ง in2 'รายการเบิกถูกตีกลับ' → `/field/income` · เคส C3 `closed_fail` หลักฐาน `pending` ไม่เปลี่ยน
**สถานะ**: ✅ (⚠️1 จำนวนแถว)

### R6.10 พนักงานแก้ไขและส่งใหม่ (มือถือ)
**เมนู**: แอปภาคสนาม → 'รายการเบิก' (`/field/expenses`) → บล็อก 'ถูกตีกลับ ต้องแก้ไขแล้วส่งใหม่ (1)'
![](../shots/R6v3/R6.10-in2-resubmit-modal.png)
**ทำ**: 'แก้ไขและส่งใหม่' → modal แสดงเหตุผล + 'รายการนี้ระบบคำนวณยอดให้จากแผนค่าตอบแทน — แก้ยอดเองไม่ได้' (ช่องเดียวคือ textarea) → 'ลงพื้นที่ 1 วัน ตามเช็คอิน 04/10/2569 (2 เคส)' → 'ส่งกลับเข้าคิวอนุมัติ' → mgr.in 'อนุมัติขั้น 1' ใหม่
**ผลบนจอ**: toast 'ส่งรายการเบิกกลับเข้าคิวอนุมัติแล้ว' · กระดิ่ง in2 มี 'รายการเบิกถูกตีกลับ' 02:07
**ผลหลังบ้าน**: `pending_approval` cur 1 gross 7500 revision_note ตามที่กรอก · audit status_change (in2, ['expense.resubmitted']) · หลังผู้จัดการ → `pending_finance_approval` cur 2 h 3
**สถานะ**: ✅

### R6.11–R6.13 การเงินอนุมัติขั้น 2 + จังหวะเกิดรายได้
![](../shots/R6v3/R6.11-c1-third-approved.png)
**ทำ**: 'อนุมัติขั้น 2' C1 ค่าน้ำมัน → เบี้ยเลี้ยง → คอมมิชชั่น (ตรวจ revenues หลังทุกใบ) · C2 ×3 · ค่าที่พัก · C5 คอมมิชชั่น → ค่าน้ำมัน · probe การเงิน step 3
**ผลหลังบ้าน**: revenues 0 → 0 → **1** (C1 ใบที่ 3) → 1 → 1 → **2** (C2 ใบที่ 3) → 2 (hotel) → 2 (C5 commission) → 2 (C5 fuel ขึ้น 3/3) · probe step 3 → 403 · แจ้งเตือน expense.approved in1 7 + out1 1
```
UAT-CO1-001 | 92500  | 6475 | 98975  | 7.00 | SUCCESS_FEE | exclude_vat | ready_for_billing | 2026-10-04 | uat.finance | round 1
UAT-CO1-002 | 124500 | 8715 | 133215 | 7.00 | SUCCESS_FEE | exclude_vat | ready_for_billing | 2026-10-04 | uat.finance | round 1
```
![](../shots/R6v3/R6.13-finance-after-step2.png)
**สถานะ**: ✅

### R6.14 บริหารอนุมัติขั้น 3
![](../shots/R6v3/R6.14-exec-queue.png)
**ทำ**: `uat.exec` 'ค่าตอบแทน' → แถว UAT-CO2-005 ค่าน้ำมัน ฿5,500.00 'ขั้น 3/3: รอ บริหาร' (ปุ่มเดียวในจอ) → 'อนุมัติขั้น 3'
**ผลหลังบ้าน**: approved · executive_approved_by = uat.exec · revenue C5 `700000 / 49000 / 749000` FLAT include_vat 2026-10-04 created_by uat.exec · แจ้ง out1 ×2
**สถานะ**: ✅

### R6.15 ตรวจรายได้ต่อเคส
`UAT-CO1-001 3/0/1 · UAT-CO1-002 3/0/1 · UAT-CO1-004 0/3/0 · UAT-CO2-003 0/3/0 · UAT-CO2-005 2/0/1` · approved 9 / 845000 · pfa 6 / 105000 · หลักฐาน C3 pending 1 — ตรง golden · ![](../shots/R6v3/R6.15-exec-revenue-tab.png) · **สถานะ**: ✅

### R6.16–R6.19 เงินทดรอง
**เมนู**: การเงิน → แท็บ 'รออนุมัติ' → ตาราง 'เงินทดรองจ่าย (Advances)'
![](../shots/R6v3/R6.16-adv1-approve-modal.png)
**ทำ/ผล**:
- ADV1 'อนุมัติ' → modal 'อนุมัติคำขอเงินทดรองจ่าย' (ข้อความเตือนตรง) เว้นยอดว่าง → ดับเบิลคลิก 'อนุมัติและปล่อยเงิน' → 1 request · toast 'อนุมัติเงินทดรองแล้ว / อนันต์ ตามทรัพย์ — รอเคลียร์ยอดภายใน 11/10/2569'
- ADV2 'อนุมัติ' → toast แดง 'มีเงินทดรองค้างอยู่' (400 `ADVANCE_PENDING_SETTLEMENT`) ยัง pending · audit 0 → 'ปฏิเสธ' ช่องว่าง 'ยืนยันปฏิเสธ' disabled · API → 400 `REJECTION_REASON_REQUIRED` → เหตุผล 'มีเงินทดรอง ADV1 ค้างเคลียร์ ขอซ้อนไม่ได้' → toast 'ปฏิเสธคำขอแล้ว'
![](../shots/R6v3/R6.17-adv2-reject-modal.png)
- in1 มือถือ `/field/advances`: กล่องเตือน 'คุณมีเงินทดรองที่ยังไม่เคลียร์ยอด…' + ADV2 'ไม่อนุมัติ' พร้อมเหตุผล · 'ขอเงินทดรอง' ฿500 'UAT R6 ลองขอซ้อน' 11/10 → 400 'ยังมีเงินทดรองที่ไม่ได้เคลียร์ยอด' · advances = 4
![](../shots/R6v3/R6.18-in1-request-blocked.png)
- ADV4 อนุมัติ → toast 'ประเสริฐ รับเหมา — รอเคลียร์ยอดภายใน 11/10/2569' · แท็บ 'เงินทดรองจ่าย' KPI 'ยอดเงินทดรองที่ยังอยู่กับผู้เบิก' **฿4,000.00** · รอเคลียร์ 2 · overdue 0
![](../shots/R6v3/R6.19-advance-tab-kpi.png)
**ผลหลังบ้าน**: approved(300000, finance) · rejected(เหตุผล) · pending_approval (ADV3 ไม่แตะ) · approved(100000) · audit advances approve 2 / reject 1 · ไม่มีแจ้งเตือน
**สถานะ**: ✅

### R6.20 ตรวจปลาย R6a
| ตัวชี้วัด | ผล | golden |
|---|---|---|
| revenues / gross / total | 3 / 917000 / 981190 | ✅ 3 / 917000 / 981190 |
| expense approved / ยอด | 9 / 845000 | ✅ |
| pending_finance_approval | 6 / 105000 (C3×3, C4×3) | ✅ |
| pending_approval + needs_revision | 0 | ✅ |
| superseded | 1 / 50000 | ✅ |
| payee verified | 0 | ✅ |
| advances | approved,rejected,pending_approval,approved | ✅ |
| payout_batches | 0 | ✅ |
| แจ้งเตือน หลัง T0 | expense.approved 9 (in1 7, out1 2) · expense.rejected 1 (in2) | ✅ |
| audit หลัง T0 | expenses approve **26** · reject 1 · status_change 1 · advances approve 2 · reject 1 · probe 0 | ✅ |
| revenue ซ้ำ (case, round) | 0 | ✅ |
| case_evidences | approved 4 · rejected 1 (C4 v1) · pending 1 (C3) | ✅ |

ยอด approved ต่อพนักงาน: in1 195000 · out1 650000 · in2 0 (รอขั้น 2 105000)

---

## 🐞 บั๊กที่พบ
| # | Severity | เรื่อง | ทำซ้ำ / หลักฐาน |
|---|---|---|---|
| **R6av3-B01** | S4 (UX ข้อความ) | ผู้อนุมัติกดปุ่มจากหน้าที่ค้าง หลังรายการ**ผ่านขั้นนั้นไปแล้ว** ได้ toast 'อนุมัติข้ามขั้น — รายการนี้ยังไม่ถึงขั้นอนุมัติของคุณ — ต้องผ่านขั้นก่อนหน้าให้ครบก่อน' ซึ่งผิดทิศ (จริงคือมีคนอนุมัติไปแล้ว) | R6.04 · API ตอบ `APPROVAL_STEP_OUT_OF_ORDER` requestedStep 1 < currentStep 2 · ควรแยกข้อความกรณี requestedStep < currentStep เช่น 'รายการนี้ผ่านขั้นนี้ไปแล้ว — รีเฟรชหน้า' · ไม่กระทบข้อมูล (ไม่มี mutation) · ภาพ `R6.04-stale-tab-error.png` |

ที่รู้แล้ว เห็นซ้ำ ไม่เปิดใหม่: BUG-095 (ฐานคิดแถวรายวัน) · BUG-096 (ลิงก์ `/finance/approvals`) · BUG-099 (ลิงก์ `/field/income`) · BUG-103 (เลขล็อต 003/004) · R6-N1 (ไม่มีแจ้งเตือนเข้าคิวผู้อนุมัติ — ยืนยันแล้ว: ค่าที่พัก/แถวรายวัน/ล็อตปลดล็อก/ถึงขั้น 3)

## ❓ ต้องตัดสินใจ
ไม่มีข้อใหม่ · ข้อเดิมที่รอ: ❓-R6-5 / O5 (แจ้งเตือนคิวอนุมัติ) · A5 (ภาษีประมาณในคิวแสดง 0 สำหรับ in1/in2 — ยังเป็นเช่นนั้น)

## ไฟล์ / Storage
- ไม่มีไฟล์อัปโหลดและไม่มีไฟล์ Storage ขยะในรอบนี้ (R6a ไม่มีขั้นแนบไฟล์)
- `counts.sh` ปลายรอบ: audit_logs 299 · notifications 45 · expenses 16 · revenues 3 · advances 4 · payout_batches 0 · billing 0 · case_evidences 6 · handover_lots 2 · assets 4
