# 35-bank-reconciliation.md

# 35 — Bank Reconciliation (กระทบยอดธนาคาร)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted — แก้ไข match structure)
> Document Level: Accounting Module
> เอกสารอ้างอิง: `13-accounting-finance-settings.md` §6.3/§6.8, `17-payroll-and-payout.md`, `19-revenue-billing-receivable.md`, `31-accounting-sales-and-receipts.md`, `02-database-schema-design.md` §9 (bank_transactions table), `94-decision-log.md` (DEC-004)

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Bank Transaction, Auto/Manual matching |
| v2 | 03/07/2569 | **แก้ไขสำคัญ**: (1) `matched_with_type`/`matched_with_id` (polymorphic) → **Separate FK columns** (`matched_billing_id`/`matched_payout_id`) ตาม DEC-004 ที่ตัดสินใจไว้แล้ว (2) **เติมสถานะที่ขาดจาก schema**: เดิมมีแค่ `matched`/`unmatched` (2 สถานะ) แต่ schema จริงมี 4 สถานะ (`unmatched`/`auto_matched`/`manual_matched`/`unmatched_resolved`) — เพิ่ม `unmatched_resolved` เป็น concept ใหม่สำหรับรายการที่ไม่มีทางจับคู่ได้จริง (เช่น ค่าธรรมเนียมธนาคาร ดอกเบี้ย) แต่ต้องบันทึกอธิบายไว้ ไม่ปล่อยเป็น unmatched ค้างตลอดไป — ปิด flag ที่ตั้งไว้ใน `23-finance-state-machines.md` §6.14 |
| v2.1 | 04/10/2569 | **มติ PO 04/10/2569 (UAT — แม่แบบนำเข้าภาษาไทย)** — §8 Modal "Import Statement" มีปุ่ม "ดาวน์โหลดไฟล์ตัวอย่าง" (`bank-statement-template.csv` · CSV UTF-8 + BOM) ผ่าน `GET /api/bank-reconciliation/import/template?bank_account_id=` (สิทธิ์ `manage` เดียวกับตัวนำเข้า): บัญชีที่ตั้งรูปแบบ statement (`13` §6.8) ⇒ เรียงคอลัมน์ตาม `column_mapping` เป๊ะ · ยังไม่ตั้ง ⇒ รูปแบบมาตรฐาน วันที่/รายละเอียด/เลขที่อ้างอิง/เงินเข้า/เงินออก · หัวคอลัมน์ภาษาไทยที่ parser รู้จัก วันที่ตัวอย่างเป็น พ.ศ. · มีเทสต์ แม่แบบ → parser ผ่าน 100% |
| v2.2 | 04/10/2569 | **มติผู้ใช้ 04/10/2569 (แม่แบบ .xlsx)** — §8 ไฟล์ตัวอย่างหลักเป็น **`bank-statement-template.xlsx`** (คอลัมน์ชุดเดียวกับ CSV จาก endpoint เดิม — DTO เพิ่ม `xlsxFileName` + `templateColumns` · ทุกเซลล์ข้อความ `@` · แผ่น "คำอธิบาย") + ลิงก์รอง "หรือ CSV" · Modal รับไฟล์ **.xlsx และ .csv** — .xlsx อ่านแผ่นแรกที่ client (ไม่ประมวลผลสูตร/มาโคร · เซลล์วันที่จริงของ Excel → `YYYY-MM-DD`) แล้วแปลงเป็น CSV ส่ง API เดิม ⇒ parser statement ทางเดิม 100% · เพดาน 2 MB เดิม · SheetJS จาก cdn.sheetjs.com (DEC-013) |
| v2.3 | 05/10/2569 | **มติ PO 05/10/2569 (UAT U41 — เงินเข้าไม่ทราบที่มา "แบบเต็ม")**: §6.5 ใหม่ สถานะ `suspense` (เงินรับรอตรวจสอบ) + `suspense_refunded` (คืนเงินผู้โอน) · §7.1/§14/§16 เพิ่มฟิลด์/endpoint/test · U40: จับคู่เงินรับที่ลูกค้าหักภาษี ⇒ เกิดรายการ "รอ 50 ทวิ จากลูกค้า" (ไฟล์ 31 §6.6) · รายการเดิมที่ปิดเป็น `unmatched_resolved` แล้ว (เช่น ฿123.45 ใน UAT) ไม่ย้าย |
| v2.4 | 07/10/2569 | **มติ PO 07/10/2569 (U136 + U137)** — **U136** §6.2: คีย์กันนำเข้าซ้ำ = (บัญชี, วัน, ยอด, รายละเอียด) **+ ลำดับการเกิดในไฟล์** (`occurrence_seq`) ⇒ 2 รายการจริงที่เหมือนกันทุกช่องในวันเดียว = 2 แถว · นำเข้าไฟล์เดิม/ไฟล์ช่วงวันซ้อนกันซ้ำได้ลำดับเดิม = ยังถูกนับเป็นซ้ำ (ไม่ใช้เลขบรรทัด/ยอดคงเหลือ เพราะเลื่อนตามช่วงไฟล์/บางธนาคารไม่มีคอลัมน์) · **U137** §6.6 ใหม่ **คู่ที่ระบบเสนอ (จับคู่ทางกลับ)**: เอกสารที่เกิดหลัง statement ถูกนำเข้า (รอบวางบิลส่งทีหลัง · รอบจ่ายยืนยันจ่ายเอง) × รายการ `unmatched` ที่ยอดตรง + วันอยู่ในช่วงเกณฑ์ auto-match เดิม ⇒ แสดงให้ฝ่ายบัญชีกดยืนยันทีละคู่ **ไม่จับคู่เงียบ** · §8/§14/§16 เพิ่ม UI/endpoint/test |
| v2.5 | 07/10/2569 | **มติ O75**: ผู้สมัครจับคู่รอบวางบิลใช้ยอดตามเอกสาร + รับ "ยอดค้างที่เหลือ" (เช่น ส่วนของใบเพิ่มหนี้หลังรับชำระครบ) เป็นยอดตรง ทั้ง auto-match / คู่ที่เสนอ / manual · การรับเงินตัดสินสถานะจากยอดตามเอกสาร |

