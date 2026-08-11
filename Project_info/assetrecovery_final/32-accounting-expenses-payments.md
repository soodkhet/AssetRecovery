# 32-accounting-expenses-payments.md

# 32 — Accounting: Expenses and Payments (บัญชีค่าใช้จ่ายและรายการจ่าย)
## AssetRecovery — Asset Recovery Operations Platform

> สถานะ: Specification v2 (Reformatted)
> Document Level: Accounting Module
> เอกสารอ้างอิง: `17-payroll-and-payout.md` §7.2 (Payout Batch Item — ต้นทางข้อมูล), `13-accounting-finance-settings.md` §6.6 (Cost Center), `02-database-schema-design.md` §9 (expense_records table), `34-accounting-document-checklist-exceptions.md`, `20-adjustment.md`
> 🔶 ดูหมายเหตุสำคัญเรื่องการตรวจทานโดยนักบัญชีในไฟล์ 10 — ใช้กับไฟล์นี้เช่นกัน

## Changelog

| Version | วันที่ | การเปลี่ยนแปลง |
|---|---|---|
| v1 | (เดิม) | Drafted from UI Reference — Expense Record (accounting view), Cost Center mapping, Document Completeness Check |
| v2 | 03/07/2569 | Reformat ตามมาตรฐานเอกสารชุดใหม่ + แยก Decisions/Open Items ชัดเจน — **เนื้อหาเดิมคงไว้ครบ ไม่มีการเปลี่ยน business logic** |

ขอบเขตเอกสารนี้: มุมมองฝั่งบัญชีของรายจ่าย (ต่อจากไฟล์ 17 ฝั่งการเงิน) — บันทึกรายการค่าใช้จ่าย/จ่ายเงินตามมาตรฐานบัญชี พร้อม Cost Center mapping และตรวจสอบความครบถ้วนของเอกสารก่อนส่งสำนักงานบัญชี

**ไม่รวมอยู่ในไฟล์นี้**: การอนุมัติ/คำนวณยอดเริ่มต้น (ดูไฟล์ 15/16/17), หนังสือรับรองหัก ณ ที่จ่าย/สรุป WHT (ดู `33-accounting-wht-data.md`)

---

## 1. Summary

มุมมองฝั่งบัญชีของรายจ่าย (ต่อจากไฟล์ 17 ฝั่งการเงิน) — บันทึกรายการค่าใช้จ่าย/จ่ายเงินตามมาตรฐานบัญชี พร้อม Cost Center mapping และตรวจสอบความครบถ้วนของเอกสารก่อนส่งสำนักงานบัญชี

## 2. Purpose

เป็นข้อมูลที่บัญชี/สำนักงานบัญชีใช้บันทึกบัญชีรายจ่ายจริง — sync จาก Payout Batch ที่ `completed` แล้วเท่านั้น (จ่ายเงินจริงแล้ว ไม่ใช่แค่อนุมัติ)

## 3. In Scope

- รายการค่าใช้จ่าย (Expense Record — มุมมองบัญชี) ที่ sync จาก Payout Batch (ไฟล์ 17)
- Cost Center mapping ต่อรายการ
- ตรวจสอบเอกสารประกอบครบถ้วน (ใบเสร็จ/หลักฐานการจ่าย) ก่อนถือว่า "พร้อมส่งบัญชี"

## 4. Out of Scope

- การอนุมัติ/คำนวณยอดเริ่มต้น (ไฟล์ 15/16/17)
- หนังสือรับรองหัก ณ ที่จ่าย/สรุป WHT (ไฟล์ 33)

## 5. Actors & Responsibilities

| Actor / Role | Responsibility | Scope |
|---|---|---|
| บัญชี (Accounting) | ตรวจสอบความครบถ้วน, map Cost Center, เตรียมข้อมูลส่งสำนักงานบัญชี | Full |
| การเงิน (Finance) | ดู Expense เพื่ออ้างอิง | Read-only |

## 6. Core Concepts

### 6.1 Expense Record (มุมมองบัญชี)

sync อัตโนมัติจาก Payout Batch Item (ไฟล์ 17 §7.2) เมื่อ batch เปลี่ยนเป็น `completed` — ไม่ใช่ก่อนหน้านั้น เพราะบัญชีบันทึกรายจ่ายตาม**เงินที่จ่ายจริง** ไม่ใช่ตามยอดที่อนุมัติแล้วแต่ยังไม่จ่าย

### 6.2 Cost Center Mapping

ตาม `mapping_rule` ของ Cost Center (ไฟล์ 13 §6.6): `auto` = ระบบ map จากทีมของ payee อัตโนมัติ / `manual` = บัญชีเลือกเอง — ใช้สำหรับแยกวิเคราะห์ต้นทุนตามแผนก/ทีม

### 6.3 Document Completeness Check

ก่อนรายการจะถือว่า "พร้อมส่งบัญชี" ต้องมีหลักฐานครบ: ใบเสร็จ/หลักฐานการจ่าย (จากต้นทางไฟล์ 41 หรือใบเสร็จที่อัปโหลดแยก) — รายการที่เอกสารไม่ครบขึ้นในไฟล์ 34 (Document Checklist) เป็น exception

## 7. Data Entities / Required Objects

