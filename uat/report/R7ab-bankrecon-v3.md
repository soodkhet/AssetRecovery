# R7a + R7b v3 — กระทบยอดธนาคาร / ใบกำกับภาษี / 50 ทวิ + เงินทดรองเกินกำหนด (uat.account · uat.finance · admin · uat.agent.in2 · uat.mgr.in · uat.exec)

> วันที่ทดสอบ: 04/10/2569 11:40–11:52 น. · snapshot ต้นรอบ: `R6-end-v3-fixed` · ปลาย R7a: `R7a-end-v3` (orchestrator snapshot) · ปลาย R7b: `R7b-end-v3` · step sheet `uat/steps/R7.md` v1 ขั้น R7.01–R7.25 (ไม่ได้ทำ R7c)
> T0 = `2026-10-04 04:43:16+00` · T1 (R7b) = `2026-10-04 04:48:16+00` · สคริปต์ `uat/bin/r7v3/` · log `uat/bin/r7v3/run.log` · ภาพ `uat/shots/R7v3/` (32 ภาพ) · PDF ใบกำกับ `uat/fixtures/downloads-R7v3/` (2 ไฟล์)
> **ผล: ✅ 25 ขั้นตรง golden ทุกขั้น / 🐞 บั๊กใหม่ 4 ตัว (S4 ×1, S5 ×3) / ⚠️ ข้อสังเกตที่รู้แล้ว 4 / ❓ 2**

---

## 0. ก่อนเริ่ม
ค่าต้นรอบตรงทุกตัว (rev 4 · IN-1 file_generated 489150 · wht 8/22650 · บิล sent ×2 · adv cleared,rejected,approved,cleared · exp 16/980000 · er 11 · bff passed · ti/bt/cr/exc/exp_rec 0 · งวด collecting) · `/login` 200 · พบ `asOf` ใน `app/api/dev/trigger-job/route.ts` (fixer K อยู่ในโค้ดแล้ว)

# R7a — นำเข้า statement + กระทบยอด + ใบกำกับภาษี

### R7.01 สร้างสำเนา statement
**ทำ**: แทน `{{R7_DATE}}` = 2026-10-04 → `uat/fixtures/bank-R7-filled.csv` · ต้นฉบับ `bank-R7.csv` ไม่เปลี่ยน (git diff ว่าง)
**ผล**: 4 แถว · แถว 3 เงินออก 4891.50 · **สถานะ**: ✅

### R7.02 การเงินอ่านได้ แต่นำเข้าไม่ได้
**เมนู**: `uat.finance` → `/accounting?tab=bank`
![](../shots/R7v3/02-finance-bank-tab.png)
**ผลบนจอ**: ถูกส่งกลับไปแดชบอร์ด (การเงินไม่มีเมนูบัญชี — ตรงสิทธิ์เห็นเมนู ไม่ใช่บั๊ก) · ไม่มีปุ่ม Import Statement
**ผลหลังบ้าน**: `GET /api/bank-reconciliation/transactions` 200 (0 แถว) · `POST /import` **403 PERMISSION_DENIED** · bank_transactions 0 · audit 0 · **สถานะ**: ✅ (ดู 🐞 R7v3-B03 ข้อความ "DEC-002" บนแดชบอร์ด)

