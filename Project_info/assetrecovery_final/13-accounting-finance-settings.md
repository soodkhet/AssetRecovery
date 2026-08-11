# 13-accounting-finance-settings.md

# 13 — Accounting & Finance Settings (ตั้งค่าระบบบัญชี/การเงิน)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ไขจำนวน sub-section)
> Document Level: Settings Module
> เอกสารอ้างอิง: `10-finance-companies.md`, `02-database-schema-design.md` §5 (tax_profiles, vat_rate_history, bank_accounts, cost_centers table), `17-payroll-and-payout.md`, `19-revenue-billing-receivable.md`, `20-adjustment.md`, `28-finance-export-pdf-spec.md`, `31-accounting-sales-and-receipts.md`, `33-accounting-wht-data.md`, `35-bank-reconciliation.md`, `37-accounting-pack-export-history.md`
> **หมายเหตุสำคัญ**: 🔶 ดูหมายเหตุเรื่องการตรวจทานโดยนักบัญชีในไฟล์ 10 — ใช้กับไฟล์นี้เช่นกัน โดยเฉพาะ §6.4 (Tax Profile) และ §6.5 (VAT Rate) ที่กระทบยอดภาษีจริง

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — 13 sub-section ครบ (§6.1-6.13) |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + **แก้ไข §3**: เดิมเขียนว่า "ทั้ง 10 sub-section" แต่เนื้อหาจริงมี **13 sub-section** (§6.1 ถึง §6.13) ตรงกับที่ระบุใน `README.md` ("ตั้งค่าบัญชี/การเงิน 13 sub-tabs") — แก้ไขให้ตรงกันแล้ว + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |
| v3 | 04/07/2569 | **Batch 6 — Product Owner อนุมัติ DEC-006 (D1=B, D2=A)**: (1) ย้ายค่านโยบายการเงินระดับองค์กร 3 ตัว (`advance_max_amount_per_request`, `require_payee_id_document`, `ar_aging_buckets`) ออกจากตาราง §6.2 Approval Matrix ไปเป็น **§6.2.1 Finance Policy Settings** (1 record/org) — เดิมฝังใน matrix ทำให้ค่า duplicate ต่อแถว (2) ทุก entity ในไฟล์นี้มีตารางรองรับใน `02-database-schema-design.md` v3.5 ครบแล้ว (`billing_payout_cycles`, `approval_matrices`, `finance_policy_settings`, `bank_file_formats`, `tax_document_template_settings`, numbering columns บน `organizations`, `functional_group` บน `capabilities`) (3) §6.3 sync กับ schema แล้ว — `is_payout_account` เดิมถูก deprecate แทนด้วย `usage` (4) หมายเหตุ: field เงินทุกตัว (เช่น `condition_threshold`) เก็บใน DB เป็น **INTEGER satang** ตาม convention — ที่เขียน decimal ในไฟล์นี้เป็นระดับ spec เท่านั้น |
| v3.1 | 05/07/2569 | **DEC-009**: §6.10 เปลี่ยนโมเดลจาก `allowed_role_ids` (เปิด/ปิด) เป็น**ระดับสิทธิ์ 3 ระดับ** (ไม่มี / `view` / `manage`) ตาม semantic ✅/👁️ ของไฟล์ 25 — storage: `role_capabilities.access_level` (02 v3.6) + กติกา Superadmin/"✅ only" |

ขอบเขตเอกสารนี้: รวมการตั้งค่าพื้นฐานทั้งหมดที่โมดูล Finance/Accounting อื่นต้องอ้างอิง — รอบบิล/รอบจ่าย, สายการอนุมัติ, บัญชีธนาคารบริษัท, Tax Profile, VAT Rate, Cost Center, รูปแบบเอกสาร, รูปแบบไฟล์โอนธนาคาร, Export format, Functional Permission Matrix, นโยบายล็อกรอบบัญชี, รูปแบบเลขที่ใบกำกับภาษี, และรูปแบบเอกสารภาษีทางการ — **13 sub-section ทั้งหมด**

**ไม่รวมอยู่ในไฟล์นี้**: ตัวเลขจริงของรายการ (claim, payout, billing) — อยู่ในไฟล์โมดูลนั้นๆ, การคำนวณภาษีเชิงสูตร (สรุปอีกรอบที่ไฟล์ 22)

---

## 1. Summary

รวมการตั้งค่าพื้นฐานทั้งหมดที่โมดูล Finance/Accounting อื่นต้องอ้างอิง — รอบบิล/รอบจ่าย, สายการอนุมัติ, บัญชีธนาคารบริษัท, Tax Profile, Cost Center, รูปแบบเอกสาร, รูปแบบไฟล์โอนธนาคาร, Export format, สิทธิ์การเข้าถึงเฉพาะโมดูลนี้, และนโยบายล็อกรอบบัญชี