### 7.1 Expense Record (Accounting view)

| Field | Type | Required | Description |
|---|---|---|---|
| id | uuid | yes | — |
| payout_batch_item_id | uuid | yes | อ้างอิงไฟล์ 17 §7.2 |
| payee_name | string | yes | snapshot ชื่อ payee ณ ตอน sync (เผื่อ payee ถูกแก้ไขทีหลัง ไม่กระทบรายการบัญชีเก่า) |
| category | string | yes | ประเภทค่าใช้จ่าย (เช่น "ค่าน้ำมัน", "ค่าที่พัก", "Commission") |
| payment_date | date | yes | วันที่จ่ายจริง (= `payment_file_generated_at` หรือวันที่ completed ของ batch) |
| gross_amount, wht_amount, net_amount | decimal | yes | snapshot จากไฟล์ 17 |
| cost_center_id | uuid | yes | — |
| document_status | enum | yes | `complete` / `incomplete` (ดู §6.3 — ลิงก์กับไฟล์ 34) |

## 8. UI / UX Rules

อ้างอิงจาก `accounting.html` (`expenses` tab):

- Table: ผู้รับ, ประเภท, วันที่จ่าย, Gross, WHT, Net, Cost Center, เอกสาร (badge "ครบ"/"ไม่ครบ"), สถานะ

## 9. Workflow / Lifecycle

`Payout Batch เปลี่ยนเป็น completed → sync เป็น Expense Record (มุมมองบัญชี) → ระบบเช็คเอกสารอัตโนมัติ (document_status) → ถ้าไม่ครบ ขึ้นเป็น exception ในไฟล์ 34 → บัญชี map Cost Center (ถ้าเป็น manual) → พร้อมรวมเข้า Accounting Pack (ไฟล์ 30/37)`

## 10. Security / Control Rules

- ห้ามแก้ไขยอดเงิน (`gross_amount`/`wht_amount`/`net_amount`) ในไฟล์นี้โดยตรง — เป็น snapshot จากไฟล์ 17 เท่านั้น ถ้าต้องแก้ต้องผ่าน Adjustment (ไฟล์ 20)
- แก้ไข Cost Center mapping ได้เฉพาะกรณี `manual` — `auto` แก้ไม่ได้ (ต้องไปแก้ที่ทีมของ payee ต้นทาง)

## 11. Validation & Error Handling

| Code / Scenario | Condition | System Behavior |
|---|---|---|
| EDIT_AMOUNT_DIRECTLY | พยายามแก้ยอดเงินตรงในไฟล์นี้ | reject พร้อมแนะนำ Adjustment |
| COST_CENTER_AUTO_EDIT | พยายามแก้ cost_center_id ของรายการที่ mapping_rule = auto | reject |

## 12. Permission Requirements

| Capability | Allowed Roles | Notes |
|---|---|---|
| ดู/map Cost Center | บัญชี | full (เฉพาะ manual mapping) |
| ดูทั้งหมด | การเงิน | read-only |

## 13. Audit Log Requirements

- การ map/เปลี่ยน Cost Center (manual) ต้อง audit

## 14. API / Integration Draft

| Method | Endpoint | Purpose |
|---|---|---|
| GET | /api/accounting/expenses | list |
| PATCH | /api/accounting/expenses/:id/cost-center | map cost center (เฉพาะ manual) |

## 15. Acceptance Criteria

- Expense Record sync ถูกต้องจาก Payout Batch ที่ completed เท่านั้น
- เอกสารไม่ครบขึ้น exception ในไฟล์ 34 ได้จริง

## 16. Test Cases

| Test Case | Steps | Expected Result |
|---|---|---|
| sync เฉพาะ completed | Payout Batch อยู่ที่ status file_generated (ยังไม่ completed) | ยังไม่ sync เข้าไฟล์นี้ |
| แก้ยอดตรง | พยายามแก้ net_amount ในไฟล์นี้ | reject EDIT_AMOUNT_DIRECTLY |

---

## 17. การตัดสินใจที่เกี่ยวข้อง (Decisions)

- **Expense Record sync จาก Payout Batch ที่ `completed` เท่านั้น** — บันทึกตามเงินที่จ่ายจริง ไม่ใช่ตามยอดอนุมัติ (§6.1, §9)
- **ห้ามแก้ไขยอดเงินในไฟล์นี้โดยตรงเด็ดขาด** ต้องผ่าน Adjustment (ไฟล์ 20) เท่านั้น (§10, §11)
- **Cost Center mapping แก้ไขได้เฉพาะ `manual`** — `auto` ต้องแก้ที่ทีมของ payee ต้นทาง (§10, §11)
- **เอกสารไม่ครบ (document_status=incomplete) ขึ้นเป็น exception ในไฟล์ 34 อัตโนมัติ** (§6.3, §9)

## 18. สิ่งที่ยังต้องตัดสินใจ (Open Items)

- ไม่มี Open Item ค้าง — โครงสร้างหลักอ้างอิงจากไฟล์ 17/34 ที่ชัดเจนแล้ว

---

*เอกสารนี้เป็นไฟล์ที่ 3 ในหมวด Accounting Module (30–37) ต่อจาก `31-accounting-sales-and-receipts.md` และก่อน `33-accounting-wht-data.md`*