### R7.03 นำเข้า Bank Statement (บัญชี)
**เมนู**: `uat.account` → บัญชี → แท็บ **กระทบยอด** → **Import Statement**
![](../shots/R7v3/03a-bank-tab-empty.png)
![](../shots/R7v3/03b-import-modal.png)
**ทำ**: เลือกบัญชี "กสิกรไทย — … (xxxxxx1112)" → เลือกไฟล์ `bank-R7-filled.csv` → ดับเบิลคลิก **อัปโหลดและประมวลผล**
![](../shots/R7v3/03c-import-toast.png)
**ผลบนจอ**: toast "นำเข้า statement แล้ว — บันทึกใหม่ 4 รายการ · จับคู่อัตโนมัติ 3 · ซ้ำ 0 · อ่านไม่ออก 0" (ดับเบิลคลิกส่งคำขอเดียว) · การ์ด รายการทั้งหมด 4 / **ยังไม่จับคู่ 1** / เงินเข้ารวม ฿11,492.65 / เงินออกรวม ฿4,891.50 · แถบเตือน "มี 1 รายการยังไม่ได้จับคู่ — ต้องจัดการให้ครบ 100% ก่อนส่งงวด"
![](../shots/R7v3/03d-bank-after-import.png)
**ผลหลังบ้าน**: 201 `usedConfiguredMapping:false` periods [ตุลาคม 2569] · −489150 auto_matched (payout) · 12345 unmatched · 387920 auto_matched (billing) · 749000 auto_matched (billing) · **สถานะ**: ✅

### R7.04 รอบจ่าย IN-1 ปิดเป็น "จ่ายสำเร็จ" + บันทึกค่าใช้จ่าย + 50 ทวิ
**เมนู**: `uat.finance` → การเงิน → รอบจ่ายเงิน
![](../shots/R7v3/04a-finance-payout-in1-completed.png)
**ผลบนจอ**: UAT IN-1 ฿4,950.00 / ฿58.50 / ฿4,891.50 ป้าย **จ่ายสำเร็จ** · ไม่มีปุ่ม "ยืนยันจ่ายแล้ว"
**ผลหลังบ้าน**: payout `completed` · audit `confirm` `confirmed_source=bank_reconciliation` reason "จับคู่กับรายการเดินบัญชี 403bd1ae-… สำเร็จ" · expense_records **19 / 1580000 / 28500 / 1551500** · 50 ทวิ ใหม่ 7 ใบ WHT-2569-009…015 (gross 195000 / wht 5850 / PND3 / payment_date 2026-10-04) · active **15 / 28500** · exceptions 0 · แจ้งเตือน `payout_batch.completed` → uat.finance "รอบจ่ายโอนเงินสำเร็จ" link `/finance?tab=payout` (รวม 4) · **สถานะ**: ✅

### R7.05 ภ.ง.ด.3 ไม่นับแถวเงินทดรอง (W1)
**เมนู**: `uat.account` → บัญชี → **เอกสาร & WHT**
![](../shots/R7v3/05a-account-wht-tab.png)
**ผลบนจอ**: ใบที่ใช้งานอยู่ 15 · ภ.ง.ด.3 ฿285.00 · ภ.ง.ด.53 ฿0.00 · ใบที่ยกเลิก 0 · สรุปรอบนำส่ง ตุลาคม 2569 กำหนด 15/11/2569 ฿285.00 / ฿0.00 "รอยื่นแบบ" · แถบ "เหลือ 42 วัน ก่อนกำหนดนำส่ง"
**ผลหลังบ้าน**: wht_filing_summaries 28500 / 0 / pending · แถวเงินทดรองใน payout_batch_items 3 / wht 0 / มี tax_profile 3 · ใบ 50 ทวิ ที่ผูกแถวเงินทดรอง 0 · **สถานะ**: ✅ (W1 ปิดได้)