ขอบเขตเอกสารนี้: นำเข้า Bank Statement แล้วจับคู่ (reconcile) กับรายการในระบบ — เงินเข้าจับคู่กับ Billing Batch (ไฟล์ 19) สร้าง Cash Receipt อัตโนมัติ (ไฟล์ 31), เงินออกจับคู่กับ Payout Batch (ไฟล์ 17) ยืนยันการจ่ายสำเร็จ

**ไม่รวมอยู่ในไฟล์นี้**: การออกใบกำกับภาษี/ใบเสร็จ (ดู `31-accounting-sales-and-receipts.md`), การคำนวณยอดเริ่มต้นของ Billing/Payout (ดู `17-payroll-and-payout.md`, `19-revenue-billing-receivable.md`)

---

## 1. Summary

นำเข้า Bank Statement แล้วจับคู่ (reconcile) กับรายการในระบบ — เงินเข้าจับคู่กับ Billing Batch (ไฟล์ 19) สร้าง Cash Receipt อัตโนมัติ (ไฟล์ 31), เงินออกจับคู่กับ Payout Batch (ไฟล์ 17) ยืนยันการจ่ายสำเร็จ

## 2. Purpose

เป็นจุดยืนยันสุดท้ายว่า "เงินที่ระบบบอกว่าควรจะรับ/จ่าย" ตรงกับ "เงินที่ธนาคารบอกว่าเกิดขึ้นจริง" — ลดความเสี่ยงข้อมูลในระบบไม่ตรงกับความเป็นจริง

## 3. In Scope