## 2. Purpose

เป็น "control panel" ของแอดมินการเงิน/บัญชี ที่ตั้งค่าเงื่อนไขกลางครั้งเดียว แล้วทุกโมดูล (15-37) ดึงไปใช้

## 3. In Scope

ทั้ง **13 sub-section** ตามที่ระบุใน §6 (§6.1 ถึง §6.13)

## 4. Out of Scope

- ตัวเลขจริงของรายการ (claim, payout, billing) — อยู่ในไฟล์โมดูลนั้นๆ
- การคำนวณภาษีเชิงสูตร (สรุปอีกรอบที่ไฟล์ 22)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| Superadmin only | ตั้งค่าทุก sub-section | Global |
| บริหาร (Executive) | อนุมัติการล็อกรอบ/ปลดล็อกหลังส่งมอบบัญชีแล้ว (§6.11) | Lock/Unlock approval |
| การเงิน, บัญชี | ดู settings เพื่ออ้างอิง — แก้ไขเองไม่ได้ | Read-only |

## 6. Core Concepts & Data Entities

### 6.1 Billing/Payout Cycles (รอบบิลและรอบจ่าย)

กำหนดวันตัดรอบ (cut-off) และเงื่อนไขกำหนดชำระ/จ่าย แยกฝั่ง AR (รับ) และ AP (จ่าย)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| name | string | yes | ชื่อรอบ (เช่น "AR รอบวางบิลหลัก") |
| type | enum | yes | `AR` (รอบวางบิลรับ) / `AP` (รอบจ่ายออก) |
| cutoff_rule_type | enum | yes | `fixed_dates` (วันที่คงที่ เช่น ทุกวันที่ 15 และ 30) / `month_end` (ทุกสิ้นเดือน) / `custom_text` (free text อธิบายเอง สำหรับ rule ที่ซับซ้อนเกินจะตั้งระบบคำนวณอัตโนมัติ) |
| cutoff_dates | array of integer \| null | — | ใช้เมื่อ `cutoff_rule_type = fixed_dates` — รายการวันที่ในเดือน เช่น `[15, 30]` |
| cutoff_text | string \| null | — | ใช้เมื่อ `cutoff_rule_type = custom_text` — คำอธิบายอิสระให้แอดมินจำเอง |
| due_rule | string | yes | เงื่อนไขกำหนดชำระ/จ่าย (เช่น "Net 30 Days", "วันที่ 5 ของเดือนถัดไป") |
| scope | string | yes | ขอบเขตที่ใช้รอบนี้ (เช่น "ทุกไฟแนนซ์", "ทีม Outsource") |

### 6.2 Approval Matrix (สายการอนุมัติ)

กำหนดลำดับขั้นอนุมัติ claim/รายการเบิกตามเงื่อนไข

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| condition | string | yes | เงื่อนไขที่ trigger สายอนุมัตินี้ (เช่น "Claim ปกติไม่เกินเพดาน") |
| condition_threshold | decimal \| null | no | ถ้าเงื่อนไขอ้างอิงเพดานเงิน เก็บตัวเลขจริงไว้ที่นี่เพื่อให้ระบบเช็คอัตโนมัติได้ (ไม่ใช่แค่ free text) |
| approval_flow | array of role | yes | ลำดับ role ที่ต้องอนุมัติ (เช่น `[Manager, FinanceAdmin]` หรือ `[Manager, FinanceAdmin, Executive]`) |
| enforce_segregation_of_duties | boolean | yes | `true` = ห้ามผู้อนุมัติคนเดียวกันอนุมัติซ้ำ 2 ขั้นในรายการเดียวกัน (ต้องมีคนอื่นทำขั้นถัดไปแทน) / `false` = อนุญาตให้คนเดียวกันอนุมัติได้หลายขั้นถ้าจำเป็น — ค่าเริ่มต้นแนะนำ `false` เพื่อรองรับทีมเล็กที่มีคนจำกัด ปรับเป็น `true` ได้เมื่อทีมใหญ่ขึ้น |

> เชื่อมกับไฟล์ 16 (Compensation Approval) — เมื่อสร้างรายการเบิก ระบบเช็ค `condition_threshold` แล้วกำหนด approval_flow ที่ต้องผ่านอัตโนมัติ
> Schema: ตาราง `approval_matrices` ใน `02-database-schema-design.md` v3.5 (`condition_threshold` เก็บเป็น satang)

#### 6.2.1 Finance Policy Settings (ค่านโยบายการเงินระดับองค์กร — ย้ายมาจาก §6.2 เมื่อ 04/07/2569 DEC-006/D1)

ค่านโยบายที่มี **1 ชุดต่อองค์กร** (ไม่ผูกกับ Approval Matrix รายเงื่อนไข) — schema: ตาราง `finance_policy_settings` (PK = organization_id)