### R7.06 รับเงิน CO1 (ลูกค้าหัก 3%) + CO2 → รับชำระครบ · AR 0
**เมนู**: `uat.finance` → รายได้และวางบิล · `uat.account` → เงินรับ
![](../shots/R7v3/06a-finance-revenue-paid.png)
![](../shots/R7v3/06b-account-receipts.png)
**ผลบนจอ**: ยอดค้างรับ (AR) ฿0.00 · UATC ฿7,490.00 รับ ฿7,490.00 คงค้าง ฿0.00 **รับชำระครบ** · UATL ฿3,991.10 รับ ฿3,879.20 + "WHT ลูกค้าหัก ฿111.90" คงค้าง ฿0.00 **รับชำระครบ** · แท็บเงินรับ: รวม ฿11,369.20 · ลูกค้าหัก ฿111.90 ("เครดิตภาษีของบริษัท — ต้องมีหนังสือรับรองจากลูกค้า") · 2 แถว จับคู่อัตโนมัติ · ไม่มี markdown ดิบ (BUG-108 ✅)
**ผลหลังบ้าน**: UATC paid 749000/749000/0/AR 0 · UATL paid 399110/387920/11190/AR 0 · cash_receipts 387920/11190 + 749000/0 วันที่ 2026-10-04 ผูก bank tx · audit cash_receipts create 2 + billing_batches update 2 (source bank_reconciliation) · `GET /api/ar-aging` ค้าง 0 ทุกช่วง · **สถานะ**: ✅ · ⚠️ spec-gap R7-N1 ยืนยัน (ไม่มีช่องอ้างเลข/ไฟล์ 50 ทวิ จากลูกค้า แม้หน้าจอบอกว่า "ต้องมีหนังสือรับรอง")

### R7.07 แถว ฿123.45 ค้าง "ยังไม่จับคู่"
![](../shots/R7v3/07a-bank-filter-unmatched.png)
![](../shots/R7v3/07b-manual-match-modal.png)
![](../shots/R7v3/07c-match-detail-modal.png)
**ผลบนจอ**: ตัวกรองยังไม่จับคู่ → 1 แถว "รับโอนไม่ทราบที่มา · อ้างอิง UNKNOWN-01" +฿123.45 ปุ่ม จับคู่ Manual / ปิดรายการ · modal จับคู่ Manual: รายการให้เลือกว่าง (มีแค่ "— เลือกรายการ —" — บิล UATL/UATC ที่ชำระแล้วไม่อยู่) → ยกเลิก · "ดูการจับคู่" IN-1 → modal "รายละเอียดการจับคู่ — 04/10/2569" ปุ่ม ปิดหน้าต่าง
**สถานะ**: ✅ (ไม่ได้ปิด/จับคู่ — ค้างไว้ให้ R7c)

### R7.08 นำเข้าไฟล์เดิมซ้ำ
![](../shots/R7v3/08-reimport-duplicates.png)
**ผล**: 201 toast "บันทึกใหม่ 0 รายการ · จับคู่อัตโนมัติ 0 · ซ้ำ 4 · อ่านไม่ออก 0" · ไม่มี DUPLICATE_PAYMENT_FILE · bank_transactions 4 · cash_receipts 2 · ไม่มี audit เพิ่ม · **สถานะ**: ✅

### R7.09 probe จับคู่ทับ / ฝั่งผิด / ปิดรายการ (API ด้วย cookie บัญชี)
| probe | ผล |
|---|---|
| แถว 749000 → billing UATL ไม่ส่ง confirmRematch | **200** `data:null` warning `ALREADY_MATCHED` "รายการนี้จับคู่กับ รอบวางบิล ตุลาคม 2569 · บริษัท ยูเอที แคปปิตอล จำกัด อยู่แล้ว — ยืนยันอีกครั้ง…" ✅ |
| แถว 12345 → payout IN-1 (ฝั่งผิด) | 400 `BANK_TRANSACTION_INVALID_STATUS` ✅ (ข้อความชวนเข้าใจผิด — 🐞 B02) |
| แถว 12345 → billing UATL ยอดไม่ตรง | 404 `BILLING_BATCH_NOT_FOUND` ✅ |
| resolve แถว 12345 `matchNote:''` | 400 `REQUIRED_MISSING` fields.matchNote "ต้องระบุเหตุผลที่ปิดรายการโดยไม่จับคู่" ✅ |
| resolve แถว 749000 (จับแล้ว) | 400 `BANK_TRANSACTION_INVALID_STATUS` ✅ |
| id ไม่ใช่ UUID ใน path | **500** 🐞 B01 |
**ผลหลังบ้าน**: auto_matched 3 / unmatched 1 ไม่เปลี่ยน · audit หลัง T_probe = 0 · **สถานะ**: ✅ (+ 🐞 B01/B02)