- นำเข้า Bank Statement (CSV) ตาม format ที่ตั้งไว้ (ไฟล์ 13 §6.8)
- จับคู่อัตโนมัติ (ถ้า reference ตรงกัน) และ manual (ถ้าไม่ตรง)
- สร้าง Cash Receipt / ยืนยัน Payout completed อัตโนมัติเมื่อจับคู่สำเร็จ
- บันทึกรายการที่ไม่มีทางจับคู่ได้จริง (เช่น ค่าธรรมเนียมธนาคาร) เป็น `unmatched_resolved`

## 4. Out of Scope

- การออกใบกำกับภาษี/ใบเสร็จ (ไฟล์ 31)
- การคำนวณยอดเริ่มต้นของ Billing/Payout (ไฟล์ 17/19)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| บัญชี (Accounting) | นำเข้า statement, จับคู่ manual ที่ระบบจับคู่อัตโนมัติไม่ได้ | Full |

## 6. Core Concepts

### 6.1 Bank Transaction (รายการจาก Statement)

แต่ละแถวใน statement ที่ import เข้ามา — มีทั้งเงินเข้า (`in`) และเงินออก (`out`)

### 6.2 Auto-matching Logic

ระบบพยายามจับคู่อัตโนมัติโดยเทียบ:

- เงินเข้า: จำนวนเงินตรงกับ `total_amount` ของ Billing Batch ที่ `status = sent` และวันที่เงินเข้าห่างจากวันวางบิลไม่เกิน `auto_match_tolerance_days` ที่ตั้งค่าไว้ต่อบัญชีธนาคาร (ไฟล์ 13 §6.3 — ค่าเริ่มต้นแนะนำ 7 วัน ปรับได้ตามนโยบายบัญชีจริง)
- เงินออก: จำนวนเงินตรงกับ `net_amount` ของ Payout Batch ที่ `status = file_generated`

ถ้าจับคู่ได้ตรงเป๊ะ 1:1 → auto-match ทันที (`status = auto_matched`) ถ้าไม่ตรง/มีมากกว่า 1 รายการที่เป็นไปได้ → ทิ้งไว้เป็น `unmatched` ให้บัญชีจับคู่ manual

กันนำเข้าซ้ำ (มติ PO U136): แถวที่ (บัญชี, วัน, ยอด, รายละเอียด) เหมือนกันภายในไฟล์เดียวได้ลำดับการเกิด 1, 2, … ตามบรรทัด และคีย์กันซ้ำ = 4 ช่องนั้น + ลำดับ ⇒ รายการจริงที่หน้าตาเหมือนกันในวันเดียวถูกเก็บครบ ส่วนการนำเข้าไฟล์เดิมซ้ำ (หรือไฟล์ที่ครอบช่วงวันกว้างกว่า) ได้ลำดับเดิมจึงถูกนับเป็น "ซ้ำ" เหมือนเดิม — unique index ระดับ DB สะท้อนคีย์นี้เป๊ะ

### 6.3 Manual Matching

บัญชีเลือกรายการที่จะจับคู่จาก dropdown (ค้นหาด้วยเลขที่ Billing Batch/Revenue) → `status = manual_matched` — ถ้ายอดไม่ตรงกันเป๊ะ ต้องกรอกหมายเหตุชี้แจงเหตุผล (เช่น ลูกค้าหักค่าธรรมเนียมธนาคารออกก่อนโอน)

### 6.4 Unmatched Resolved (เพิ่มใหม่ — ดู Changelog v2)

รายการที่**ไม่มีทางจับคู่กับ Billing/Payout Batch ได้จริง** (เช่น ค่าธรรมเนียมธนาคารรายเดือน, ดอกเบี้ยรับ, เงินโอนผิดที่ธนาคารเรียกคืนแล้ว) — บัญชีทำเครื่องหมาย `unmatched_resolved` พร้อมหมายเหตุอธิบาย แทนที่จะปล่อยเป็น `unmatched` ค้างตลอดไปโดยไม่มีทางแก้ — **ไม่ผูก FK กับ Billing/Payout Batch ใดๆ** (ต่างจาก `matched` ที่ต้องมี FK)

### 6.5 เงินรับรอตรวจสอบ (มติ PO 05/10/2569 U41)