| Field | Type | Required | Description |
|---|---|---|---|
| advance_max_amount_per_request | decimal \| null | no | เพดานยอดเงินทดรองจ่ายสูงสุดต่อครั้ง (ไฟล์ 15 — validation `ADVANCE_EXCEEDS_MAX`) — `null` = ไม่จำกัดเพดาน ปล่อยให้การเงินพิจารณาเป็นรายกรณี |
| require_payee_id_document | boolean | yes | `true` = ต้องแนบเอกสารยืนยันตัวตน (สำเนาบัตรประชาชน/หนังสือรับรองบริษัท) ก่อนยืนยัน Payee ได้ (ไฟล์ 18) / `false` = ไม่บังคับ — ค่าเริ่มต้นแนะนำ `false` |
| ar_aging_buckets | array of integer | yes | ช่วงอายุหนี้สำหรับรายงาน AR Aging (ไฟล์ 19) เป็นจำนวนวัน — ค่าเริ่มต้นมาตรฐาน `[30, 60, 90]` (สร้างช่วง 0-30/31-60/61-90/90+ วันอัตโนมัติ) ปรับเป็นช่วงอื่นได้ตามนโยบายบัญชี |

### 6.3 Corporate Bank Accounts (บัญชีธนาคารบริษัท)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| bank_name | string | yes | ชื่อธนาคาร |
| account_name | string | yes | ชื่อบัญชี (นิติบุคคล) |
| account_number | string | yes | เลขบัญชี |
| usage | enum | yes | `receive` (รับเข้าอย่างเดียว) / `pay` (จ่ายออกอย่างเดียว) / `both` |
| statement_format | string | yes | รูปแบบไฟล์ statement ที่ใช้นำเข้ากระทบยอด (ดู §6.7 / ไฟล์ 35) |
| payment_file_format | string | yes | รูปแบบไฟล์โอนเงินที่ส่งให้ธนาคาร (ดู §6.7 / ไฟล์ 17) |
| auto_match_tolerance_days | integer | yes | จำนวนวันที่ยอมรับได้สำหรับ auto-matching ใน Bank Reconciliation (ไฟล์ 35) — เงินเข้าที่ช้ากว่าวันวางบิลไม่เกินจำนวนวันนี้ ยังถือว่า match ได้อัตโนมัติ — ค่าเริ่มต้นแนะนำ 7 วัน ปรับได้ตามนโยบายบัญชีจริง |

> **Schema sync 04/07/2569 (DEC-006/D2)**: ตาราง `bank_accounts` ใน `02` v3.5 มี column ทั้ง 4 นี้ครบแล้ว (`usage`, `statement_format`, `payment_file_format`, `auto_match_tolerance_days`) — column เดิม `is_payout_account` ถูก **deprecate** (ความหมายซ้ำกับ `usage`) ห้ามใช้ในโค้ดใหม่

### 6.4 Tax Profile (กติกาภาษี) 🔶 สำคัญมาก — ต้องนักบัญชียืนยันก่อนใช้จริง

กำหนดอัตรา VAT/WHT ที่ใช้กับ payee แต่ละประเภท

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| name | string | yes | ชื่อ Profile (เช่น "Outsource บุคคลธรรมดา", "Vendor นิติบุคคล") |
| vat_mode | enum | yes | `no_vat` (ไม่มี VAT) / `exclude_vat` (ราคาก่อน VAT แยกบรรทัด) / `include_vat` (ราคารวม VAT) |
| wht_rate | decimal | yes | อัตราภาษีหัก ณ ที่จ่าย (%) — มาตรฐานไทยปัจจุบัน (มิ.ย. 2569): **ค่าจ้างทำของ/ค่าบริการ (มาตรา 40(7)/40(8)) หักที่ 3%** ทั้งกรณีผู้รับเป็นบุคคลธรรมดาและนิติบุคคลไทย (อัตรานี้กลับมาเป็นมาตรฐานแล้วตั้งแต่ 1 ม.ค. 2569 หลังมาตรการลดเหลือ 1% ผ่าน e-Withholding Tax สิ้นสุดลง 31 ธ.ค. 2568) — ตัวเลขนี้ตั้งเป็นค่าเริ่มต้นได้ แต่ต้องทำเป็นฟิลด์ตั้งค่า ไม่ hardcode เพราะอัตราภาษีเปลี่ยนได้ตามประกาศกรมสรรพากร |
| wht_basis | enum | yes | `before_vat` (ฐานหักก่อน VAT) / `gross_amount` (ฐานหักจากยอดรวม) — มาตรฐานคือหักจากยอดก่อน VAT เสมอ |
| wht_min_threshold | decimal | yes | ยอดขั้นต่ำที่ต้องหัก ณ ที่จ่าย — ตามกรมสรรพากร ต้องหักเมื่อยอดจ่ายตั้งแต่ 1,000 บาทขึ้นไป (หรือต่ำกว่า 1,000 บาทแต่เป็นสัญญาต่อเนื่อง) ค่าเริ่มต้น = 1000 |
| applies_to | enum | yes | `outsource_individual` (outsource บุคคลธรรมดา) / `outsource_corporate` (outsource นิติบุคคล) — **ไม่มี `inhouse_employee`** เพราะเงินเดือนพนักงานประจำไม่อยู่ในขอบเขตของระบบนี้ (ดู §6.4.1) |