### R7.10 สิทธิ์
`uat.finance` PATCH match / resolve-unmatched → 403 ✅ · `uat.exec` GET transactions → **403** (จดตาม matrix — บริหารไม่มีสิทธิ์ดูกระทบยอด) · `uat.agent.in1` GET → 403 ✅

### R7.11 ออกใบกำกับภาษี UATL (ดับเบิลคลิก)
**เมนู**: `uat.account` → บัญชี → **รายได้และขาย** → ตัวกรอง ยังไม่ออกใบกำกับ (2 แถว)
![](../shots/R7v3/11a-sales-awaiting.png)
![](../shots/R7v3/11b-issue-modal.png)
**ทำ**: UATL → **ออกใบกำกับภาษี** → modal "ออกใบกำกับภาษี — บริษัท ยูเอที ลิสซิ่ง จำกัด" ฿3,730.00 / ฿261.10 / ฿3,991.10 · วันที่ = วันนี้ · ดับเบิลคลิก **ยืนยันออกใบกำกับภาษี**
![](../shots/R7v3/11c-issue-toast.png)
**ผล**: toast "ออกใบกำกับภาษีเลขที่ **INV-0001** แล้ว" (ส่งคำขอเดียว — ปุ่มล็อกระหว่างบันทึก) · probe POST ซ้ำ → 400 `TAX_INVOICE_ALREADY_ISSUED` (invoiceNumber INV-0001) · `uat.finance` POST → 403 · **สถานะ**: ✅