เงิน**เข้า**ที่ยังไม่ทราบที่มา (ไม่รู้ผู้โอน/ไม่ตรงบิลใด) — บัญชีย้าย `unmatched → suspense` พร้อม**เหตุผลบังคับ** แทนการปิดรายการ · ถือเป็น**หนี้สินรอตรวจสอบ**: **ไม่สร้าง Cash Receipt ไม่ลดยอดค้างชำระ (AR) ไม่รับรู้รายได้** · ภายหลัง:
- ทราบที่มา ⇒ "จับคู่ Manual" กับรอบวางบิลตามสายปกติ (`suspense → manual_matched` · เหตุผลบังคับเสมอ · ไม่มี auto-match) ⇒ เกิด Cash Receipt + AR ลดตามปกติ
- คืนเงินผู้โอน ⇒ `suspense → suspense_refunded` (วันที่โอนคืน + หลักฐาน (ไฟล์ผ่าน server) + เหตุผล · terminal) — รายการเงินออกตอนโอนคืนใน statement ปิดด้วย `unmatched_resolved` ตามปกติ
- ทุก transition มีเหตุผล + audit · ยามงวดล็อกใช้วันที่ของรายการ (และวันที่คืนเงิน)
- หน้ากระทบยอดแสดง**ยอดเงินรับรอตรวจสอบคงค้างทั้งองค์กร** · Readiness (ไฟล์ 30) **ไม่นับเป็นค้างจับคู่ แต่แสดงเตือน** · ส่งออก `11_Suspense_Receipts.csv` (ไฟล์ 37) และ `status` ในไฟล์ 06 เป็น enum เต็ม 6 ค่า

### 6.6 คู่ที่ระบบเสนอ — จับคู่ทางกลับ (มติ PO U137)

auto-match เกิดเฉพาะตอนนำเข้า statement ⇒ เอกสารที่เกิด/เปลี่ยนสถานะ **หลัง** นำเข้า (รอบวางบิลส่งทีหลัง · รอบจ่ายที่ยืนยันจ่ายสำเร็จด้วยมือ) จะไม่ถูกจับคู่อัตโนมัติอีก — ระบบจึงคำนวณ "คู่ที่เสนอ" สดทุกครั้งที่เปิดแท็บกระทบยอด:

- เอกสาร: รอบวางบิล `sent`/`partially_paid` (วันอ้างอิง = วันส่งบิล · ยอดเต็ม**ตามเอกสาร** (รวมใบลด/เพิ่มหนี้) หรือ `total − wht` ตาม A1 · รอบที่รับเงินบางส่วนแล้วรับ **ยอดค้างที่เหลือ** เป็นยอดตรงด้วย — มติ O75 · ไม่อนุมานเป็นภาษีที่ลูกค้าหัก) และรอบจ่าย `file_generated`/`completed` ที่**ยังไม่มีรายการเดินบัญชีจับคู่** (วันอ้างอิง = วันสร้างไฟล์โอน · ยอด = ยอดโอนจริง)
- รายการเดินบัญชี: `unmatched` เท่านั้น (เงินรับรอตรวจสอบต้องจับคู่มือพร้อมเหตุผลตาม U41) · ฝั่งเงินต้องตรงชนิดเอกสาร
- เกณฑ์ยอด/วัน = เกณฑ์ auto-match เดิมทุกข้อ (ยอดตรงเป๊ะ · เงินเกิดตั้งแต่วันเอกสารถึง +`auto_match_tolerance_days` ของบัญชีนั้น)
- **ไม่จับคู่เอง** — ฝ่ายบัญชีกด "ยืนยันจับคู่" ทีละคู่ ผ่านเส้นทางจับคู่มือเดิม (สิทธิ์/กติกา/ผลข้างเคียงเหมือนกันทุกข้อ) · audit ระบุว่า "ยืนยันคู่ที่ระบบเสนอ" · มีทางเลือกมากกว่าหนึ่ง ⇒ เสนอทุกคู่พร้อมเตือนให้ตรวจ (ไม่เลือกแทนคน)

## 7. Data Entities / Required Objects