#### 6.4.1 หมายเหตุสำคัญ — เงินเดือนพนักงาน inhouse ไม่อยู่ในขอบเขตของ AssetRecovery

พนักงาน inhouse เป็นพนักงานประจำ ได้รับเงินเดือนตามมาตรา 40(1) ซึ่งกฎหมายกำหนดให้คำนวณภาษีหัก ณ ที่จ่ายแบบ**ขั้นบันได** (เทียบเงินได้พึงประเมินทั้งปี หักค่าใช้จ่าย/ค่าลดหย่อน แล้วหารเฉลี่ยเป็นรายเดือน) ไม่ใช่อัตราคงที่แบบ outsource — **ยืนยันแล้วว่าเรื่องเงินเดือน inhouse (ภ.ง.ด.1, ประกันสังคม, กองทุนสำรองเลี้ยงชีพ ฯลฯ) ไม่อยู่ในขอบเขตของระบบนี้เลย** จัดการแยกในระบบ/บริการ payroll อื่นโดยเฉพาะ (เช่น ผ่านสำนักงานบัญชีหรือโปรแกรมเงินเดือนแยก) — Tax Profile ในไฟล์นี้ใช้กับ **ค่าตอบแทนจากการทำเคส** เท่านั้น (ค่าน้ำมัน/เบี้ยเลี้ยง/คอมมิชชั่นตามไฟล์ 11) ไม่ครอบคลุมเงินเดือนประจำ

### 6.5 VAT Rate Setting (อัตราภาษีมูลค่าเพิ่ม) 🔶 สำคัญมาก — ติดตามใกล้ชิด

AssetRecovery จด VAT (ยืนยันจาก Product Owner) — ต้องตั้งค่าอัตรา VAT แบบมี **effective date versioning** ไม่ hardcode ค่าตายตัว เพราะอัตรา VAT ของไทยเป็นอัตราลดพิเศษที่ต้องต่ออายุเป็นระยะ

**สถานะ ณ วันที่เขียนสเปคนี้ (29 มิ.ย. 2569)**: อัตราปัจจุบันคือ **7%** ตามพระราชกฤษฎีกาที่ขยายเวลาถึง 30 กันยายน 2569 — อัตราตามกฎหมายจริงคือ 10% และมีความเป็นไปได้ที่จะกลับไปใช้ 10% ตั้งแต่ 1 ตุลาคม 2569 หากไม่มีการขยายเวลาลดอัตราต่อ (ต้องติดตามประกาศกรมสรรพากร/ราชกิจจานุเบกษาใกล้ช่วงนั้น)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| rate | decimal | yes | อัตรา VAT เป็น % (เช่น 7.00) |
| effective_from | date | yes | วันที่เริ่มมีผล |
| effective_to | date \| null | — | วันสิ้นสุด — `null` แปลว่ายังใช้อยู่จนกว่าจะมีรายการใหม่ |

- ระบบใช้ค่านี้คำนวณ VAT ของ Revenue ทุกรายการ (ไฟล์ 19) โดยอ้างอิงวันที่เกิดรายได้ (`revenue_date`) เทียบกับช่วง `effective_from`/`effective_to`
- ห้ามมีช่วงเวลาทับกัน (validation บังคับ)
- แก้ไข/เพิ่มอัตราใหม่ต้อง audit + reason เสมอ (กระทบยอดภาษีทั้งระบบ)

### 6.6 Cost Center

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| code | string | yes | รหัส Cost Center (เช่น "CC-001") — auto-generate running number |
| name | string | yes | ชื่อ (เช่น "ทีม A / Inhouse") |
| mapping_rule | enum | yes | `auto` (map อัตโนมัติจากทีม/หน่วยงาน) / `manual` |

### 6.7 Internal Document Templates (รูปแบบเอกสารภายใน)

รายการเอกสารมาตรฐานที่ระบบสร้างอัตโนมัติ — ไม่ใช่เอกสารราชการ (ใบกำกับภาษี/ใบเสร็จที่ต้องส่งกรมสรรพากร อยู่ในไฟล์ 28/31/33)