### R7.12 ออกใบกำกับภาษี UATC
![](../shots/R7v3/12b-issue-modal.png)
![](../shots/R7v3/12d-sales-issued.png)
**ผล**: ฿7,000.00 / ฿490.00 / ฿7,490.00 → **INV-0002** (ไม่กระโดดเลข) · แท็บ ออกใบกำกับแล้ว: ปุ่ม พิมพ์ PDF / ยกเลิกใบกำกับ · DB INV-0001 2026-10-04 active 373000/26110/399110 · INV-0002 700000/49000/749000 (รวม 1073000/75110/1148110 ✓ E10 A2) · tax_invoice_seq 2 · PDF ทั้ง 2 ใบ 200 application/pdf (15–15 KB เก็บไว้ที่ downloads-R7v3) · **สถานะ**: ✅ (⚠️ หนี้ #4 เทมเพลตเอกสารภาษียังไม่มีผล = known · ไม่ได้ตรวจวันที่ในไฟล์ PDF เพราะเครื่องไม่มีตัวอ่านข้อความ PDF)

### R7.13 เช็คซ้ำ BUG-095 (คอลัมน์ฐานคิดแถวรายวัน)
![](../shots/R7v3/13-bug095-comp-approved.png)
**ผล**: `uat.mgr.in` → ค่าตอบแทน: แถวรายวันแสดง "ค่าน้ำมัน 200.00 บาท/วัน ÷ 2 เคส (04/10/2569) = 100.00" / "เบี้ยเลี้ยง 150.00 บาท/วัน ÷ 2 เคส (04/10/2569) = 75.00" และยอดเท่ากับ gross (in1/in2 8 แถว) · **✅ แก้แล้ว** (ไม่มีตัวกรอง "อนุมัติแล้ว" แบบ select/ปุ่มให้คลิก — ดูจากรายการทั้งหมด 13 แถว)

### R7.14 เช็คซ้ำ BUG-096/099 (ลิงก์แจ้งเตือน)
`payout_batch.completed` → `/finance?tab=payout` · `advance.overdue` → `/field/advances` (in2) / `/finance?tab=advances` (การเงิน) — คลิกจากกระดิ่งเปิดได้ทั้งสองฝั่ง · `lib/notifications/messages.ts` ใช้ `/finance?tab=comp` และ `/field/expenses` แล้ว · แจ้งเตือนเก่าใน DB ยังเก็บลิงก์เดิม (`expense.case_bound_created` → `/finance/approvals`) = ปกติ · `expense.approved` → `/field/income` = ข้อสังเกต fixer · **✅**

### R7.15 เช็คซ้ำ BUG-108 / audit เก่า
หน้ารายได้ (การเงิน) ไม่มี `**` · หน้า settings/roles (admin) ไม่มี `**` + คำอธิบาย `manage_jobs` ในโค้ดไม่มี markdown · audit confirm ของล็อต R5 ทั้ง 2 ไม่มี `revenueByCase` (ก่อน fix BUG-104) = ปกติ · BUG-105/110 ข้ามตามมติ (O13) · **✅**
![](../shots/R7v3/15-bug108-settings-roles.png)

### R7.16 ตรวจปลาย R7a
bt 4 / unmatched 1 · cash_receipts 2 / 1136920 · billing paid 2 · payout completed 4 · er 19 / net 1551500 · 50 ทวิ active 15 / 28500 · ใบกำกับ active 2 / seq 2 · ADV3 approved · exceptions 0
audit หลัง T0: bank_transactions import 4 / update 3 · cash_receipts create 2 · billing_batches update 2 · payout_batches confirm 1 · expense_records create 8 · wht_certificates create 7 · tax_invoices create 2 · no_reason 0 ทุกแถว · ไม่มี accounting_periods · pm2 log: 500 มีเฉพาะ probe id ไม่ใช่ UUID (B01) · **✅**

# R7b — เงินทดรองเกินกำหนด (dev trigger `asOf`)

### R7.17 สิทธิ์สั่งงาน
`uat.finance` / `uat.exec` `POST /api/dev/trigger-job` asOf 2026-10-05 → **403** ทั้งคู่ · jobs ไม่เพิ่ม · ADV3 approved · **✅**

### R7.18 ไม่ส่ง asOf (เล่น 04/10/2569)
`admin` → 200 `outcome:completed` `result {marked:0, skipped:0}` · ADV3 ยัง approved · ไม่มี audit/แจ้งเตือนของ advances · **✅**

### R7.19 asOf ผิด → 400 (ไม่มีแถว jobs ใหม่)
| body | ผล |
|---|---|
| asOf 2026-10-03 / 2026-11-05 / `05/10/2569` | 400 `REQUIRED_MISSING` fields.asOf "วันที่จำลองต้องเป็นรูปแบบ YYYY-MM-DD ตั้งแต่วันนี้ถึงอีก 31 วันข้างหน้า" ✅ |
| reassign_timeout + asOf | 400 fields.asOf "วันที่จำลองใช้ได้เฉพาะงานมาร์คเงินทดรองจ่ายที่เลยกำหนดเคลียร์" ✅ (ไม่รันงานจริง) |
| wht_filing_reminder | 400 `JOB_INVALID_STATUS` ✅ (ข้อความไม่ตรงเหตุ — 🐞 B04) |
| abc | 400 `REQUIRED_MISSING` fields.jobType ✅ (ข้อความภาษาอังกฤษดิบ — 🐞 B04) |
jobs ใหม่ระหว่าง probe = 0 · **✅**

### R7.20 asOf 2026-10-05 → ADV3 เลยกำหนด
**ผล**: 200 `duplicate:false` `outcome:completed` `marked:1` · ADV3 **overdue** (due 2026-10-04) · audit `status_change` actor NULL (system) approved→overdue `auto_marked=true` reason "[job:fdd36e46-…] **[จำลองวันที่ 05/10/2569]** เลยกำหนดเคลียร์ยอดแล้วยังไม่เคลียร์ — มาร์คเป็น overdue อัตโนมัติ" · audit jobs: create (reason มีคีย์กันซ้ำ `…:2026-10-04T04:48:asOf=2026-10-05`) + status_change "ทำงานสำเร็จ" · แจ้งเตือน `advance.overdue` "เงินทดรองเลยกำหนดเคลียร์" "ครบกำหนดเคลียร์ยอดวันที่ 04/10/2569 — ระบบมาร์คเป็นเลยกำหนดแล้ว" → **uat.agent.in2** `/field/advances` + **uat.finance** `/finance?tab=advances` (ผู้ถือ approve_advance มีคนเดียว) · **✅**

### R7.21 สั่งซ้ำ
(a) นาทีเดียวกัน → 200 `duplicate:true` `outcome:skipped` job id เดิม · (b) นาทีถัดไป → job ใหม่ `marked:0` · ไม่มี audit advances / แจ้งเตือนเพิ่ม (advance.overdue รวม 2) · **✅**

### R7.22 หน้าการเงิน: ป้ายแดง + KPI
**เมนู**: `uat.finance` → การเงิน → เงินทดรองจ่าย
![](../shots/R7v3/22a-finance-advances-overdue.png)
![](../shots/R7v3/22b-filter-overdue.png)
**ผลบนจอ**: ยอดเงินทดรองที่ยังอยู่กับผู้เบิก ฿2,000.00 · รายการที่รอเคลียร์ยอด 1 ("รวมที่เลยกำหนดแล้ว") · **เลยกำหนดเคลียร์ (Overdue) 1** การ์ดขอบแดง hint "ระบบเปลี่ยนสถานะให้อัตโนมัติทุกวัน" · แถว 1959AF6D พื้นแดงอ่อน ป้าย **เลยกำหนดเคลียร์** กำหนด 04/10/2569 ปุ่ม เคลียร์ยอด · ตัวกรอง เลยกำหนด → 1 แถว
แท็บ รออนุมัติ: การ์ด "เลยกำหนดเคลียร์ (Overdue) 1 — ต้องตามเคลียร์ก่อนอนุมัติรอบใหม่" + แถบแดง "มี 1 รายการเลยกำหนดเคลียร์ยอดแล้ว — ต้องตามเคลียร์ก่อน ผู้ขอจะเบิกรอบใหม่ไม่ได้"
![](../shots/R7v3/22c-approvals-overdue-banner.png)
กระดิ่ง → "เงินทดรองเลยกำหนดเคลียร์" → เปิด `/finance?tab=advances` ✅
![](../shots/R7v3/22d-bell-advance-overdue.png)
**สถานะ**: ✅

### R7.23 in2 (มือถือ): เห็นเลยกำหนด + ขอเบิกใหม่ถูกบล็อก
![](../shots/R7v3/23a-in2-bell.png)
![](../shots/R7v3/23b-in2-advances-overdue.png)
**ผลบนจอ**: กระดิ่ง → `/field/advances` · การ์ด ฿2,000.00 ขอบแดง ป้าย เลยกำหนดเคลียร์ · กำหนดเคลียร์ยอด 04/10/2569 · แถบเหลือง "คุณมีเงินทดรองที่ยังไม่เคลียร์ยอด…"
**ทำ**: ขอเงินทดรอง ฿500 "UAT R7 ลองเบิกระหว่างเลยกำหนด" → ส่งคำขออนุมัติ
![](../shots/R7v3/23c-in2-request-blocked.png)
**ผล**: 400 `ADVANCE_PENDING_SETTLEMENT` (status overdue) · ใน modal: "ยังมีเงินทดรองที่ไม่ได้เคลียร์ยอด — คุณมีเงินทดรองที่อนุมัติแล้วหรือเลยกำหนดเคลียร์ค้างอยู่ — เคลียร์ยอดรายการเดิมให้เสร็จก่อน จึงขอเบิกรอบใหม่ได้" + toast เดียวกัน · advances ยัง 4 · ไม่มี audit · **✅**

### R7.24 เช็คซ้ำ BUG-107 — modal เคลียร์ (ยกเลิก ไม่เคลียร์จริง)
![](../shots/R7v3/24-bug107-settle-abc.png)
![](../shots/R7v3/24-bug107-settle-1500.png)
**ผล**: แถว overdue มีปุ่ม เคลียร์ยอด · modal "เคลียร์เงินทดรองจ่าย (Settle Advance)" ยอดที่ยืม ฿2,000.00 · `abc` → "ยอดที่ใช้จริงต้องเป็นตัวเลข" ปุ่มบันทึก disabled · **หน้าไม่ล่ม** · `-1` → "ต้องไม่ติดลบ" · `12.345` → "ทศนิยมได้ไม่เกิน 2 ตำแหน่ง" · `1500` → ใช้จริง ฿1,500.00 ยอดต้องคืน ฿500.00 → **ยกเลิก** · ไม่มีคำขอ mutation · ADV3 ยัง overdue · **BUG-107 ✅ แก้แล้ว**

### R7.25 ตรวจปลาย R7b
advances cleared 2 / overdue 1 / rejected 1 · `advance.overdue` 2 แถว · audit ช่วง R7.22–24 = 0 · F5 `GET /api/reports/advance-overdue` 200 **0 แถว** (⚠️ O15 ข้อจำกัดที่รู้) · `/api/reports/finance/advance-overdue` 404 (R7-N3 ยืนยัน) · **✅**

---

## ตารางปลายรอบ (หลัง R7.25)
| หัวข้อ | ค่า | golden |
|---|---|---|
| bank_transactions | 4: −489150 auto (IN-1) · 387920 auto (UATL) · 749000 auto (UATC) · 12345 **unmatched** | ✓ |
| payout | IN-1 completed 489150 · IN-2 completed 301850 · OUT-1 completed 730500 · OUT-2 completed 30000 | ✓ |
| billing / AR | UATL paid 399110 (รับ 387920 + ลูกค้าหัก 11190) · UATC paid 749000 · AR 0 · cash_receipts 2 / 1136920 | ✓ |
| ใบกำกับภาษี | INV-0001 (UATL 399110) · INV-0002 (UATC 749000) · seq 2 | ✓ |
| 50 ทวิ | active 15 / 28500 (ใหม่ 009–015 = 7 / 5850) · ยกเลิก 0 | ✓ |
| ภ.ง.ด.3 / 53 | 28500 / 0 · pending · ไม่นับเงินทดรอง | ✓ |
| advances | ADV1 cleared · ADV2 rejected · **ADV3 overdue** · ADV4 cleared | ✓ |
| expense_records | 19 / 1580000 / 28500 / 1551500 | ✓ |
| อื่น ๆ | exceptions 0 · export_records 0 · งวด ต.ค. collecting · jobs +3 | ✓ |

`counts.sh` (ย่อ): audit_logs 391 · bank_transactions 4 · cash_receipts 2 · expense_records 19 · jobs 8 · notifications 58 · payout_batch_items 19 · tax_invoices 2 · wht_certificates 15 · wht_filing_summaries 1 · advances 4

## 🐞 บั๊กที่พบ
| # | ขั้น | S | ประเภท | อาการ | ข้อเสนอ |
|---|---|---|---|---|---|
| R7v3-B01 | R7.09 | S4 | code | `PATCH /api/bank-reconciliation/transactions/<id>/match` และ `/resolve-unmatched` เมื่อ id ไม่ใช่ UUID → **500** (Prisma "invalid input syntax for type uuid") แทน 400/404 · ไม่มีข้อมูลเสีย | ตรวจรูปแบบ id ใน route ก่อน query (หรือ map เป็น 404 ไม่พบรายการ) · ไล่ route `[id]` อื่นด้วย |
| R7v3-B02 | R7.09 | S5 | code | ข้อความ `BANK_TRANSACTION_INVALID_STATUS` เป็นข้อความเดียว "…รายการที่ปิดไปแล้ว (ไม่ต้องจับคู่) แก้ไม่ได้อีก" แม้เหตุจริงคือ "เงินเข้าจับกับรอบจ่าย (ฝั่งผิด)" หรือ "ปิดแถวที่จับคู่แล้ว" → ผู้ใช้เข้าใจผิด | แยกข้อความตามเหตุ |
| R7v3-B03 | R7.02 | S5 | code | แดชบอร์ด (placeholder) แสดง "(DEC-002)" ให้ผู้ใช้เห็น — ขัด Rule 05 (ห้ามมีเลขอ้างอิงสเปคในข้อความที่ผู้ใช้เห็น) | ย้ายไปไว้ใน comment |
| R7v3-B04 | R7.19 | S5 | code | dev trigger: `wht_filing_reminder` ได้ `JOB_INVALID_STATUS` "สั่งทำงานใหม่ได้เฉพาะงานที่ล้มเหลวหรือถูกยกเลิกแล้วเท่านั้น" (ไม่ตรงเหตุ — งานนี้สั่งเองไม่ได้) · jobType ไม่รู้จัก → fields.jobType เป็นข้อความ Zod ภาษาอังกฤษดิบ "Invalid option: expected one of …" · endpoint ใช้เฉพาะ dev | ข้อความไทยเฉพาะเหตุ |

ข้อสังเกตเล็ก (ไม่เปิดบั๊ก): แถวจับคู่อัตโนมัติแสดง "โดย: ปรีดา บัญชีงาม" (คือผู้นำเข้า ไม่ใช่ผู้จับคู่) · แท็บรายได้แสดงรหัส `(EDIT_BILLED_REVENUE)` ในคำอธิบาย · `POST /api/accounting/tax-invoices` ตอบ 200 (ไม่ใช่ 201) · คอลัมน์ "จับคู่กับ" ใช้ font-mono กับข้อความไทย

## ⚠️ ข้อสังเกตที่รู้แล้ว
- R7-N1 (S4 spec-gap) ยืนยัน: เงินรับไม่มีช่องอ้างเลข/ไฟล์ 50 ทวิ ที่ลูกค้าออกให้ (เครดิตภาษี ฿111.90)
- R7-N3 (S5) ยืนยัน: `/api/reports/finance/advance-overdue` 404
- R7-N4 / O15: F5 วันนี้ 0 แถว ทั้งที่ ADV3 overdue — ตรวจใหม่ตั้งแต่ 05/10/2569
- หนี้ #4 เทมเพลตเอกสารภาษีใน settings ไม่มีผลกับ PDF

## เช็คซ้ำบั๊กที่แก้
BUG-095 ✅ · BUG-096/099 ✅ · BUG-104 ✅ (audit เก่าไม่มี revenueByCase = ปกติ) · BUG-107 ✅ · BUG-108 ✅ · BUG-105/110 ข้าม (มติ O13)

## ❓ ต้องตัดสินใจ
- **❓-R7ab-1** บริหาร (`uat.exec`) ดูรายการกระทบยอดไม่ได้ (403) — ถ้าต้องการให้บริหารดูได้แบบอ่านอย่างเดียว ต้องแก้ matrix · **ก (แนะนำ)** คงเดิมตาม matrix ปัจจุบัน | ข ให้สิทธิ์ view
- **❓-R7ab-2** R7v3-B01 (500 เมื่อ id ผิดรูป) แก้ก่อนเริ่ม R7c ไหม · **ก (แนะนำ)** แก้รวมกับ fixer รอบถัดไป ไม่บล็อก R7c (กดจากหน้าจอไม่เจอ) | ข แก้ก่อน