### 7.1 Bank Transaction (แก้ไข matching structure แล้ว — ดู Changelog v2)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| bank_account_id | uuid | yes | อ้างอิงไฟล์ 13 §6.3 |
| transaction_date | date | yes | — |
| reference | string | yes | เลขอ้างอิงจากธนาคาร (เช่น "KBANK-TRX-001") |
| description | string | yes | รายละเอียดที่ปรากฏใน statement |
| amount_in, amount_out | decimal | yes | อย่างใดอย่างหนึ่งเป็น 0 เสมอ |
| matched_billing_id | uuid \| null | — | **Separate FK column** (ตาม DEC-004) — ผูกกับ Billing Batch ถ้าจับคู่แล้ว |
| matched_payout_id | uuid \| null | — | **Separate FK column** (ตาม DEC-004) — ผูกกับ Payout Batch ถ้าจับคู่แล้ว (มีได้แค่ 1 ใน 2 column นี้เท่านั้นที่ไม่ null) |
| match_note | text \| null | — | บังคับกรอกถ้ายอดจับคู่ไม่ตรงเป๊ะ หรือถ้า status = unmatched_resolved |
| status | enum | yes | **`unmatched` / `auto_matched` / `manual_matched` / `unmatched_resolved`** (แก้จาก 2 สถานะเดิม — ดู §6.2-6.4) + `suspense` / `suspense_refunded` (มติ PO U41 — §6.5) |
| suspense_note, suspended_at, suspended_by | text/timestamptz/uuid | เมื่อ suspense | เหตุผล/เวลา/ผู้ย้ายเข้าเงินรับรอตรวจสอบ (คงไว้เป็นประวัติแม้จับคู่ภายหลัง) |
| refund_date, refund_note, refund_file_path, refunded_at, refunded_by | date/text/text/timestamptz/uuid | เมื่อ suspense_refunded | คืนเงินผู้โอน |

## 8. UI / UX Rules

อ้างอิงจาก `accounting.html`:

- Table: วันที่, รายละเอียด statement (+เลขอ้างอิง), เงินเข้า (เขียว)/เงินออก (แดง), จับคู่กับ, สถานะ (badge 4 สี: unmatched=แดง/auto_matched=เขียว/manual_matched=ฟ้า/unmatched_resolved=เทา), ปุ่ม "จับคู่ Manual" (เฉพาะ unmatched) หรือ "ทำเครื่องหมายว่าไม่ต้องจับคู่" (unmatched → unmatched_resolved)
- แผง "คู่ที่ระบบเสนอ" (U137) เหนือตาราง — แสดงเมื่อมีคู่ที่เสนอเท่านั้น: เอกสาร (เลขที่ · ชนิด · สถานะ · วันที่) / รายการเดินบัญชี (วันที่ · รายละเอียด · บัญชี) / ยอดที่ตรง / ปุ่ม "ยืนยันจับคู่" (เฉพาะผู้มีสิทธิ์จัดการ — ผู้มีสิทธิ์ดูเห็นข้อความรอฝ่ายบัญชียืนยัน) · คู่ที่มีทางเลือกมากกว่าหนึ่งมีข้อความเตือนสีเหลือง
- Modal "จับคู่ Manual": แสดงข้อมูล transaction ที่กำลังจับคู่ (การ์ดสรุปด้านบน) + dropdown ค้นหารายการที่จะจับคู่ + textarea หมายเหตุชี้แจง
- Modal "Import Statement": เลือกบัญชีธนาคาร + drag-drop file .xlsx/.csv (v2.2) + ปุ่ม "ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)" + ลิงก์รอง "หรือ CSV" (v2.2) ตามรูปแบบ statement ของบัญชีที่เลือก พร้อมคำอธิบายคอลัมน์ (v2.1)

## 9. Workflow / Lifecycle