| Document | ใช้เมื่อ |
|---|---|
| Internal Billing Summary | สรุปยอดวางบิลภายใน ก่อนออกเอกสารทางการ |
| Payout Batch Summary | สรุปรอบจ่ายเงินก่อนโอน |
| Payment Voucher ภายใน | หลังจ่ายเงินสำเร็จ — เก็บเป็นหลักฐานภายใน |
| Compensation Statement / Payslip | สรุปค่าตอบแทนต่อพนักงาน/รอบ |
| Accounting Pack Cover Sheet | หน้าปกชุดเอกสารส่งสำนักงานบัญชีรายเดือน |

ดูรายละเอียดการสร้าง PDF จริงที่ไฟล์ 28

### 6.8 Bank File Format (รูปแบบไฟล์ธนาคาร)

| Field | Type | Required | Description |
|---|---|---|---|
| bank_name | string | yes | — |
| file_type | enum | yes | `CSV` / `TXT` (fixed-width) |
| encoding | enum | yes | `UTF-8` / `TIS-620` — 🔶 ธนาคารไทยบางแห่งยังใช้ TIS-620 สำหรับไฟล์ legacy ต้องทดสอบจริงกับธนาคารที่ใช้งานก่อน production |
| column_mapping | text | yes | รายชื่อคอลัมน์ตามลำดับที่ธนาคารกำหนด |
| test_status | enum | yes | `pending` / `passed` / `failed` — ต้อง `passed` ก่อนใช้ไฟล์นี้ตัดโอนเงินจริง |

### 6.9 Export Format (รูปแบบไฟล์ Export ส่งสำนักงานบัญชี)

รายการไฟล์มาตรฐานที่ Export Pack ต้องมี — เรียงเลขต่อเนื่องครบ 01-08 (ดูรายละเอียดเต็มที่ไฟล์ 37 §6.1)

| ไฟล์ | Format | เนื้อหา | มาจากไฟล์ |
|---|---|---|---|
| 01_Revenue.csv | CSV UTF-8 | รายการรายได้ — company, case_ref, revenue_date, gross, vat_flag | 19 |
| 02_Cash_Receipts.csv | CSV UTF-8 | รายการเงินรับ — receipt_date, payer, amount, bank_ref | 31 |
| 03_Expenses.csv | CSV UTF-8 | รายการค่าใช้จ่าย — payee, category, gross, wht, net | 32 |
| 04_Payments.csv | CSV UTF-8 | รายการจ่ายเงินจริง | 17 |
| 05_WHT_Data.csv | CSV UTF-8 | ข้อมูลหัก ณ ที่จ่าย — `payee_tax_id` เป็นตัวเลข 13 หลักล้วนไม่มีขีดคั่น (DEC-006/D10) | 33 |
| 06_Bank_Reconciliation.csv | CSV UTF-8 | ผลกระทบยอดธนาคาร — column `status` ใช้ค่า enum เต็ม 4 ค่า (`auto_matched`/`manual_matched`/`unmatched`/`unmatched_resolved`) ไม่ simplify (DEC-006/D10) | 35 |
| 07_Adjustment_Log.csv | CSV UTF-8 | รายการปรับปรุงยอดทั้งหมดของรอบนั้น | 20 |
| 08_Document_Checklist.xlsx | XLSX | source_ref, doc_status, issue | 34 |

### 6.10 Functional Permission Matrix (สิทธิ์เฉพาะโมดูลการเงิน/บัญชี)

แยกจาก Permission Matrix รวมของระบบ (ไฟล์ 07) — เป็น matrix เฉพาะทางที่ละเอียดกว่า แบ่ง 4 กลุ่มฟังก์ชัน: ปฏิบัติงาน (Operations), การเงิน (Finance), บัญชี (Accounting), บริหาร (Management)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| functional_group | enum | yes | `ops` / `finance` / `accounting` / `admin` |
| action | string | yes | ชื่อ capability (เช่น "อนุมัติ Claim เกินเพดาน") |
| access per role | mapping | yes | **ระดับสิทธิ์ 3 ระดับต่อ role (DEC-009 — แทน `allowed_role_ids` เดิม)**: ไม่มีสิทธิ์ (ไม่มี record) / `view` 👁️ ดูอย่างเดียว / `manage` ✅ ทำได้ — เก็บที่ `role_capabilities.access_level` (schema 02 v3.6) |

กติกาเพิ่มเติม (DEC-009, 05/07/2569):
- UI เป็น **dropdown 3 ระดับต่อ role** ต่อ capability (ดู mockup `settings.html` tab "สิทธิ์บัญชี/การเงิน" — 37 รายการครบตามไฟล์ 25)
- **Superadmin มีสิทธิ์ `manage` ทุก capability โดยนิยาม** — ไม่แสดงในตาราง/ไม่เก็บ record, enforce ที่ permission middleware
- Capability ที่ไฟล์ 25 ระบุ "✅ only" (7 รายการ เช่น จัดการ Finance Company, แก้ Tax Profile) **ล็อกเป็นของ Superadmin เท่านั้น** มอบให้ role อื่นไม่ได้
- การแก้ไข matrix เป็น critical action ต้องบันทึก audit log เสมอ (ไฟล์ 05 §10 / 90)

