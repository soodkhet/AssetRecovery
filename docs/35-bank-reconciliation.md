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

### 6.3 Manual Matching

บัญชีเลือกรายการที่จะจับคู่จาก dropdown (ค้นหาด้วยเลขที่ Billing Batch/Revenue) → `status = manual_matched` — ถ้ายอดไม่ตรงกันเป๊ะ ต้องกรอกหมายเหตุชี้แจงเหตุผล (เช่น ลูกค้าหักค่าธรรมเนียมธนาคารออกก่อนโอน)

### 6.4 Unmatched Resolved (เพิ่มใหม่ — ดู Changelog v2)

รายการที่**ไม่มีทางจับคู่กับ Billing/Payout Batch ได้จริง** (เช่น ค่าธรรมเนียมธนาคารรายเดือน, ดอกเบี้ยรับ, เงินโอนผิดที่ธนาคารเรียกคืนแล้ว) — บัญชีทำเครื่องหมาย `unmatched_resolved` พร้อมหมายเหตุอธิบาย แทนที่จะปล่อยเป็น `unmatched` ค้างตลอดไปโดยไม่มีทางแก้ — **ไม่ผูก FK กับ Billing/Payout Batch ใดๆ** (ต่างจาก `matched` ที่ต้องมี FK)

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
| status | enum | yes | **`unmatched` / `auto_matched` / `manual_matched` / `unmatched_resolved`** (แก้จาก 2 สถานะเดิม — ดู §6.2-6.4) |

## 8. UI / UX Rules

อ้างอิงจาก `accounting.html`:

- Table: วันที่, รายละเอียด statement (+เลขอ้างอิง), เงินเข้า (เขียว)/เงินออก (แดง), จับคู่กับ, สถานะ (badge 4 สี: unmatched=แดง/auto_matched=เขียว/manual_matched=ฟ้า/unmatched_resolved=เทา), ปุ่ม "จับคู่ Manual" (เฉพาะ unmatched) หรือ "ทำเครื่องหมายว่าไม่ต้องจับคู่" (unmatched → unmatched_resolved)
- Modal "จับคู่ Manual": แสดงข้อมูล transaction ที่กำลังจับคู่ (การ์ดสรุปด้านบน) + dropdown ค้นหารายการที่จะจับคู่ + textarea หมายเหตุชี้แจง
- Modal "Import Statement": เลือกบัญชีธนาคาร + drag-drop file CSV

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
| PATCH | /api/bank-reconciliation/transactions/:id/match | จับคู่ manual |
| PATCH | /api/bank-reconciliation/transactions/:id/resolve-unmatched | ทำเครื่องหมายว่าไม่ต้องจับคู่ (ต้องมี match_note) |

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