`Import Statement → สร้าง Bank Transaction หลายรายการ → ระบบ auto-match ที่ทำได้ (status: auto_matched) → ที่เหลือเป็น unmatched → บัญชีจับคู่ manual ทีละรายการ (status: manual_matched) หรือทำเครื่องหมายว่าไม่ต้องจับคู่ (status: unmatched_resolved) → matched (auto/manual) → trigger event ไปไฟล์ 31 (สร้าง Cash Receipt) หรือไฟล์ 17 (ยืนยัน Payout completed) ตาม matched_billing_id/matched_payout_id`

## 10. Security / Control Rules

- จับคู่ manual ที่ยอดไม่ตรงเป๊ะ ต้องกรอก `match_note` บังคับ
- แก้ไขการจับคู่ที่ทำไปแล้ว (re-match) ต้อง audit พร้อมเหตุผล
- ทำเครื่องหมาย `unmatched_resolved` ต้องกรอก `match_note` อธิบายเหตุผลเสมอ (บังคับ ไม่ใช่ทางเลือก)

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| MATCH_NOTE_REQUIRED | จับคู่ manual ที่ยอดไม่ตรงเป๊ะ หรือทำเครื่องหมาย unmatched_resolved โดยไม่กรอกหมายเหตุ | reject |
| ALREADY_MATCHED | พยายามจับคู่ transaction ที่ auto_matched/manual_matched ไปแล้ว | เตือนว่าจะเปลี่ยนการจับคู่เดิม ให้ยืนยันก่อน |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| Import statement, จับคู่ manual | บัญชี | full |
| ดูทั้งหมด | การเงิน | read-only |

## 13. Audit Log Requirements

- การจับคู่ manual ทุกครั้งต้อง audit พร้อม match_note (ถ้ามี)
- การทำเครื่องหมาย unmatched_resolved ต้อง audit พร้อม match_note

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/bank-reconciliation/import | นำเข้า statement |
| GET | /api/bank-reconciliation/transactions | list |
| GET | /api/bank-reconciliation/match-proposals | คู่ที่ระบบเสนอ (U137 · สิทธิ์ดูเหมือนรายการเดินบัญชี) |
| PATCH | /api/bank-reconciliation/transactions/:id/match | จับคู่ manual · ยืนยันคู่ที่เสนอส่ง `fromProposal: true` (U137) |
| PATCH | /api/bank-reconciliation/transactions/:id/resolve-unmatched | ทำเครื่องหมายว่าไม่ต้องจับคู่ (ต้องมี match_note) |
| PATCH | /api/bank-reconciliation/transactions/:id/suspense | ย้ายเป็นเงินรับรอตรวจสอบ (`reason` บังคับ — มติ PO U41) |
| PATCH | /api/bank-reconciliation/transactions/:id/refund | คืนเงินผู้โอน (`refundDate` + `filePath` + `reason` — มติ PO U41) |

## 15. Acceptance Criteria