### 6.11 Period Lock Policy (นโยบายล็อกรอบบัญชี)

| สถานะรอบบัญชี | แก้ไขเคสเดิม | ต้องใช้ Adjustment | ผู้อนุมัติปลดล็อก |
|---|---|---|---|
| `collecting` | แก้ไขได้อิสระ | ไม่จำเป็น | การเงิน |
| `sent_to_accountant` | จำกัด — เฉพาะ field ที่ไม่กระทบยอดส่งไปแล้ว | บางกรณี (กระทบยอด) | การเงิน + Executive |
| `locked` | แก้ไขไม่ได้โดยตรง | บังคับใช้ Adjustment 100% | Executive + บันทึก audit log |

> นโยบายนี้คือ policy หลักที่ไฟล์ 20 (Adjustment) และ 30 (Monthly Close) ต้อง enforce — เมื่อรอบบัญชีเป็น `locked` ห้ามแก้ source record โดยตรงเด็ดขาด ต้องสร้าง Adjustment record แยกเสมอ

### 6.12 Tax Invoice Numbering Format (รูปแบบเลขที่ใบกำกับภาษี)

ให้บัญชีเลือกรูปแบบ running number ของใบกำกับภาษีได้เอง (ดูไฟล์ 31 §6.2) — เลือกครั้งแรกแล้วไม่ควรเปลี่ยนทีหลัง เพราะกระทบความต่อเนื่องของเลขเอกสารตามกฎหมาย

| Field | Type | Required | Description |
|---|---|---|---|
| numbering_mode | enum | yes | `continuous` (เรียงต่อเนื่องไม่มีวันสิ้นสุด เช่น 000001, 000002, ...) / `yearly_reset` (ขึ้นต้นใหม่ทุกปีปฏิทินพร้อม prefix ปี เช่น `INV-2569-0001`) |
| prefix | string | no | ข้อความนำหน้าเลขที่ (เช่น "INV-") — ใช้ได้ทั้ง 2 mode |
| digit_length | integer | yes | จำนวนหลักของเลขรันนิ่ง (เช่น 4 หลัก = 0001) |
| last_number | integer | yes | เลขล่าสุดที่ออกไปแล้ว — ระบบ track อัตโนมัติ ไม่ให้แก้มือ |
| last_reset_year | integer \| null | — | ปีที่ reset ล่าสุด (พ.ศ.) — ใช้เฉพาะ `yearly_reset` |

> **Schema sync 04/07/2569 (DEC-006/D1)**: field ทั้งชุดอยู่บนตาราง `organizations` ใน `02` v3.5 (`tax_invoice_numbering_mode`, `tax_invoice_prefix`, `tax_invoice_digit_length`, `tax_invoice_seq`, `tax_invoice_last_reset_year`)

### 6.13 Tax Document Template Settings (รูปแบบเอกสารภาษีทางการ)

ให้บัญชี/สำนักงานบัญชีปรับแต่งรายละเอียดของเอกสารทางการ (ใบกำกับภาษี — ไฟล์ 31, ใบ 50 ทวิ — ไฟล์ 33) ได้เองโดยไม่ต้องแก้โค้ด — สเปคนี้กำหนดแค่ฟิลด์บังคับตามกฎหมาย (ดูไฟล์ 28 §6.2-6.3) ส่วนการจัดวาง/ภาพลักษณ์ปรับได้

| Field | Type | Required | Description |
|---|---|---|---|
| document_type | enum | yes | `tax_invoice` / `wht_certificate` |
| logo_url | string \| null | — | โลโก้บริษัทที่แสดงบนเอกสาร |
| footer_note | text \| null | — | ข้อความท้ายเอกสาร (เช่น เงื่อนไขการชำระเงิน, ข้อมูลติดต่อเพิ่มเติม) |
| signature_image_url | string \| null | — | รูปลายเซ็นผู้มีอำนาจ (ถ้าต้องการแสดงในเอกสาร PDF) |
| paper_size | enum | yes | `A4` / `A5` — ค่าเริ่มต้น A4 |
| language | enum | yes | `th` / `th_en_bilingual` — ค่าเริ่มต้นภาษาไทยอย่างเดียว |

> ฟิลด์บังคับตามกฎหมาย (ชื่อ/ที่อยู่/Tax ID ผู้ซื้อ-ผู้ขาย, เลขที่เอกสาร, วันที่, รายการ, ยอดเงิน, VAT/WHT แยกชัดเจน) ตามไฟล์ 28 §6.2-6.3 **ไม่สามารถปิดหรือซ่อนได้** เพราะเป็นข้อกำหนดทางกฎหมาย — การตั้งค่าในส่วนนี้ปรับได้แค่ภาพลักษณ์ (โลโก้, footer, ขนาดกระดาษ, ภาษา) เท่านั้น

## 7. UI / UX Rules

- เมนูซ้าย/แท็บแบ่งตาม sub-section ใน §6 (**13 แท็บ**)
- ทุก sub-section ใช้ pattern เดียวกัน: table list + ปุ่ม "เพิ่ม" มุมขวาบน + ปุ่มแก้ไขรายแถว
- §6.11 (Lock Policy) แสดงเป็น policy banner เตือนสีเหลืองด้านบนเสมอ ("เมื่อรอบบัญชีถูกรับรองส่งมอบแล้ว ห้ามแก้ source record โดยตรง")

## 8. Workflow / Lifecycle

ส่วนใหญ่เป็น static configuration ไม่มี state machine ของตัวเอง ยกเว้น §6.8 (Bank File Format) ที่มี `test_status` ต้องผ่านการทดสอบก่อนใช้งานจริง:

`pending → ทดสอบไฟล์ตัวอย่าง → passed/failed → (ถ้า failed) แก้ column_mapping → ทดสอบใหม่`

## 9. Security / Control Rules

- แก้ไข Tax Profile (§6.4) ต้อง audit + reason เสมอ (กระทบยอดภาษีทุกรายการที่ใช้ profile นั้น)
- แก้ไข VAT Rate (§6.5) ต้อง audit + reason เสมอ — ห้ามมีช่วงเวลาทับกัน (validation บังคับ)
- แก้ไข Period Lock Policy (§6.11) เองทำได้เฉพาะ Superadmin — Admin ทั่วไปดูได้อย่างเดียว เพราะเป็น policy ระดับองค์กร
- บัญชีธนาคาร (§6.3) ที่มีรายการเงินผูกอยู่แล้ว ห้ามลบ — แก้ไขได้แต่ต้อง audit

## 10. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| REQUIRED_MISSING | ฟิลด์บังคับไม่ครบ | inline error |
| INVALID_WHT_RATE | `wht_rate` ติดลบหรือมากกว่า 100 | reject |
| VAT_RATE_OVERLAP | ช่วงเวลา `effective_from`/`effective_to` ของ VAT Rate ใหม่ทับกับรายการที่มีอยู่ | reject พร้อมแจ้งช่วงที่ทับ |
| BANK_FILE_NOT_TESTED | พยายามใช้ bank file format ที่ `test_status != passed` ไปสร้างไฟล์โอนจริง | reject พร้อมแจ้งให้ทดสอบก่อน |
| PERIOD_LOCKED_DIRECT_EDIT | พยายามแก้ source record ตรงขณะรอบบัญชีเป็น `locked` | reject พร้อมแนะนำให้สร้าง Adjustment แทน |

## 11. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| แก้ไข Cycles/Approvals/Banks/CostCenter/Docs/BankFile/Export | Superadmin only | full |
| แก้ไข Tax Profile | Superadmin only | กระทบภาษีทั้งระบบ จำกัดสิทธิ์แคบกว่าอื่น |
| แก้ไข VAT Rate | Superadmin only | กระทบภาษีทั้งระบบ จำกัดสิทธิ์แคบกว่าอื่น |
| แก้ไข Tax Invoice Numbering Format | Superadmin only | ควรตั้งครั้งแรกแล้วไม่เปลี่ยน — กระทบความต่อเนื่องของเลขเอกสารตามกฎหมาย |
| แก้ไข Functional Permission Matrix | Superadmin only | — |
| แก้ไข Period Lock Policy | Superadmin only | — |
| ดู settings ทั้งหมด | การเงิน, บัญชี | read-only |
| อนุมัติปลดล็อกรอบ locked | Executive | ดู §6.11 |

## 12. Audit Log Requirements

- ทุกการแก้ไขใน §6.4 (Tax), §6.5 (VAT Rate) และ §6.11 (Lock Policy) ต้องมี `reason` บังคับเสมอ
- การปลดล็อกรอบบัญชีที่ `locked` ต้องบันทึก audit แยกชัดเจน พร้อมชื่อ Executive ที่อนุมัติ