- Import statement สร้างรายการถูกต้องตาม format ที่ตั้งไว้
- Auto-match ทำงานถูกต้องเมื่อยอด/reference ตรงกันชัดเจน (status = auto_matched)
- จับคู่สำเร็จแล้ว trigger สร้าง Cash Receipt/ยืนยัน Payout ได้จริง
- รายการที่ไม่มีทางจับคู่ได้ทำเครื่องหมาย unmatched_resolved ได้ พร้อมเหตุผลบังคับ

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| Auto-match สำเร็จ | Import statement ที่มียอดตรงกับ Billing Batch เป๊ะ | status = auto_matched อัตโนมัติ, matched_billing_id ถูกตั้งค่า |
| Manual match ยอดไม่ตรง ไม่กรอกหมายเหตุ | จับคู่ manual ยอดไม่ตรงเป๊ะโดยไม่กรอก note | reject MATCH_NOTE_REQUIRED |
| ทำเครื่องหมาย unmatched_resolved | ทำเครื่องหมายรายการค่าธรรมเนียมธนาคารว่าไม่ต้องจับคู่ พร้อมกรอกเหตุผล | status = unmatched_resolved, matched_billing_id/matched_payout_id ยังเป็น null ทั้งคู่ |
| เงินรับรอตรวจสอบ (U41) | ย้ายเงินเข้าไม่ทราบที่มาเป็น suspense พร้อมเหตุผล | ไม่มี Cash Receipt · ยอดรับ/ยอดค้างของรอบวางบิลไม่เปลี่ยน · audit มีเหตุผล |
| จับคู่เงินรอตรวจสอบภายหลัง (U41) | จับคู่ suspense กับรอบวางบิล ไม่กรอกเหตุผล / กรอกเหตุผล | reject MATCH_NOTE_REQUIRED / manual_matched + Cash Receipt + AR ลด |
| คืนเงินผู้โอน (U41) | suspense → refund พร้อมวันที่/หลักฐาน/เหตุผล แล้วลองจับคู่ต่อ | suspense_refunded · จับคู่ต่อ = BANK_TRANSACTION_INVALID_STATUS |
| เงินรับที่ลูกค้าหักภาษี (U40) | จับคู่ยอด total − wht | เกิดรายการ "รอ 50 ทวิ จากลูกค้า" ยอดเท่าที่ถูกหัก |
| รายการเหมือนกันทุกช่องในวันเดียว (U136) | นำเข้าไฟล์ที่มี 2 แถวเหมือนกันทุกช่อง แล้วนำเข้าไฟล์เดิมซ้ำ | ครั้งแรกได้ 2 แถว (ลำดับ 1, 2) · ครั้งที่สองซ้ำทั้ง 2 แถว · นำเข้าพร้อมกันยังได้ 2 แถวพอดี |
| คู่ที่เสนอ (U137) | statement เงินเข้ามาก่อน แล้วรอบวางบิลยอดเท่ากันถูกส่งภายหลัง | รายการยังเป็น unmatched + ไม่มีเงินรับ จนกว่าจะกดยืนยัน ⇒ manual_matched + เงินรับ + audit "ยืนยันคู่ที่ระบบเสนอ" |
| คู่ที่เสนอฝั่งจ่าย (U137) | รอบจ่ายยืนยันจ่ายเองแล้ว statement ตามมา | ไม่ auto-match · เสนอคู่เฉพาะรายการที่อยู่ในช่วงวัน · ยืนยันแล้วรอบนั้นไม่ถูกเสนอซ้ำ |
| Readiness Check นับ unmatched_resolved เป็นครบ | ตรวจความพร้อมปิดงวด (ไฟล์ 30) มีรายการ unmatched_resolved อยู่ | ถือว่า Bank Reconcile ครบ 100% (ไม่ใช่แค่ auto/manual_matched เท่านั้น) |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **matched_with_type/matched_with_id (polymorphic) → Separate FK columns** (`matched_billing_id`/`matched_payout_id`) ตาม DEC-004 (§7.1)
- **Status ขยายเป็น 4 สถานะ**: `unmatched`/`auto_matched`/`manual_matched`/`unmatched_resolved` — แยก auto กับ manual ชัดเจน และเพิ่ม `unmatched_resolved` สำหรับรายการที่ไม่มีทางจับคู่ได้จริง (§6.2-6.4)
- **`unmatched_resolved` ต้องกรอกเหตุผลบังคับเสมอ** ไม่ปล่อยผ่านเงียบๆ (§10, §11)
- **Readiness Check (ไฟล์ 30) นับ `unmatched_resolved` เป็น "ครบ 100%"** เหมือน matched — ไม่ใช่ blocker (§16) — เพราะเป็นการยืนยันแล้วว่าไม่มีทางจับคู่ได้จริง ไม่ใช่ปัญหาที่ยังค้างอยู่

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — ช่วงวันที่ยอมรับได้สำหรับ auto-matching ทำเป็นค่าตั้งค่า `auto_match_tolerance_days` ในไฟล์ 13 §6.3 ให้สำนักงานบัญชีปรับเองได้แล้ว

---

*เอกสารนี้เป็นไฟล์ที่ 6 ในหมวด Accounting Module (30–37) ต่อจาก `34-accounting-document-checklist-exceptions.md` และก่อน `36-accountant-questions.md`*