## 13. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET / POST / PATCH | /api/settings/cycles | Billing/Payout Cycles |
| GET / POST / PATCH | /api/settings/approval-matrix | Approval Matrix |
| GET / POST / PATCH | /api/settings/bank-accounts | Corporate Banks |
| GET / POST / PATCH | /api/settings/tax-profiles | Tax Profile |
| GET / POST / PATCH | /api/settings/vat-rates | VAT Rate (effective-dated) |
| GET / PATCH | /api/settings/tax-invoice-numbering | Tax Invoice Numbering Format |
| GET / POST / PATCH | /api/settings/cost-centers | Cost Center |
| GET | /api/settings/document-templates | Internal Doc Templates (read-only, ดูไฟล์ 28 สำหรับแก้ไข) |
| GET / POST / PATCH | /api/settings/bank-file-formats | Bank File Format |
| POST | /api/settings/bank-file-formats/:id/test | รันทดสอบไฟล์ตัวอย่าง |
| GET | /api/settings/export-formats | Export Format spec (read-only, ดูไฟล์ 37) |
| GET / PATCH | /api/settings/functional-permissions | Functional Permission Matrix |
| GET / PATCH | /api/settings/period-lock-policy | Period Lock Policy |

## 14. Acceptance Criteria

- ตั้งค่าทุก sub-section ได้ครบตาม §6 (13 sub-section)
- Tax Profile คำนวณ WHT ถูกต้องตามอัตรา 3% + เกณฑ์ขั้นต่ำ 1,000 บาท
- Bank File ที่ยังไม่ผ่านทดสอบ ใช้สร้างไฟล์โอนจริงไม่ได้
- รอบบัญชี locked แล้ว แก้ source record ตรงไม่ได้ ต้องผ่าน Adjustment เท่านั้น

## 15. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| WHT ต่ำกว่าเกณฑ์ | สร้างรายการจ่าย 800 บาท ที่ Tax Profile กำหนด wht_min_threshold = 1000 | ไม่หัก WHT |
| WHT ถึงเกณฑ์ | สร้างรายการจ่าย 1,200 บาท | หัก WHT ตาม wht_rate |
| ใช้ Bank File ที่ยังไม่ทดสอบ | สร้างไฟล์โอนจริงด้วย format ที่ test_status = pending | reject BANK_FILE_NOT_TESTED |
| แก้ไขขณะ locked | พยายามแก้ค่าใช้จ่ายเดิมในรอบที่ locked | reject PERIOD_LOCKED_DIRECT_EDIT |
| เพิ่ม VAT Rate ทับช่วงเดิม | เพิ่มอัตราใหม่ที่ effective_from อยู่ในช่วงของอัตราเดิมที่ยังไม่หมด | reject VAT_RATE_OVERLAP |

---

## 16. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **13 sub-section ครบ** (§6.1-6.13) — แก้ไขจำนวนที่เขียนผิดใน §3 เดิม (เคยเขียนว่า 10) ให้ตรงกับ README แล้ว
- **WHT rate มาตรฐาน 3%** สำหรับค่าจ้างทำของ/ค่าบริการ (มาตรา 40(7)/40(8)) — ตั้งเป็นค่าเริ่มต้นได้แต่ต้องเป็นฟิลด์ตั้งค่า ไม่ hardcode (§6.4) 🔶
- **เงินเดือนพนักงาน inhouse ไม่อยู่ในขอบเขตของระบบนี้เลย** — Tax Profile ใช้กับค่าตอบแทนจากการทำเคสเท่านั้น (§6.4.1)
- **VAT Rate ต้องมี effective date versioning เสมอ ห้าม hardcode** เพราะอัตราไทยเป็นอัตราลดพิเศษที่ต้องต่ออายุเป็นระยะ (§6.5) 🔶
- **Tax Invoice Numbering Format เลือกครั้งแรกแล้วไม่ควรเปลี่ยน** เพราะกระทบความต่อเนื่องของเลขเอกสารตามกฎหมาย (§6.12)
- **Period Lock Policy 3 สถานะ** (`collecting`/`sent_to_accountant`/`locked`) กำหนดสิทธิ์แก้ไขต่างกันชัดเจน — เป็น policy หลักที่ไฟล์ 20/30 ต้อง enforce (§6.11)
- **Bank File Format ต้อง `test_status = passed` ก่อนใช้ตัดโอนเงินจริงเสมอ** (§6.8, §10 BANK_FILE_NOT_TESTED)

## 17. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- 🔶 ยังไม่ได้ทดสอบ Bank File Format จริงกับธนาคารที่ AssetRecovery ใช้งานจริง (encoding TIS-620 vs UTF-8) — ตรงกับ Open Item ใน `93-roadmap-open-items.md`
- 🔶 VAT 7% จะต่ออายุหรือกลับ 10% ตั้งแต่ 1 ต.ค. 2569 — รอติดตามประกาศกรมสรรพากร (ตรงกับ Open Item ใน `93-roadmap-open-items.md`)

---

*เอกสารนี้เป็นไฟล์สุดท้ายในหมวด Settings Module (07–13) ต่อจาก `12-service-fee.md`*
